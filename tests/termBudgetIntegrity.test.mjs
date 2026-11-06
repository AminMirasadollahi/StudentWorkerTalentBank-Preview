import test from 'node:test'
import assert from 'node:assert/strict'
import {findTermBudgetIssues,termBudgetScopeText} from '../src/lib/termBudgetIntegrity.mjs'
import {poolTermTotals,faMinutes,weekRows} from '../src/lib/termBudgetView.mjs'

// Canonical real-world QUANTITIES only; these are synthetic rows,
// never real workers or private identifiers. 411h joint + 100h PR.
const unfiltered=()=>({
 ok:true,
 term:{id:'SYNTH-TERM',label:'نیمسال آزمایشی',state:'active'},
 units:[
  {unit:'library',approved_minutes:390,pending_minutes:0,unreported_estimate_minutes:60,allocated_minutes:null},
  {unit:'research',approved_minutes:150,pending_minutes:0,unreported_estimate_minutes:0,allocated_minutes:null},
  {unit:'public_relations',approved_minutes:0,pending_minutes:0,unreported_estimate_minutes:0,allocated_minutes:null},
 ],
 pools:[
  {id:'JOINT',label:'کتابخانه و پژوهش',units:['library','research'],
   allocated_minutes:24660,approved_minutes:540,pending_minutes:0,
   unreported_estimate_minutes:60,remaining_minutes:24120},
  {id:'PR',label:'روابط عمومی',units:['public_relations'],
   allocated_minutes:6000,approved_minutes:0,pending_minutes:0,
   unreported_estimate_minutes:0,remaining_minutes:6000},
 ],
 weeks:[{week_start:'2026-10-31',unit:'library',approved_minutes:390},
  {week_start:'2026-10-31',unit:'research',approved_minutes:150}],
 workers:[],
})
test('unfiltered groups counted ONCE and approved 9h leaves 502h',()=>{
 const d=unfiltered()
 const x=findTermBudgetIssues(d)
 assert.deepEqual(x,[])
 const t=poolTermTotals(d.units,d.pools)
 assert.equal(t.allocated,30660)
 assert.equal(t.approved,540)
 assert.equal(t.remaining,30120)
 assert.equal(faMinutes(t.remaining),'۵۰۲ ساعت')
 assert.equal(weekRows(d.weeks)[0].minutes,540)
 assert.match(termBudgetScopeText(),/گروه فقط یک بار/)
})
test('unit slice does not compare shared pool total with one-unit approved minutes',()=>{
 const d=unfiltered()
 d.units=d.units.filter(u=>u.unit==='library')
 d.pools=d.pools.filter(p=>p.units.includes('library'))
 d.weeks=d.weeks.filter(w=>w.unit==='library')
 assert.deepEqual(findTermBudgetIssues(d,{unitFilter:'library'}),[])
 const total=poolTermTotals(d.units,d.pools,{unitFilter:true})
 assert.equal(total.approved,390)
 assert.equal(total.remaining,null,'no fictitious whole-group remaining in unit slice')
 assert.match(termBudgetScopeText({unitFilter:'library'}),/همه واحدهای عضو/)
})
test('person slice uses individual contribution only, never shows group remaining',()=>{
 const d=unfiltered()
 d.units[0].approved_minutes=60
 d.units[1].approved_minutes=30
 d.pools[0].approved_minutes=90
 d.pools[0].remaining_minutes=null
 d.pools[1].remaining_minutes=null
 d.weeks=[{week_start:'2026-10-31',unit:'library',approved_minutes:60},
  {week_start:'2026-10-31',unit:'research',approved_minutes:30}]
 assert.deepEqual(findTermBudgetIssues(d,{workerId:'FAKE-WORKER'}),[])
 const t=poolTermTotals(d.units,d.pools,{workerSlice:true})
 assert.equal(t.approved,90)
 assert.equal(t.remaining,null)
 assert.match(termBudgetScopeText({workerId:'FAKE-WORKER'}),/نمای یک دانشجوکار/)
})
test('mismatched weekly and pooled approved minutes are warned about, never silently normalized',()=>{
 const d=unfiltered()
 d.weeks[0].approved_minutes=400
 let issues=findTermBudgetIssues(d)
 assert.ok(issues.some(i=>i.code==='week_unit_mismatch'))
 d.weeks[0].approved_minutes=390
 d.pools[0].approved_minutes=550
 issues=findTermBudgetIssues(d)
 assert.ok(issues.some(i=>i.code==='pool_unit_mismatch'))
 assert.ok(issues.some(i=>i.code==='wrong_pool_remaining'))
})
test('duplicate pool membership, hidden unit, and conflicting standalone quota are distinct errors',()=>{
 const d=unfiltered()
 d.pools[1].units.push('research')
 let issues=findTermBudgetIssues(d)
 assert.ok(issues.some(i=>i.code==='duplicate_pool_member'))
 d.pools[1].units.pop()
 d.units[0].allocated_minutes=600
 issues=findTermBudgetIssues(d)
 assert.ok(issues.some(i=>i.code==='overlapping_allocations'))
 d.units[0].allocated_minutes=null
 d.units=d.units.filter(u=>u.unit!=='research')
 issues=findTermBudgetIssues(d)
 assert.ok(issues.some(i=>i.code==='missing_member_unit'))
})
test('zero quota is legitimate; unknown, negative and non-integer source time are not',()=>{
 const d=unfiltered()
 d.pools[1].allocated_minutes=0
 d.pools[1].remaining_minutes=0
 assert.deepEqual(findTermBudgetIssues(d),[])
 d.pools[1].allocated_minutes=null
 assert.ok(findTermBudgetIssues(d).some(i=>i.code==='invalid_allocation'))
 const bad=unfiltered()
 bad.units[2].approved_minutes=-20
 assert.ok(findTermBudgetIssues(bad).some(i=>i.code==='invalid_unit_minutes'))
 bad.units[2].approved_minutes=0
 bad.weeks[0].approved_minutes=2.5
 assert.ok(findTermBudgetIssues(bad).some(i=>i.code==='invalid_week_minutes'))
})
test('unknown active term or a legitimately empty dataset does not fabricate budget usage',()=>{
 assert.deepEqual(findTermBudgetIssues(null),[])
 assert.deepEqual(findTermBudgetIssues({ok:true,term:null,units:[],pools:[],weeks:[]}),[])
 const d=unfiltered()
 d.units=[]
 assert.ok(findTermBudgetIssues(d).some(i=>i.code==='missing_units'))
})
