import test from 'node:test'
import assert from 'node:assert/strict'
import {faMinutes,fromHourMinuteInputs,toHourMinuteInputs,termTotals,allocationRatio,weekRows,poolTermTotals} from '../src/lib/termBudgetView.mjs'

test('exact minutes, negative remaining, zero, unset are distinct',()=>{
 assert.equal(faMinutes(null),'—')
 assert.match(faMinutes(0),/۰ دقیقه/)
 assert.match(faMinutes(-90),/−/)
 assert.equal(fromHourMinuteInputs('',0),null)
 assert.equal(fromHourMinuteInputs(1,59),119)
 assert.equal(fromHourMinuteInputs(1,60),null)
 assert.equal(fromHourMinuteInputs('abc',0),null)
 assert.equal(fromHourMinuteInputs(0,0),0)
 assert.deepEqual(toHourMinuteInputs(null),{hours:'',minutes:'0'})
 assert.deepEqual(toHourMinuteInputs(24660),{hours:'411',minutes:'0'})
})
test('partial quota is unknown rather than fictional 0 and worker slices hide remaining',()=>{
 const rows=[
  {unit:'library',approved_minutes:120,pending_minutes:75,unreported_estimate_minutes:30,allocated_minutes:600},
  {unit:'research',approved_minutes:90,pending_minutes:0,unreported_estimate_minutes:0,allocated_minutes:null},
 ]
 assert.deepEqual(termTotals(rows),{
  approved:210,pending:75,planned:30,allocated:null,remaining:null,allocationPartial:true,
 })
 assert.deepEqual(termTotals([{allocated_minutes:0,approved_minutes:35}],false),{
  approved:35,pending:0,planned:0,allocated:0,remaining:-35,allocationPartial:false,
 })
 assert.equal(termTotals([{allocated_minutes:600,approved_minutes:90}],true).remaining,null)
 assert.equal(allocationRatio(80,0),null)
 assert.equal(allocationRatio(900,600),100)
 assert.equal(allocationRatio(30,60),50)
})
test('weekly chart groups backend units without double counting',()=>{
 assert.deepEqual(weekRows([
  {week_start:'2030-01-05',unit:'library',approved_minutes:60},
  {week_start:'2030-01-05',unit:'research',approved_minutes:25},
  {week_start:'2030-01-12',unit:'library',approved_minutes:40},
 ]),[{date:'2030-01-05',minutes:85},{date:'2030-01-12',minutes:40}])
})

test('a combined library/research allowance is not counted twice',()=>{
 const units=[
  {unit:'library',approved_minutes:9000,allocated_minutes:null},
  {unit:'research',approved_minutes:4200,allocated_minutes:null},
  {unit:'public_relations',approved_minutes:3000,allocated_minutes:null},
 ]
 const pools=[
  {id:'combined',units:['library','research'],allocated_minutes:24660},
  {id:'pr',units:['public_relations'],allocated_minutes:6000},
 ]
 const whole=poolTermTotals(units,pools)
 assert.equal(whole.allocated,30660)
 assert.equal(whole.approved,16200)
 assert.equal(whole.remaining,14460)
 assert.equal(poolTermTotals(units,pools,{workerSlice:true}).remaining,null)
 assert.equal(poolTermTotals(units.slice(0,1),pools,{unitFilter:true}).remaining,null)
})
