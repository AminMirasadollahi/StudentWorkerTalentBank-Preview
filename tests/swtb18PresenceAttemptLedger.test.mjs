import test from 'node:test'
import assert from 'node:assert/strict'
import {
 canonicalPresencePayload,createPresenceAttemptLedger,interpretPresenceReceipt,
 workerPresenceItems,managerPresenceItems,
} from '../src/lib/presenceChanges.mjs'
const uids=[
 '11111111-1111-4111-8111-111111111111',
 '22222222-2222-4222-8222-222222222222',
]
const base={workerId:'worker-a',date:'2026-11-20',action:'set_exception',
 kind:'replacement_intervals',intervals:[{start:600,end:700},{start:480,end:550}],
 note:'توضیح',reason:'تغییر ساعات با هماهنگی'}
test('same canonical payload shares safe UUID even if interval order differs',()=>{
 let calls=0
 const ledger=createPresenceAttemptLedger(()=>uids[calls++])
 const a=ledger.get(base)
 const b=ledger.get({...base,intervals:base.intervals.slice().reverse()})
 assert.equal(a,b)
 assert.equal(calls,1)
})
test('changed worker, date, action or reason creates an independent UUID',()=>{
 let calls=0
 const ledger=createPresenceAttemptLedger(()=>uids[calls++])
 assert.equal(ledger.get(base),uids[0])
 assert.equal(ledger.get({...base,workerId:'worker-b'}),uids[1])
})
test('known receipt clears the attempt, uncertain result retains it',()=>{
 let calls=0
 const ledger=createPresenceAttemptLedger(()=>uids[calls++])
 assert.equal(ledger.get(base),uids[0])
 assert.equal(ledger.get(base),uids[0])
 ledger.acknowledge(base)
 assert.equal(ledger.get(base),uids[1])
})
test('inherit-weekly request always sends null kind and empty windows',()=>{
 const payload=canonicalPresencePayload({...base,action:'inherit_weekly'})
 assert.equal(payload.kind,null)
 assert.deepEqual(payload.intervals,[])
 assert.equal(payload.note,null)
})
test('pending cannot be displayed as effective',()=>{
 const r=interpretPresenceReceipt({ok:true,request_id:uids[0],
  status:'pending',effective:true})
 assert.equal(r.effective,false)
 assert.match(r.message,/در انتظار/)
})
test('malformed and unauthorized response scopes fail closed',()=>{
 assert.throws(()=>interpretPresenceReceipt({ok:true,status:'other'}))
 assert.throws(()=>workerPresenceItems({ok:true,scope:'manager',items:[]},'a'))
 assert.throws(()=>workerPresenceItems({ok:true,scope:'my_worker',
   items:[{worker_id:'other'}]},'a'))
 assert.throws(()=>managerPresenceItems({ok:true,scope:'my_worker',items:[]}))
})
