import test from 'node:test'
import assert from 'node:assert/strict'
import {projectWorkerReportActivity,summarizeWorkerReportActivity,WORKER_REPORT_VIEWS}
 from '../src/lib/workerReportActivity.mjs'
const tasks=[{id:'A',title:'کار مستند ساختگی'},{id:'B',title:'پژوهش نمونه'}]
const data=[
 {id:'E1',task_id:'A',work_date:'2026-10-18',review_state:'submitted',reported_minutes:60,approved_minutes:0},
 {id:'E2',task_id:'B',work_date:'2026-10-20',review_state:'changes_requested',reported_minutes:80,approved_minutes:0,review_note:'اصلاح مستندات'},
 {id:'E3',task_id:'A',work_date:'2026-10-22',review_state:'approved',reported_minutes:55,approved_minutes:40},
 {id:'E4',task_id:'B',work_date:'2026-10-21',review_state:'rejected',reported_minutes:25,approved_minutes:0,extra_time_reason_text:'علت واقعی ثبت‌شده در رکورد'},
]
test('history sorts by factual work date, not made-up submission/review timestamps',()=>{
 const original=JSON.stringify(data)
 const result=projectWorkerReportActivity(data,tasks)
 assert.deepEqual(result.map(e=>e.id),['E3','E4','E2','E1'])
 assert.equal(result[0].title,'کار مستند ساختگی')
 assert.equal(result[0].approved_minutes,40)
 assert.equal(result[1].approved_minutes,null,'rejected report has no approved-time credit')
 assert.equal(result[2].review_note,'اصلاح مستندات')
 assert.equal(JSON.stringify(data),original,'never mutate protected rows')
 assert.ok(result.every(e=>!('reviewed_at' in e)&&!('submitted_at' in e)),
   'never manufacture transition timestamps from work_date')
})
test('each status filter is an independent server-state view',()=>{
 assert.deepEqual(WORKER_REPORT_VIEWS,['all','submitted','changes_requested','rejected','approved'])
 assert.deepEqual(projectWorkerReportActivity(data,tasks,'approved').map(e=>e.id),['E3'])
 assert.deepEqual(projectWorkerReportActivity(data,tasks,'submitted').map(e=>e.id),['E1'])
 assert.deepEqual(projectWorkerReportActivity(data,tasks,'changes_requested').map(e=>e.id),['E2'])
 assert.deepEqual(projectWorkerReportActivity(data,tasks,'rejected').map(e=>e.id),['E4'])
 assert.equal(projectWorkerReportActivity(data,tasks,'invalid').length,data.length)
 assert.deepEqual(summarizeWorkerReportActivity(data),{
  all:4,submitted:1,changes_requested:1,rejected:1,approved:1
 })
})
test('malformed dates and missing optional text stay safe and do not fabricate values',()=>{
 const row={id:'X',task_id:'unknown',work_date:'bad',review_state:'submitted',
  reported_minutes:'not-a-number',approved_minutes:9999}
 const a=projectWorkerReportActivity([row],[])
 assert.equal(a[0].title,'گزارش کار')
 assert.equal(a[0].work_date,null)
 assert.equal(a[0].reported_minutes,null)
 assert.equal(a[0].approved_minutes,null)
 assert.equal(a[0].review_note,'')
 assert.deepEqual(projectWorkerReportActivity(null),[])
 assert.deepEqual(summarizeWorkerReportActivity(null),{
  all:0,submitted:0,changes_requested:0,rejected:0,approved:0
 })
})
