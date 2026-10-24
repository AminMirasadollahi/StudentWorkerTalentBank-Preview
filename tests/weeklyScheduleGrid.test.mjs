import test from 'node:test'
import assert from 'node:assert/strict'
import {
 MAX_DAILY_WINDOWS,clockToMinutes,minutesToClock,
 selectedWeeklyWindows,validateDailyWindows,persianWeekBounds,suggestNextWindow,scopeSelfWorkRows
} from '../src/lib/weeklyScheduleGrid.mjs'

const entries=[
 {start:'08:00',end:'09:00'},{start:'11:00',end:'12:00'},
 {start:'16:00',end:'17:00'},{start:'21:00',end:'22:00'},
]
test('four independent windows total only actual presence; sorted chronologically',()=>{
 const actual=validateDailyWindows([...entries].reverse())
 assert.equal(MAX_DAILY_WINDOWS,4)
 assert.equal(actual.ok,true)
 assert.equal(actual.minutes,240)
 assert.deepEqual(actual.intervals,[
  {start:480,end:540},{start:660,end:720},
  {start:960,end:1020},{start:1260,end:1320},
 ])
})
test('deny five intervals, overlaps, same-time, negatives and cross-midnight',()=>{
 for(const values of [
  [...entries, {start:'22:30',end:'23:30'}],
  [{start:'08:00',end:'09:00'},{start:'08:45',end:'11:00'}],
  [{start:'08:00',end:'08:00'}],
  [{start:'22:00',end:'06:00'}],
  [{start:'25:00',end:'26:00'}],
  [{start:'08:xx',end:'09:00'}],
  [{start:'-1:00',end:'09:00'}],
 ]) assert.equal(validateDailyWindows(values).ok,false,JSON.stringify(values))
})
test('adjacent windows do not overlap; one ending at 24:00 is valid',()=>{
 assert.deepEqual(validateDailyWindows([
  {start:'08:00',end:'09:00'},{start:'09:00',end:'10:00'},
 ]).intervals,[{start:480,end:540},{start:540,end:600}])
 assert.equal(validateDailyWindows([{start:'21:00',end:'24:00'}]).minutes,180)
 assert.ok(Number.isNaN(clockToMinutes('24:00')))
 assert.equal(clockToMinutes('24:00',{end:true}),1440)
 assert.equal(minutesToClock(1440),'24:00')
})
test('empty weekly schedule yields unknown availability, not an unavailability marker',()=>{
 const x=validateDailyWindows([])
 assert.equal(x.ok,true)
 assert.deepEqual(x.intervals,[])
 assert.equal(x.minutes,0)
})
test('project only schedule effective on target date and for authorized worker identity',()=>{
 const slots=[
  {worker_id:'A',weekday_iso:6,valid_from:'2026-10-01',valid_until:'2026-10-20',
    start_minute:480,end_minute:540},
  {worker_id:'A',weekday_iso:6,valid_from:'2026-10-21',valid_until:null,
    start_minute:660,end_minute:720},
  {worker_id:'B',weekday_iso:6,valid_from:'2026-10-01',valid_until:null,
    start_minute:100,end_minute:200},
  {worker_id:'A',weekday_iso:5,valid_from:'2026-10-01',valid_until:null,
    start_minute:400,end_minute:500},
 ]
 assert.deepEqual(selectedWeeklyWindows(slots,'A',6,'2026-10-17'),[{start:'08:00',end:'09:00'}])
 assert.deepEqual(selectedWeeklyWindows(slots,'A',6,'2026-10-24'),[{start:'11:00',end:'12:00'}])
 assert.deepEqual(selectedWeeklyWindows(slots,'A',1,'2026-10-26'),[])
})

test('Iranian week runs Saturday-Friday, including cross-month boundaries',()=>{
 assert.deepEqual(persianWeekBounds('2026-10-17'),{start:'2026-10-17',end:'2026-10-23'})
 assert.deepEqual(persianWeekBounds('2026-10-20'),{start:'2026-10-17',end:'2026-10-23'})
 assert.deepEqual(persianWeekBounds('2026-10-23'),{start:'2026-10-17',end:'2026-10-23'})
 assert.deepEqual(persianWeekBounds('2026-10-24'),{start:'2026-10-24',end:'2026-10-30'})
 assert.throws(()=>persianWeekBounds('2026-02-31'))
})

test('adding up to four intervals proposes editable conflict-free hours',()=>{
 let slots=[]
 for(let i=0;i<4;i++){
   // Suggestions remain editable; they are not imposed by the backend.
   slots.push(suggestNextWindow(slots))
 }
 assert.deepEqual(slots,[
  {start:'08:00',end:'09:00'},
  {start:'10:00',end:'11:00'},
  {start:'12:00',end:'13:00'},
  {start:'14:00',end:'15:00'},
 ])
 assert.equal(validateDailyWindows(slots).ok,true)
 assert.deepEqual(suggestNextWindow([{start:'23:00',end:'24:00'}]),{start:'',end:''})
})

test('authenticated self RPC presence rows without worker_id render and remain owner-scoped',()=>{
 const original={
  tasks:[{id:'SELF-TASK',title:'Own task without owner key'},
    {id:'FOREIGN-TASK',worker_id:'OTHER'}],
  weekly_slots:[
   {weekday_iso:6,start_minute:480,end_minute:540,valid_from:'2026-10-01',valid_until:null},
   {weekday_iso:6,start_minute:600,end_minute:660,valid_from:'2026-10-01',valid_until:null,worker_id:'OTHER'},
  ],
  exceptions:[
   {local_date:'2026-10-18',kind:'unavailable'},
   {local_date:'2026-10-19',kind:'unavailable',worker_id:'OTHER'},
  ],
 }
 const self=scopeSelfWorkRows(original,'SELF')
 assert.deepEqual(self.tasks,[{id:'SELF-TASK',title:'Own task without owner key',worker_id:'SELF'}])
 assert.equal(original.tasks[0].worker_id,undefined,'RPC fixture must remain unchanged')
 assert.deepEqual(selectedWeeklyWindows(self.weekly_slots,'SELF',6,'2026-10-17'),
   [{start:'08:00',end:'09:00'}])
 assert.equal(self.weekly_slots.length,1,'explicit foreign worker record must not be re-labeled')
 assert.deepEqual(self.exceptions,[{local_date:'2026-10-18',kind:'unavailable',worker_id:'SELF'}])
 assert.equal(original.weekly_slots[0].worker_id,undefined,'server response remains immutable')
 assert.deepEqual(scopeSelfWorkRows({tasks:null,weekly_slots:null,exceptions:undefined},'SELF'),
   {tasks:[],weekly_slots:[],exceptions:[]})
 assert.throws(()=>scopeSelfWorkRows(null,'SELF'))
 assert.throws(()=>scopeSelfWorkRows(original,''))
})

test('self-work defensive scope removes explicitly foreign report entries, preserves missing-key self entries',()=>{
 const serverProjection={
  tasks:[{id:'self',worker_id:'SELF'},{id:'foreign',worker_id:'OTHER'}],
  weekly_slots:[],exceptions:[],
  time_entries:[
   {id:'e-self',worker_id:'SELF',reported_minutes:20},
   {id:'e-foreign',worker_id:'OTHER',reported_minutes:90},
   {id:'e-implicit',reported_minutes:30},
  ],
 }
 const original=JSON.stringify(serverProjection)
 const scoped=scopeSelfWorkRows(serverProjection,'SELF')
 assert.deepEqual(scoped.time_entries.map(e=>e.id),['e-self','e-implicit'])
 assert.ok(scoped.time_entries.every(e=>e.worker_id==='SELF'))
 assert.equal(JSON.stringify(serverProjection),original,'projection must not modify RPC result')
 assert.deepEqual(scopeSelfWorkRows({...serverProjection,time_entries:null},'SELF').time_entries,[])
})
