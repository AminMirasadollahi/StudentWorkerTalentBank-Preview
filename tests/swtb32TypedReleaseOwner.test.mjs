import test from 'node:test'
import assert from 'node:assert/strict'
import {createTypedAssignmentReleaseOwner} from '../src/lib/dayBatchVerifiedOwner.mjs'
const id=n=>'20000000-0000-4000-8000-'+String(n).padStart(12,'0'),actor=id(1),worker=id(2),term=id(3),ref='pmwxryavkrjcdobwkryw',releaseId='a'.repeat(40)
const env={PROD:true,DEV:false,VITE_SWTB32_TYPED_ASSIGNMENT_RELEASE:'true',VITE_SWTB32_TYPED_RELEASE_PROJECT_REF:ref,VITE_SWTB32_TYPED_RELEASE_ID:releaseId,VITE_SWTB22_RECOVERY_RELEASE_UI:'true',VITE_SWTB22_RECOVERY_RELEASE_PROJECT_REF:ref,VITE_SWTB23_WORKER_POLICY_RELEASE:'true',VITE_SWTB22_MANAGER_SHELL_UI:'true',VITE_SWTB24_R5_MANAGER_IA_UI:'true',VITE_SUPABASE_URL:'https://'+ref+'.supabase.co',VITE_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fake'}
const context={today:'2026-11-27',term:{id:term,state:'active',start_date:'2026-09-23',end_date:'2027-02-09'},workers:[{id:worker,state:'active'}],data:{tasks:[],weekly_slots:[],exceptions:[]}}
const draft={termId:term,defaults:{date:'2026-12-01',unit:'library',reason:''},rows:[{id:'r1',title:'کار نمونه',instructions:'شرح',minutes:45,mode:'independent',workerIds:[worker],date:null,unit:null,reason:null,prerequisiteIds:[]}]}
const fixture=()=>{
 let ready=true,revision=0,recoverOnly=false,visible=true,seq=4,active=null,epoch=0,holdAfterReserve=false,calls=[]
 const o=createTypedAssignmentReleaseOwner({env,actorId:actor,auth:{getSession:async()=>({data:{session:{access_token:'a.b.c'}}}),getUser:async()=>({data:{user:{id:actor,is_anonymous:false}}})},isVisible:()=>visible,makeId:()=>id(seq++),fetchImpl:async(url,init)=>{
  const route=url.split('/').at(-1),a=JSON.parse(init.body);calls.push({route,a})
  if(route==='ops_assignment_typed_release_status_v2')return {ok:true,json:async()=>({ok:ready,contract:'swtb-typed-day-v2',project_ref:ref,release_id:ready?releaseId:null,actor_id:actor,state:ready?(recoverOnly?'recover_only':'ready'):'held',revision})}
  assert.ok(['ops_assignment_batch_write_v1','ops_assignment_batch_control_v1'].includes(route),'UNEXPECTED_RPC')
  if(a.p_action==='reserve'){active={kind:'batch_direct_v1',status:'reserved',request_id:a.p_request_id};if(holdAfterReserve){ready=false;revision++}}
  if(a.p_action==='commit')active={...active,status:'committed',receipt:{ok:true,kind:'batch_direct_v1',request_id:a.p_request_id,result:{term_id:term,rows:[{row_id:'r1',mode:'independent',group_id:null,minutes_per_worker:45,tasks:[{worker_id:worker,task_id:id(10)}]}],pair_count:1,standard_person_minutes:45}}}
  if(a.p_action==='acknowledge'){active=null;epoch++}
  return {ok:true,json:async()=>({ok:true,epoch,active,...(route.endsWith('control_v1')?{durable_active:false}:{})})}
 }})
 const load=()=>{o.selectReadScope('work');o.beginScopedRead('work')('ready')}
 return {o,calls,load,setReady:x=>{ready=x;revision++},drain:()=>{recoverOnly=true;revision++},contradict:()=>{recoverOnly=!recoverOnly},holdAfterReserve:()=>{holdAfterReserve=true},setVisible:x=>{visible=x}}
}
test('release owner inert, exact admission plus fresh read required, durable owner has no raw cancellation',async()=>{
 const f=fixture(),{o,calls}=f;assert.equal(calls.length,0);assert.equal(await o.discover(),'blocked')
 f.setReady(false);assert.equal(await o.check(),false);assert.equal(o.snapshot().canStart,false)
 f.setReady(true);assert.equal(await o.check(),true);assert.equal(await o.discover(),'blocked')
 f.load();assert.equal(await o.discover(),'idle');assert.equal(o.snapshot().canStart,true)
 assert.equal(await o.submitBatch(draft,context),'committed')
 assert.equal(o.snapshot().canAcknowledge,false);assert.equal(await o.discover(),'committed');assert.equal(o.snapshot().canAcknowledge,true);await assert.rejects(()=>o.cancelExistingShift({shiftId:id(7),reason:'test reason'}))
 assert.equal(calls.some(x=>x.route==='ops_cancel_library_desk_shift'),false)
 for(let i=1;i<calls.length;i++)if(calls[i].route!=='ops_assignment_typed_release_status_v2')assert.equal(calls[i-1].route,'ops_assignment_typed_release_status_v2')
})
test('status change after reserve blocks commit, retained operation can recover only after fresh proof',async()=>{
 const f=fixture(),{o,calls}=f;assert.equal(await o.check(),true);f.load();assert.equal(await o.discover(),'idle');f.holdAfterReserve()
 const out=await o.submitBatch(draft,context);assert.notEqual(out,'committed');assert.equal(calls.filter(x=>x.a.p_action==='reserve').length,1);assert.equal(calls.filter(x=>x.a.p_action==='commit').length,0)
 o.suspend();assert.equal(await o.check(),false);assert.equal(await o.commit(),'blocked')
 f.setReady(true);assert.equal(await o.check(),true);f.load();assert.equal(await o.discover(),'reserved');assert.equal(await o.commit(),'committed')
 assert.equal(calls.filter(x=>x.a.p_action==='reserve').length,1);assert.equal(calls.filter(x=>x.a.p_action==='commit').length,1)
 o.authChanged('SIGNED_OUT',null);const n=calls.length;assert.equal(await o.check(),false);assert.equal(await o.acknowledge(),'blocked');assert.equal(calls.length,n)
})

test('real shared manager retains committed receipt during drain and blocks fresh starts',async()=>{
 const f=fixture(),{o,calls}=f;assert.equal(await o.check(),true);f.load();assert.equal(await o.discover(),'idle');assert.equal(await o.submitBatch(draft,context),'committed')
 f.drain();assert.equal(await o.discover(),'committed');assert.equal(o.snapshot().releaseCapability,'recover_only');assert.equal(o.snapshot().canStart,false);assert.equal(o.snapshot().canRetryReserve,false);assert.equal(o.snapshot().canAcknowledge,true)
 assert.equal(await o.acknowledge(),'needs_discovery');assert.equal(await o.discover(),'idle');assert.equal(o.snapshot().canStart,false)
 const n=calls.length;assert.equal(await o.submitBatch(draft,context),'blocked');assert.equal(calls.length,n);assert.equal(calls.filter(x=>x.a.p_action==='reserve').length,1)
 f.contradict();assert.equal(await o.discover(),'blocked');assert.equal(o.snapshot().canStart,false)
})
