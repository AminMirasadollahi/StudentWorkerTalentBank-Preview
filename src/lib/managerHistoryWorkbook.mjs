import {
 MANAGER_HISTORY_COLUMNS,managerHistoryExcelRows,safeExcelText,
} from './managerHistoryExport.mjs'

// Create a workbook from the SAME already-scoped manager projection as the UI.
// No HTTP/database access, workbook download, or spreadsheet calculations here.
export function buildManagerHistoryWorkbook(ExcelJS,projection,metadata=[]){
 const Workbook=ExcelJS.Workbook||ExcelJS.default?.Workbook
 if(typeof Workbook!=='function')throw Error('XLSX_WRITER_UNAVAILABLE')
 const wb=new Workbook()
 wb.creator='Student Worker Talent Bank / Management'
 wb.subject='Scope-limited authorized manager work and hours history'
 wb.calcProperties.fullCalcOnLoad=false
 const cover=wb.addWorksheet('دامنه و جمع‌بندی',{views:[{rightToLeft:true}]})
 cover.columns=[
  {header:'شاخص یا دامنه',key:'metric',width:43},
  {header:'مقدار یا توضیح',key:'value',width:86},
 ]
 const summary=projection.summary
 const totals=[
  ['تعداد وظیفه‌های موجود در نتایج',summary.taskCount],
  ['تعداد گزارش‌های موجود در نتایج',summary.reportCount],
  ['گزارش‌های تأییدشده',summary.approvedReportCount],
  ['گزارش‌های منتظر بررسی',summary.pendingReportCount],
  ['کارهای بدون گزارش',summary.unreportedTaskCount],
  ['گزارش با کار مرتبط نامشخص',summary.orphanReportCount],
  ['گزارش با داده زمانی نیازمند بررسی',summary.invalidMinutesCount],
  ['جمع زمان تأییدشده در همین نتایج (دقیقه)',
    summary.invalidMinutesCount?'نیازمند بررسی صحت داده‌ها':summary.approvedMinutes],
 ]
 for(const [metric,value] of totals){
  cover.addRow({metric:safeExcelText(metric),value:typeof value==='number'?value:safeExcelText(value)})
 }
 cover.addRow({metric:'— توضیحات دامنه و روش شمارش —',value:''})
 for(const [metric,value] of metadata){
  cover.addRow({metric:safeExcelText(metric),value:safeExcelText(value)})
 }
 const sh=wb.addWorksheet('ریز سوابق',{views:[{rightToLeft:true}]})
 sh.columns=MANAGER_HISTORY_COLUMNS.map(([header,key,width])=>({header,key,width}))
 for(const row of managerHistoryExcelRows(projection))sh.addRow(row)
 sh.autoFilter={
  from:{row:1,column:1},
  to:{row:Math.max(2,sh.rowCount),column:MANAGER_HISTORY_COLUMNS.length},
 }
 sh.views=[{state:'frozen',ySplit:1,rightToLeft:true}]
 cover.views=[{state:'frozen',ySplit:1,rightToLeft:true}]
 for(const sheet of [cover,sh]){
  const head=sheet.getRow(1)
  head.font={bold:true,color:{argb:'FFFFFFFF'}}
  head.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF153E5C'}}
  head.alignment={vertical:'middle',wrapText:true}
  head.height=31
  for(let i=2;i<=sheet.rowCount;i++){
   const row=sheet.getRow(i)
   row.alignment={vertical:'top',wrapText:true}
   if(i%2===0)row.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFF3F8F9'}}
   if(sheet===cover)row.height=34
  }
 }
 // Keep minute quantities numeric, never formatted as freeform strings or
 // presented as approved when the report has not actually been approved.
 for(const col of [6,7,8])sh.getColumn(col).numFmt='0'
 // Separate summary is not a period-balance sheet and must never imply that
 // this filtered/possibly bounded operational list equals lifetime totals.
 return wb
}
