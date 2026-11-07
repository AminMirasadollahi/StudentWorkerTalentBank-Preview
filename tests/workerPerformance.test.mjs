import test from 'node:test'
import assert from 'node:assert/strict'
import {filterPerformanceByWorkDate,projectWorkerPerformance}
 from '../src/lib/workerPerformance.mjs'
import {projectWorkerReportActivity} from '../src/lib/workerReportActivity.mjs'

const tasks=[
 {id:'a',unit:'library',state:'completed',title:'کتابخانه'},
 {id:'b',unit:'research',state:'completed',title:'پژوهش'},
 {id:'c',unit:'pr',state:'assigned',title:'روابط عمومی'},
]
const raw=[
 {id:'1',task_id:'a',work_date:'2026-03-20',review_state:'approved',approved_minutes:0,reported_minutes:10},
 {id:'2',task_id:'a',work_date:'2026-03-21',review_state:'approved',approved_minutes:35,reported_minutes:40},
 {id:'3',task_id:'b',work_date:'2026-04-05',review_state:'approved',approved_minutes:65,reported_minutes:80},
 {id:'4',task_id:'c',work_date:'2026-04-06',review_state:'submitted',approved_minutes:null,reported_minutes:90},
 {id:'5',task_id:'a',work_date:'2026-04-10',review_state:'changes_requested',approved_minutes:null,reported_minutes:30},
]
const rows=projectWorkerReportActivity(raw,tasks)

test('authorized self projection counts distinct completed tasks, not report rows',()=>{
 const snapshot=JSON.stringify(rows)
 const v=projectWorkerPerformance(rows,tasks)
 assert.equal(v.reportCount,5)
 assert.equal(v.approvedReportCount,3)
 assert.equal(v.approvedMinutes,100)
 assert.equal(v.pendingCount,1)
 assert.equal(v.changesRequestedCount,1)
 assert.equal(v.completedTaskCount,2)
 assert.equal(v.missingTaskCount,0)
 assert.deepEqual(v.byUnit.map(x=>[x.unit,x.minutes]),[['research',65],['library',35]])
 assert.equal(v.byMonth.length,2,'Nowruz changes Persian month and year; April is still Farvardin')
 assert.equal(v.byMonth.reduce((a,x)=>a+x.minutes,0),100)
 assert.equal(JSON.stringify(rows),snapshot,'never mutate a protected row')
})

test('QA approved zero is a real zero; rejected/submitted is never credit',()=>{
 const qa=projectWorkerPerformance(projectWorkerReportActivity([
  {id:'q',task_id:'a',work_date:'2026-11-07',review_state:'approved',
   reported_minutes:10,approved_minutes:0},
  {id:'pending',task_id:'c',work_date:'2026-11-07',review_state:'submitted',
   reported_minutes:20,approved_minutes:999}
 ],tasks),tasks)
 assert.equal(qa.approvedMinutes,0)
 assert.equal(qa.approvedReportCount,1)
 assert.equal(qa.pendingCount,1)
 assert.equal(qa.byUnit.find(x=>x.unit==='library').minutes,0)
})

test('missing approved minutes must invalidate total and chart, not become zero',()=>{
 const r=projectWorkerReportActivity([
  {id:'bad',task_id:'a',work_date:'2026-10-12',review_state:'approved',approved_minutes:null}
 ],tasks)
 const s=projectWorkerPerformance(r,tasks)
 assert.equal(s.approvedMinutes,null)
 assert.equal(s.missingApprovedCount,1)
 assert.deepEqual(s.byMonth,[])
 assert.deepEqual(s.byUnit,[])
})

test('invalid and reversed dates have explicit invalid state; valid ISO is inclusive',()=>{
 assert.equal(filterPerformanceByWorkDate(rows,'2026-04-07','2026-04-01').invalidRange,true)
 assert.equal(filterPerformanceByWorkDate(rows,'2026-02-30','').invalidRange,true)
 assert.deepEqual(filterPerformanceByWorkDate(rows,'2026-03-21','2026-04-05')
  .rows.map(r=>r.id),['3','2'])
 assert.equal(filterPerformanceByWorkDate(rows,'','').rows.length,5)
 const unknowndate=projectWorkerReportActivity([{
  id:'bad_date',task_id:'b',work_date:'bad',review_state:'approved',approved_minutes:1
 }],tasks)
 assert.equal(projectWorkerPerformance(unknowndate,tasks).missingWorkDateCount,1)
 assert.equal(filterPerformanceByWorkDate(unknowndate,'2026-01-01','').rows.length,0)
})

test('task join missing unit is diagnosed, never attributed to admission unit',()=>{
 const r=projectWorkerReportActivity([{
  id:'missing',task_id:'unknown',work_date:'2026-11-07',review_state:'approved',approved_minutes:12
 }],tasks)
 const result=projectWorkerPerformance(r,tasks)
 assert.equal(result.approvedMinutes,12)
 assert.equal(result.missingUnitCount,1)
 assert.equal(result.missingTaskCount,1)
 assert.deepEqual(result.byUnit,[])
})
