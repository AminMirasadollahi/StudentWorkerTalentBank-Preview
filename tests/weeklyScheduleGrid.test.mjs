import test from 'node:test'
import assert from 'node:assert/strict'
import {
 MAX_DAILY_WINDOWS,clockToMinutes,minutesToClock,
 selectedWeeklyWindows,validateDailyWindows,persianWeekBounds
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
