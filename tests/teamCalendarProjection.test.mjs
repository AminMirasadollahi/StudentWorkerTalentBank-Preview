import test from 'node:test'
import assert from 'node:assert/strict'
import {projectTeamDay,projectTeamCalendarDays} from '../src/lib/teamCalendarProjection.mjs'
import {persianMonthCells,plusIsoDays} from '../src/lib/persianMonthCalendar.mjs'

const workers=[
 {id:'a',name:'دانشجوکار الف',state:'active',unit:'library',email:'never expose'},
 {id:'b',name:'دانشجوکار ب',state:'active',unit:'research'},
 {id:'c',name:'دانشجوکار ج',state:'active',unit:'public_relations'},
 {id:'paused',name:'تعلیق',state:'paused',unit:'library'},
]
const saturday='2026-10-17'
const sunday='2026-10-18'
const monday='2026-10-19'
const base={
 workers,
 weekly_slots:[
  {worker_id:'a',weekday_iso:6,valid_from:'2026-10-01',valid_until:null,
   start_minute:480,end_minute:540},
  {worker_id:'b',weekday_iso:6,valid_from:'2026-10-01',valid_until:'2026-10-20',
   start_minute:540,end_minute:660},
  {worker_id:'paused',weekday_iso:6,valid_from:'2026-10-01',valid_until:null,
   start_minute:480,end_minute:540},
 ],
 exceptions:[
  {worker_id:'a',local_date:saturday,kind:'replacement_intervals',
   intervals:[{start:600,end:660}],note:'PRIVATE_NOTES_SHOULD_NOT_ESCAPE'},
  {worker_id:'b',local_date:sunday,kind:'unavailable',intervals:[],note:'SENSITIVE'},
 ],
 tasks:[
  {id:'TASK-A',worker_id:'a',planned_date:saturday,title:'ثبت منابع',
   unit:'research',state:'assigned',estimate_minutes:30,
   instructions:'PRIVATE_INSTRUCTIONS',review_note:'PRIVATE_REVIEW'},
  {id:'TASK-B',worker_id:'c',planned_date:saturday,title:'اطلاع‌رسانی',
   unit:'public_relations',state:'submitted',estimate_minutes:60},
  {id:'TASK-DONE',worker_id:'b',planned_date:sunday,title:'کار لغوشده',
   unit:'research',state:'cancelled'},
  {id:'TASK-PAUSED',worker_id:'paused',planned_date:saturday,title:'نباید دیده شود',
   unit:'library',state:'assigned'},
 ],
 time_entries:[{approved_minutes:999999,private_note:'Do not expose'}],
}

test('team day: date exception supersedes weekly hours; cross-unit task keeps actual task unit',()=>{
 const day=projectTeamDay(base,saturday)
 assert.equal(day.workerCount,3)
 assert.equal(day.plannedWorkers,2)
 assert.equal(day.assignedWorkers,2)
 assert.equal(day.taskCount,2)
 assert.equal(day.unknownWorkers,1)
 assert.equal(day.explicitlyUnavailable,0)
 const a=day.people.find(p=>p.workerId==='a')
 assert.equal(a.kind,'replacement')
 assert.deepEqual(a.windows,[{start:'10:00',end:'11:00'}])
 assert.equal(a.tasks[0].unit,'research','task unit is not worker signup unit')
 assert.equal(a.tasks[0].title,'ثبت منابع')
 const b=day.people.find(p=>p.workerId==='b')
 assert.equal(b.kind,'weekly')
 assert.deepEqual(b.windows,[{start:'09:00',end:'11:00'}])
})
test('missing weekly slots mean unknown, even if worker has scheduled task',()=>{
 const day=projectTeamDay(base,saturday)
 const c=day.people.find(p=>p.workerId==='c')
 assert.equal(c.kind,'unknown')
 assert.equal(c.hasPlan,false)
 assert.equal(c.hasTask,true)
 assert.equal(c.tasks.length,1)
 assert.equal(day.plannedWorkers,2)
 assert.equal(day.assignedWorkers,2)
})
test('explicit unavailability overrides all weekly data but cannot cancel an assigned task',()=>{
 const day=projectTeamDay(base,sunday)
 assert.equal(day.people.find(x=>x.workerId==='b').kind,'unavailable')
 assert.equal(day.explicitlyUnavailable,1)
 assert.equal(day.taskCount,0,'cancelled task must not count as active')
})
test('inactive/paused identities and confidential columns are never projected',()=>{
 const day=projectTeamDay(base,saturday)
 assert.ok(!day.people.some(x=>x.workerId==='paused'))
 const asText=JSON.stringify(day)
 for(const text of ['PRIVATE_NOTES_SHOULD_NOT_ESCAPE','PRIVATE_INSTRUCTIONS',
  'PRIVATE_REVIEW','999999','never expose','SENSITIVE'])assert.equal(asText.includes(text),false)
 assert.equal(base.tasks[0].instructions,'PRIVATE_INSTRUCTIONS','no mutation')
})
test('weekly template effective boundaries and exact date-scoped matching',()=>{
 const after=projectTeamDay(base,'2026-10-24')
 assert.equal(after.people.find(p=>p.workerId==='b').kind,'unknown')
 assert.equal(after.people.find(p=>p.workerId==='a').kind,'weekly')
 const before=projectTeamDay(base,'2026-09-26')
 assert.equal(before.plannedWorkers,0)
})
test('Persian month projects at most 42 date cells, never treats blank cells as dates',()=>{
 const month=persianMonthCells('2026-10-17')
 const rows=projectTeamCalendarDays(base,month.days)
 assert.equal(rows.length,month.days.filter(Boolean).length)
 assert.ok(rows.length>=29&&rows.length<=31)
 assert.equal(rows[0].date,month.start)
 assert.equal(rows.at(-1).date,month.end)
 assert.ok(rows.every(r=>typeof r.plannedWorkers==='number'))
})
test('invalid date, oversized batch or arbitrary interpolation fails closed',()=>{
 assert.throws(()=>projectTeamDay(base,'2026-02-30'),/invalid_team_calendar_day/)
 assert.throws(()=>projectTeamCalendarDays(base,Array(43).fill(saturday)),/invalid_calendar_range/)
 assert.equal(plusIsoDays('2026-12-31',1),'2027-01-01')
})
