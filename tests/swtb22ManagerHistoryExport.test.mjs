import test from 'node:test'
import assert from 'node:assert/strict'
import {
 safeExcelText,managerHistoryProjection,managerHistoryExportMetadata,
 managerHistoryExcelRows,MANAGER_HISTORY_COLUMNS,
} from '../src/lib/managerHistoryExport.mjs'
import {buildManagerHistoryWorkbook} from '../src/lib/managerHistoryWorkbook.mjs'
import {scopeWorkerHistory,filterWorkerHistory} from '../src/lib/workerHistory.js'

const fake=()=>({
 workers:[
  {id:'QA-W1',name:'دانشجوکار کتابخانه',unit:'research'},
  {id:'QA-W2',name:'دانشجوکار پژوهش',unit:'library'},
 ],
 tasks:[
  {id:'QA-T1',worker_id:'QA-W1',unit:'library',
   title:'=HYPERLINK("https://invalid.example","bad")',
   estimate_minutes:60,planned_date:'2026-11-02'},
  {id:'QA-T2',worker_id:'QA-W2',unit:'research',
   title:'کار نمونه بدون گزارش',estimate_minutes:90,planned_date:'2026-11-04'},
  {id:'QA-T3',worker_id:'QA-W2',unit:'research',
   title:'پیگیری نمونه',estimate_minutes:30,planned_date:'2026-11-04'},
 ],
 time_entries:[
  {id:'QA-E1',task_id:'QA-T1',worker_id:'QA-W1',work_date:'2026-11-05',
   reported_minutes:75,approved_minutes:null,review_state:'submitted',
   worker_note:'=2+3',extra_time_reason_code:'equipment_issue',
   extra_time_reason_text:'@CALL("unsafe")'},
  {id:'QA-E2',task_id:'QA-T1',worker_id:'QA-W1',work_date:'2026-11-06',
   reported_minutes:60,approved_minutes:45,review_state:'approved',
   review_note:'+SUM(A1:A5)'},
  {id:'QA-E3',task_id:'QA-T3',worker_id:'QA-W2',work_date:'2026-11-06',
   reported_minutes:30,approved_minutes:30,review_state:'approved'},
  {id:'QA-ORPHAN',task_id:'MISSING',worker_id:'QA-W2',
   work_date:'2026-11-06',reported_minutes:20,approved_minutes:20,
   review_state:'approved'},
 ],
})
const opts={
 unitLabels:{library:'کتابخانه',research:'پژوهش'},
 reviewLabels:{submitted:'منتظر بررسی',approved:'تأییدشده'},
 extraTimeReasons:{equipment_issue:'مشکل تجهیزات'},
 dateLabel:s=>'تاریخ '+s,
}
test('approved totals exclude submitted duration and task estimates; orphan remains visible',()=>{
 const source=fake(),before=JSON.stringify(source)
 const p=managerHistoryProjection(source,opts)
 assert.equal(p.summary.taskCount,3)
 assert.equal(p.summary.reportCount,4)
 assert.equal(p.summary.approvedReportCount,3)
 assert.equal(p.summary.pendingReportCount,1)
 assert.equal(p.summary.approvedMinutes,95,'45+30+20, NOT pending 75 or task estimates')
 assert.equal(p.summary.unreportedTaskCount,1)
 assert.equal(p.summary.orphanReportCount,1)
 assert.equal(p.summary.invalidMinutesCount,0)
 assert.equal(p.records.length,5)
 assert.equal(p.reportRows[0].date,'2026-11-06')
 assert.equal(p.records.at(-1).kind,'unreported')
 assert.equal(p.reportRows.find(x=>x.reportId==='QA-E1').approvedMinutes,null)
 assert.equal(p.reportRows.find(x=>x.reportId==='QA-ORPHAN').unit,'واحد کار نامشخص',
  'never silently substitute enrollment unit for missing task')
 assert.equal(JSON.stringify(source),before,'projection cannot mutate manager-authorized data')
})
test('worker/unit/date/report filters are EXACTLY the same for UI projection and export',()=>{
 const source=scopeWorkerHistory(fake(),'QA-W1')
 const filtered=filterWorkerHistory(source,{
  unit:'library',from:'2026-11-05',to:'2026-11-05',review:'submitted',
 })
 const p=managerHistoryProjection(filtered,opts)
 assert.equal(p.summary.reportCount,1)
 assert.equal(p.summary.approvedMinutes,0)
 assert.equal(p.records[0].reportId,'QA-E1')
 assert.equal(p.records[0].unit,'کتابخانه')
 const rows=managerHistoryExcelRows(p)
 assert.equal(rows.length,1)
 assert.equal(rows[0].approvedMinutes,null)
 assert.equal(rows[0].requestedMinutes,75)
 assert.equal(rows[0].workerNote,"'=2+3")
 assert.match(rows[0].taskTitle,/^'=/)
 const meta=managerHistoryExportMetadata({
  workerId:'QA-W1',unit:'library',from:'2026-11-05',to:'2026-11-05',review:'submitted',
 },{workers:filtered.workers,...opts})
 assert.match(JSON.stringify(meta),/کتابخانه/)
 assert.match(JSON.stringify(meta),/تاریخ 2026-11-05/)
})
test('all unknown linked task / invalid approved data surfaces explicit data quality warning',()=>{
 const source=fake()
 source.time_entries[1].approved_minutes=610
 const p=managerHistoryProjection(source,opts)
 assert.equal(p.summary.invalidMinutesCount,1)
 assert.equal(p.reportRows.find(x=>x.reportId==='QA-E2').invalidMinutes,true)
 const absent=fake()
 absent.time_entries[3].reported_minutes='some text'
 const q=managerHistoryProjection(absent,opts)
 assert.equal(q.summary.invalidMinutesCount,1)
 assert.equal(q.reportRows.find(x=>x.reportId==='QA-ORPHAN').requestedMinutes,null)
})
test('text cells remain data, never formulas or silently formatted as numeric minutes',async()=>{
 assert.equal(safeExcelText(' =2+3'),"' =2+3")
 assert.equal(safeExcelText('-2'),"'-2")
 assert.equal(safeExcelText('+SUM(1,2)'),"'+SUM(1,2)")
 assert.equal(safeExcelText('@malicious'),"'@malicious")
 assert.equal(safeExcelText('متن عادی'),'متن عادی')
 const ExcelJS=await import('exceljs')
 const source=fake(),projection=managerHistoryProjection(source,opts)
 const metadata=managerHistoryExportMetadata({}, {workers:source.workers,...opts})
 const workbook=buildManagerHistoryWorkbook(ExcelJS,projection,metadata)
 assert.deepEqual(workbook.worksheets.map(x=>x.name),['دامنه و جمع‌بندی','ریز سوابق'])
 assert.equal(workbook.getWorksheet(2).rowCount,projection.records.length+1)
 assert.equal(workbook.getWorksheet(2).columnCount,MANAGER_HISTORY_COLUMNS.length)
 const buffer=await workbook.xlsx.writeBuffer()
 const verify=new ExcelJS.Workbook()
 await verify.xlsx.load(buffer)
 const sheet=verify.getWorksheet('ریز سوابق')
 const actual=[]
 sheet.eachRow((row,index)=>{
  if(index===1)return
  actual.push({
   name:row.getCell(2).value,
   task:row.getCell(4).value,
   requested:row.getCell(7).value,
   approved:row.getCell(8).value,
   note:row.getCell(12).value,
   decision:row.getCell(13).value,
  })
 })
 assert.equal(actual.length,5)
 assert.equal(actual.filter(x=>typeof x.approved==='number')
  .reduce((sum,x)=>sum+x.approved,0),95)
 assert.equal(actual.filter(x=>typeof x.requested==='number').length,4)
 assert.equal(actual.find(x=>String(x.task).includes('HYPERLINK')).task.startsWith("'="),true)
 assert.equal(actual.find(x=>x.note)?.note,"'=2+3")
 assert.equal(actual.find(x=>x.decision)?.decision,"'+SUM(A1:A5)")
 for(const row of actual){
  assert.equal(typeof row.task==='object'&&row.task?.formula!==undefined,false)
  assert.equal(typeof row.note==='object'&&row.note?.formula!==undefined,false)
 }
 const summary=verify.getWorksheet('دامنه و جمع‌بندی')
 const total=[...summary._rows].filter(Boolean)
   .find(row=>row.getCell(1).value==='جمع زمان تأییدشده در همین نتایج (دقیقه)')
 assert.equal(total?.getCell(2).value,95)
 assert.equal(sheet.views[0].rightToLeft,true)
})
