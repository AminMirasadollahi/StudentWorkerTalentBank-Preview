import test from 'node:test'
import assert from 'node:assert/strict'
import {createDayBatchSharedManager} from '../src/lib/dayBatchSharedManager.mjs'
import {createScopedDayBatchHttpTransport} from '../src/lib/scopedDayBatchHttpTransport.mjs'
const id=n=>'20000000-0000-4000-8000-'+String(n).padStart(12,'0')
const actor=id(1),worker=id(2),term=id(3)
const context={today:'2026-11-27',term:{id:term,state:'active',start_date:'2026-09-23',end_date:'2027-02-09'},workers:[{id:worker,state:'active'}],data:{tasks:[],weekly_slots:[],exceptions:[]}}
const row={id:'r1',title:'کار نمونه',instructions:'شرح',minutes:45,mode:'independent',workerIds:[worker],date:null,unit:null,reason:null,prerequisiteIds:[]}
const draft={termId:term,defaults:{date:'2026-12-01',unit:'library',reason:''},rows:[row]}
const direct={kind:'direct',workerIds:[worker],unit:'library',title:'کار مستقیم',instructions:'شرح',date:'2026-12-01',minutes:45,startMinute:null,endMinute:null,reason:null,prerequisiteIds:[]}
const defer=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {resolve,promise}}
function fixture(initial=null){
 let active=initial,epoch=7,seq=20,fail=null,hold=null,calls=[]
 const run=async(route,a)=>{
  const action=a.p_action;calls.push([route,action,a])
  if(hold?.route===route&&hold.action===action){const h=hold;hold=null;await h.wait.promise}
  if(fail?.route===route&&fail.action===action&&fail.before){fail=null;throw Error('LOST')}
  if(action==='reserve'){
   if(active)throw Error('ACTIVE')
   active={kind:route==='batch'?'batch_direct_v1':a.p_kind,status:'reserved',request_id:a.p_request_id}
  }
  if(action==='commit'){
   if(!active||active.request_id!==a.p_request_id)throw Error('WRONG_KEY')
   const result=route==='batch'?{term_id:term,rows:[{row_id:'r1',mode:'independent',group_id:null,tasks:[{worker_id:worker,task_id:id(10)}],minutes_per_worker:45}],pair_count:1,standard_person_minutes:45}:{id:id(11),state:'assigned',short_notice:false}
   active={...active,status:'committed',receipt:{ok:true,kind:active.kind,request_id:active.request_id,result}}
  }
  if(action==='cancel')active={...active,status:'cancelled'}
  if(action==='acknowledge'){active=null;epoch++}
  if(fail?.route===route&&fail.action===action){fail=null;throw Error('LOST')}
  if(route==='legacy'&&active?.kind==='batch_direct_v1')throw Error('UPGRADE')
  if(route==='shift')return {ok:true,shift_id:a.shiftId,state:'cancelled'}
  if(route==='batch'&&action==='discover'&&active&&active.kind!=='batch_direct_v1')return {ok:true,epoch,active:{kind:active.kind,status:active.status,foreign:true},durable_active:false}
  return {ok:true,epoch,active,...(route==='batch'&&!['reserve','commit'].includes(action)?{durable_active:false}:{})}
 }
 const m=createDayBatchSharedManager({actorId:actor,makeId:()=>id(seq++),legacyWrite:a=>run('legacy',a),legacyControl:a=>run('legacy',a),batchWrite:a=>run('batch',a),batchControl:a=>run('batch',a),cancelExistingShift:a=>run('shift',a)})
 const verify=()=>m.setAccess({status:'verified',actorId:actor})
 verify();m.selectReadScope('work');m.beginScopedRead('work')('ready')
 return {m,calls,verify,fail:(route,action,before=false)=>{fail={route,action,before}},hold:(route,action)=>{const wait=defer();hold={route,action,wait};return wait}}
}
test('one owner: direct then batch with verified receipt and fresh discovery',async()=>{
 const {m,calls}=fixture();assert.equal(await m.discover(),'idle')
 assert.equal(await m.submitLegacy(direct),'committed');assert.equal(await m.submitBatch(draft,context),'blocked')
 assert.equal(await m.acknowledge(),'needs_discovery');assert.equal(m.snapshot().canStart,false)
 assert.equal(await m.discover(),'idle');assert.equal(await m.submitBatch(draft,context),'committed')
 assert.equal(m.snapshot().receipt.result.standard_person_minutes,45);assert.equal(await m.acknowledge(),'blocked')
 assert.equal(await m.discover(),'committed');assert.equal(await m.acknowledge(),'needs_discovery');assert.equal(await m.discover(),'idle')
 assert.equal(calls.filter(c=>c[1]==='commit').length,2)
})
test('clean foreign direct reservation routes only to legacy controls',async()=>{
 const {m,calls}=fixture({kind:'direct',status:'reserved',request_id:id(88)})
 assert.equal(await m.discover(),'reserved');assert.equal(m.snapshot().owner,'legacy');assert.equal(m.snapshot().canCommit,false)
 assert.equal(await m.cancel(),'cancelled');assert.equal(await m.acknowledge(),'needs_discovery');assert.equal(await m.discover(),'idle')
 assert.equal(calls.filter(c=>c[0]==='batch'&&c[1]==='cancel').length,0)
})
test('fresh batch reservation routes only to batch controls, no reconstruction',async()=>{
 const {m,calls}=fixture({kind:'batch_direct_v1',status:'reserved',request_id:id(88)})
 assert.equal(await m.discover(),'reserved');assert.equal(m.snapshot().owner,'batch');assert.equal(m.snapshot().canCommit,false)
 assert.equal(await m.cancel(),'cancelled');assert.equal(await m.acknowledge(),'needs_discovery');assert.equal(await m.discover(),'idle')
 assert.equal(calls.filter(c=>c[0]==='legacy').length,0)
})
test('lost legacy reserve cannot be replaced by batch, exact retry only',async()=>{
 const f=fixture(),{m,calls}=f;await m.discover();f.fail('legacy','reserve',true)
 assert.equal(await m.submitLegacy(direct),'unknown');assert.equal(await m.discover(),'reserve_unknown');assert.equal(await m.submitBatch(draft,context),'blocked')
 assert.equal(await m.retryReserve(),'reserved');const reserves=calls.filter(c=>c[1]==='reserve');assert.deepEqual(reserves[0][2],reserves[1][2])
})
test('scope change during batch reserve suppresses commit, no concurrent legacy write',async()=>{
 const f=fixture(),{m,calls}=f;await m.discover();const h=f.hold('batch','reserve'),pending=m.submitBatch(draft,context)
 // allow initial discovery and reserve dispatch
 for(let i=0;i<12;i++)await Promise.resolve()
 assert.equal(calls.filter(c=>c[1]==='reserve').length,1)
 m.selectReadScope('candidates');const old=m.beginScopedRead('candidates')
 m.selectReadScope('work');const done=m.beginScopedRead('work');assert.equal(old('ready'),false);done('ready')
 assert.equal(await m.discover(),'blocked');assert.equal(await m.submitLegacy(direct),'blocked');h.resolve();assert.equal(await pending,'stale')
 assert.equal(calls.filter(c=>c[1]==='commit').length,0);assert.equal(await m.discover(),'reserved');assert.equal(await m.commit(),'committed')
})
test('report scope permits recovery but not new assignment; stale read is rejected',async()=>{
 const {m}=fixture();m.selectReadScope('report');assert.equal(await m.discover(),'idle');assert.equal(m.snapshot().canStart,false)
 m.selectReadScope('work');const a=m.beginScopedRead('work'),b=m.beginScopedRead('work');assert.equal(a('ready'),false);assert.equal(await m.discover(),'blocked')
 assert.equal(b('ready'),true);assert.equal(await m.discover(),'idle');assert.equal(m.snapshot().canStart,true)
})
test('lost shift cancellation holds all routes even if assignment ledger is empty',async()=>{
 const f=fixture(),{m}=f;await m.discover();f.fail('shift',undefined,true)
 await assert.rejects(()=>m.cancelExistingShift({shiftId:id(90),reason:'دلیل نمونه'}),/SHIFT_CANCEL_UNCONFIRMED/)
 assert.equal(m.snapshot().state,'shift_unconfirmed');assert.equal(await m.discover(),'blocked');assert.equal(await m.submitBatch(draft,context),'blocked')
})
test('successful shift cancellation requires fresh discovery before next write',async()=>{
 const {m}=fixture();await m.discover();assert.equal((await m.cancelExistingShift({shiftId:id(90),reason:'دلیل نمونه'})).state,'cancelled')
 assert.equal(m.snapshot().canStart,false);assert.equal(await m.discover(),'idle')
})
const reviewRef='abcdefghijklmnopqrst',projectUrl='https://'+reviewRef+'.supabase.co'
const control={p_action:'discover',p_epoch:null,p_request_id:null}
const write={p_action:'reserve',p_epoch:7,p_request_id:id(88),p_term_id:term,p_rows:[{id:'r1',mode:'independent',worker_ids:[worker],unit:'library',title:'کار نمونه',instructions:'شرح',date:'2026-12-01',minutes:45,reason:null,prerequisites:[]}]}
function transportFixture(){
 let current=true,token='abc.def.ghi',user=actor,calls=[],hook=null
 const config={mode:'review',expectedProjectRef:reviewRef,projectUrl,publishableKey:'sb_publishable_fixture',actorId:actor,isCurrent:()=>current,auth:{getSession:async()=>({data:{session:{access_token:token}}}),getUser:async()=>({data:{user:{id:user,is_anonymous:false}}})},fetchImpl:async(url,init)=>{calls.push({url,init});if(hook)return hook();return {ok:true,json:async()=>({ok:true})}}}
 return {config,calls,transport:createScopedDayBatchHttpTransport(config),suspend:()=>{current=false},changeUser:()=>{user=id(99)},hook:f=>{hook=f}}
}
test('transport uses only exact review RPCs and fixed POST options',async()=>{
 const f=transportFixture();await f.transport.batchControl(control);await f.transport.batchWrite(write)
 assert.deepEqual(f.calls.map(c=>c.url),[projectUrl+'/rest/v1/rpc/ops_assignment_batch_control_v1',projectUrl+'/rest/v1/rpc/ops_assignment_batch_write_v1'])
 assert.equal(f.calls[0].init.redirect,'error');assert.equal(f.calls[0].init.credentials,'omit');assert.equal(f.calls[0].init.headers['Content-Profile'],'public')
 assert.deepEqual(JSON.parse(f.calls[1].init.body),write)
})
test('reject production, mismatched project, malformed rows, wrong identity, no network',async()=>{
 const f=transportFixture()
 for(const cfg of [{...f.config,mode:'release'},{...f.config,expectedProjectRef:'pmwxryavkrjcdobwkryw',projectUrl:'https://pmwxryavkrjcdobwkryw.supabase.co'},{...f.config,projectUrl:'https://wrong.supabase.co'}])assert.throws(()=>createScopedDayBatchHttpTransport(cfg),/DAY_BATCH_TRANSPORT_UNCONFIRMED/)
 await assert.rejects(()=>f.transport.batchWrite({...write,p_rows:[{...write.p_rows[0],worker_ids:[worker,worker]}]}),/DAY_BATCH_TRANSPORT_UNCONFIRMED/)
 f.changeUser();await assert.rejects(()=>f.transport.batchControl(control),/DAY_BATCH_TRANSPORT_UNCONFIRMED/);assert.equal(f.calls.length,0)
})
test('HTTP failure and late response do not become success, no retry',async()=>{
 const f=transportFixture();f.hook(()=>({ok:false,json:async()=>({})}));await assert.rejects(()=>f.transport.batchControl(control),/DAY_BATCH_TRANSPORT_UNCONFIRMED/)
 f.hook(()=>({ok:true,json:async()=>{f.suspend();return {ok:true}}}));await assert.rejects(()=>f.transport.batchWrite(write),/DAY_BATCH_TRANSPORT_UNCONFIRMED/);assert.equal(f.calls.length,2)
})
