import test from 'node:test'
import assert from 'node:assert/strict'
import {createDayBatchSharedManager} from '../src/lib/dayBatchSharedManager.mjs'
const id=n=>'20000000-0000-4000-8000-'+String(n).padStart(12,'0')
const actor=id(1),worker=id(2),term=id(3)
const context={today:'2026-11-27',term:{id:term,state:'active',start_date:'2026-09-23',end_date:'2027-02-09'},workers:[{id:worker,state:'active'}],data:{tasks:[],weekly_slots:[],exceptions:[]}}
const row={id:'r1',title:'کار نمونه',instructions:'شرح',minutes:45,mode:'independent',workerIds:[worker],date:null,unit:null,reason:null,prerequisiteIds:[]}
const draft={termId:term,defaults:{date:'2026-12-01',unit:'library',reason:''},rows:[row]}
const direct={kind:'direct',workerIds:[worker],unit:'library',title:'کار مستقیم',instructions:'شرح',date:'2026-12-01',minutes:45,startMinute:null,endMinute:null,reason:null,prerequisiteIds:[]}
const defer=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {resolve,promise}}
const shiftId=id(91),taskId=id(92),day='2026-11-28'
const shift={id:shiftId,task_id:taskId,worker_id:worker,shift_date:day,start_minute:480,end_minute:540,state:'scheduled'}
const cancelDraft={shiftId,reason:'دلیل نمونه'}
const cancelContext={day,shifts:{ok:true,from:day,to:day,shifts:[shift]},work:{tasks:[{id:taskId,worker_id:worker,unit:'library',planned_date:day,estimate_minutes:60,state:'assigned'}],time_entries:[]}}
function fixture(initial=null){
 let active=initial,epoch=7,seq=20,fail=null,hold=null,calls=[]
 const run=async(route,a)=>{
  const action=a.p_action;calls.push([route,action,a])
  if(hold?.route===route&&hold.action===action){const h=hold;hold=null;await h.wait.promise}
  if(fail?.route===route&&fail.action===action&&fail.before){fail=null;throw Error('LOST')}
  if(action==='reserve'){
   if(active)throw Error('ACTIVE')
   active={kind:route==='batch'?'batch_direct_v1':route==='deskCancel'?'desk_cancel_v1':a.p_kind,status:'reserved',request_id:a.p_request_id}
  }
  if(action==='commit'){
   if(!active||active.request_id!==a.p_request_id)throw Error('WRONG_KEY')
   const result=route==='batch'?{term_id:term,rows:[{row_id:'r1',mode:'independent',group_id:null,tasks:[{worker_id:worker,task_id:id(10)}],minutes_per_worker:45}],pair_count:1,standard_person_minutes:45}:route==='deskCancel'?{shift_id:shiftId,task_id:taskId,state:'cancelled'}:{id:id(11),state:'assigned',short_notice:false}
   active={...active,status:'committed',receipt:{ok:true,kind:active.kind,request_id:active.request_id,result}}
  }
  if(action==='cancel')active={...active,status:'cancelled'}
  if(action==='acknowledge'){active=null;epoch++}
  if(fail?.route===route&&fail.action===action){fail=null;throw Error('LOST')}
  if(route==='legacy'&&['batch_direct_v1','desk_cancel_v1'].includes(active?.kind))throw Error('UPGRADE')
  if(route==='shift')return {ok:true,shift_id:a.shiftId,state:'cancelled'}
  if(['batch','deskCancel'].includes(route)&&action==='discover'&&active&&active.kind!==(route==='batch'?'batch_direct_v1':'desk_cancel_v1'))return {ok:true,epoch,active:{kind:active.kind,status:active.status,foreign:true},durable_active:false}
  return {ok:true,epoch,active,...(['batch','deskCancel'].includes(route)&&!['reserve','commit'].includes(action)?{durable_active:false}:{})}
 }
 const m=createDayBatchSharedManager({actorId:actor,makeId:()=>id(seq++),legacyWrite:a=>run('legacy',a),legacyControl:a=>run('legacy',a),batchWrite:a=>run('batch',a),batchControl:a=>run('batch',a),deskCancelWrite:a=>run('deskCancel',a),deskCancelControl:a=>run('deskCancel',a),cancelExistingShift:a=>run('shift',a)})
 const verify=()=>m.setAccess({status:'verified',actorId:actor})
 verify();m.selectReadScope('work');m.beginScopedRead('work')('ready')
 return {m,calls,verify,fail:(route,action,before=false)=>{fail={route,action,before}},hold:(route,action)=>{const wait=defer();hold={route,action,wait};return wait}}
}
test('typed cancellation blocks legacy and batch until matching terminal ack and fresh idle',async()=>{
 const {m,calls}=fixture();assert.equal(await m.discover(),'idle')
 assert.equal(m.snapshot().canStartDeskCancel,true)
 assert.equal(await m.submitDeskCancel(cancelDraft,cancelContext),'committed')
 assert.equal(m.snapshot().kind,'desk_cancel_v1');assert.deepEqual(m.snapshot().receipt.result,{shift_id:shiftId,task_id:taskId,state:'cancelled'})
 assert.equal(await m.submitLegacy(direct),'blocked');assert.equal(await m.submitBatch(draft,context),'blocked')
 assert.equal(await m.acknowledge(),'blocked');assert.equal(await m.discover(),'committed')
 assert.equal(await m.acknowledge(),'needs_discovery');assert.equal(m.snapshot().canStart,false)
 assert.equal(await m.discover(),'idle');assert.equal(await m.submitBatch(draft,context),'committed')
 assert.deepEqual(calls.filter(c=>c[1]==='commit').map(c=>c[0]),['deskCancel','batch'])
})
test('reload routes reserved desk cancellation by foreign kind, never reconstructs reason',async()=>{
 const {m,calls}=fixture({kind:'desk_cancel_v1',status:'reserved',request_id:id(88)})
 assert.equal(await m.discover(),'reserved');assert.equal(m.snapshot().owner,'deskCancel')
 assert.equal(m.snapshot().canCommit,false);assert.equal(await m.commit(),'blocked')
 assert.equal(await m.cancel(),'cancelled');assert.equal(await m.acknowledge(),'needs_discovery');assert.equal(await m.discover(),'idle')
 assert.equal(calls.filter(c=>['cancel','acknowledge'].includes(c[1])&&c[0]!=='deskCancel').length,0)
})
test('lost commit recovers on report scope but no new cancellation there',async()=>{
 const f=fixture(),{m,calls}=f;await m.discover();f.fail('deskCancel','commit')
 assert.equal(await m.submitDeskCancel(cancelDraft,cancelContext),'unknown')
 m.selectReadScope('report');assert.equal(await m.discover(),'committed')
 assert.equal(m.snapshot().receipt.result.shift_id,shiftId);assert.equal(await m.acknowledge(),'needs_discovery');assert.equal(await m.discover(),'idle')
 assert.equal(await m.submitDeskCancel(cancelDraft,cancelContext),'blocked')
 assert.equal(calls.filter(c=>c[1]==='commit').length,1)
})
test('typed mode never invokes raw cancellation even with explicit legacy dependency',async()=>{
 const {m,calls}=fixture();await m.discover()
 await assert.rejects(()=>m.cancelExistingShift({shiftId,reason:'دلیل نمونه'}),/SHIFT_CANCEL_BLOCKED/)
 assert.equal(calls.filter(c=>c[0]==='shift').length,0)
})
test('lost reserve keeps sticky owner; exact retry only; scope suspension prevents auto-commit',async()=>{
 const f=fixture(),{m,calls}=f;await m.discover();f.fail('deskCancel','reserve',true)
 assert.equal(await m.submitDeskCancel(cancelDraft,cancelContext),'unknown')
 assert.equal(await m.discover(),'reserve_unknown');assert.equal(await m.submitBatch(draft,context),'blocked')
 assert.equal(await m.retryReserve(),'reserved')
 assert.deepEqual(calls.filter(c=>c[1]==='reserve').map(c=>c[2]),[calls.find(c=>c[1]==='reserve')[2],calls.find(c=>c[1]==='reserve')[2]])
 assert.equal(await m.commit(),'committed')
})
test('scope switch during desk reserve never auto-commits; explicit recovered commit only',async()=>{
 const f=fixture(),{m,calls}=f;await m.discover();const h=f.hold('deskCancel','reserve'),p=m.submitDeskCancel(cancelDraft,cancelContext)
 for(let i=0;i<12;i++)await Promise.resolve()
 assert.equal(calls.filter(c=>c[1]==='reserve').length,1)
 m.selectReadScope('candidates');m.beginScopedRead('candidates')('ready')
 h.resolve();assert.equal(await p,'stale');assert.equal(calls.filter(c=>c[1]==='commit').length,0)
 assert.equal(await m.discover(),'reserved');assert.equal(await m.commit(),'committed')
})
test('foreign batch/direct retain their own controls and cannot be abandoned via desk path',async()=>{
 for(const [kind,owner] of [['direct','legacy'],['batch_direct_v1','batch']]){
  const {m,calls}=fixture({kind,status:'reserved',request_id:id(88)})
  assert.equal(await m.discover(),'reserved');assert.equal(m.snapshot().owner,owner)
  assert.equal(await m.submitDeskCancel(cancelDraft,cancelContext),'blocked')
  assert.equal(await m.cancel(),'cancelled');assert.equal(calls.filter(c=>c[0]==='deskCancel'&&c[1]==='cancel').length,0)
 }
})
