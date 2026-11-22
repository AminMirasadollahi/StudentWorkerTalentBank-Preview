import test from 'node:test'
import assert from 'node:assert/strict'
import {addDays,durationFa,isISODate,workPackagePayload,shareOptions,selectedDayAllowed}
 from '../src/lib/workPoolUnifiedV1.mjs'

const active={id:'term-a',state:'active',start_date:'2026-09-23',end_date:'2027-02-09'}
const base={
 unit:'library',title:'ثبت مشخصات قفسه‌های کتابخانه',
 description:'ثبت عنوان‌ها و خروجی قابل بررسی برای قفسه‌های کتابخانه',
 totalMinutes:'240',dateMode:'single',startDate:'2026-11-27',endDate:'2026-11-27',
 allocationMode:'fixed',shareMinutes:'120',maxPeople:'',priority:'3',
 minShareMinutes:'30',maxShareMinutes:'120',shareStepMinutes:'30',
 instructions:'',claimDeadline:'',
}
const build=(change={},term=active)=>workPackagePayload({...base,...change},
 term.id,'2026-11-22',term)

test('one-day 240m fixed budget needs two shares and keeps dates single',()=>{
 const x=build()
 assert.equal(x.estimatedPeople,2)
 assert.equal(x.payload.endDate,'2026-11-27')
 assert.equal(x.payload.shareMinutes,120)
 assert.equal(x.payload.maxPeople,null)
 assert.equal(x.payload.totalMinutes,240)
})
test('range is manager-controlled, dates remain ISO at API boundary',()=>{
 const x=build({dateMode:'range',endDate:'2026-12-05'})
 assert.equal(x.payload.endDate,'2026-12-05')
 assert.equal(x.payload.startDate,'2026-11-27')
 assert.equal(isISODate('2026-02-30'),false)
 assert.equal(addDays('2026-11-27',2),'2026-11-29')
})
test('manager cannot bypass term or +2-day gate through client',()=>{
 assert.throws(()=>build({startDate:'2026-11-23'}),/تاریخ/)
 assert.throws(()=>build({dateMode:'range',endDate:'2027-02-10'}),/تاریخ/)
 assert.throws(()=>build({dateMode:'range',endDate:'2026-11-26'}),/تاریخ/)
})
test('a fixed effort cap cannot strand a budget under max people',()=>{
 assert.throws(()=>build({maxPeople:'1'}),/حداکثر ۲۰ نفر/)
 assert.throws(()=>build({shareMinutes:'0'}),/سهم هر نفر/)
})
test('choice mode requires compatible min/max/step and sufficient slots',()=>{
 const x=build({allocationMode:'choice',minShareMinutes:'30',maxShareMinutes:'120',
  shareStepMinutes:'30'})
 assert.equal(x.payload.allocationMode,'choice')
 assert.equal(x.payload.shareMinutes,null)
 assert.equal(x.payload.minShareMinutes,30)
 assert.throws(()=>build({allocationMode:'choice',shareStepMinutes:'35'}),/سازگار/)
 assert.throws(()=>build({allocationMode:'choice',maxPeople:'1'}),/سازگار/)
})
test('server-compatible share options cannot strand a subminimum remainder',()=>{
 const o={allocation_mode:'choice',remaining_minutes:150,min_share_minutes:60,
  max_share_minutes:120,share_step_minutes:30}
 assert.deepEqual(shareOptions(o),[60,90])
 assert.deepEqual(shareOptions({...o,remaining_minutes:120}),[60,120])
 assert.deepEqual(shareOptions({...o,remaining_minutes:30}),[])
})
test('fixed share includes a shorter last share without exceeding remainder',()=>{
 const o={allocation_mode:'fixed',remaining_minutes:30,min_share_minutes:120,
  max_share_minutes:120,share_step_minutes:1}
 assert.deepEqual(shareOptions(o),[30])
 assert.equal(durationFa(120),'۲ ساعت')
 assert.equal(durationFa(0),'۰ دقیقه')
})
test('student chooses one valid day within range and at least two days ahead',()=>{
 const offer={date:'2026-11-27',end_date:'2026-12-03'}
 assert.equal(selectedDayAllowed('2026-12-01',offer,'2026-11-22'),true)
 assert.equal(selectedDayAllowed('2026-11-26',offer,'2026-11-22'),false)
 assert.equal(selectedDayAllowed('2026-12-04',offer,'2026-11-22'),false)
});
