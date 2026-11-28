import test from 'node:test'
import assert from 'node:assert/strict'
import {createScopedDayBatchReleaseHttpTransport,createScopedDayBatchHttpTransport} from '../src/lib/scopedDayBatchHttpTransport.mjs'
import {createScopedDeskCancelReleaseHttpTransport,createScopedDeskCancelHttpTransport} from '../src/lib/scopedDeskCancelHttpTransport.mjs'
import {createTypedAssignmentReleaseRequestBoundary} from '../src/lib/typedAssignmentReleaseAdmission.mjs'
const ref='pmwxryavkrjcdobwkryw',releaseId='a'.repeat(40),id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0'),actor=id(1)
const env={PROD:true,DEV:false,VITE_SWTB32_TYPED_ASSIGNMENT_RELEASE:'true',VITE_SWTB32_TYPED_RELEASE_PROJECT_REF:ref,VITE_SWTB32_TYPED_RELEASE_ID:releaseId,VITE_SWTB22_RECOVERY_RELEASE_UI:'true',VITE_SWTB22_RECOVERY_RELEASE_PROJECT_REF:ref,VITE_SWTB23_WORKER_POLICY_RELEASE:'true',VITE_SWTB22_MANAGER_SHELL_UI:'true',VITE_SWTB24_R5_MANAGER_IA_UI:'true',VITE_SUPABASE_URL:'https://'+ref+'.supabase.co',VITE_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fake'}
const status={ok:true,contract:'swtb-typed-day-v2',project_ref:ref,release_id:releaseId,actor_id:actor,state:'ready',revision:0}
const discover={p_action:'discover',p_epoch:null,p_request_id:null}
const batch={p_action:'reserve',p_epoch:0,p_request_id:id(2),p_term_id:id(3),p_rows:[{id:'row-1',mode:'independent',worker_ids:[id(4)],unit:'library',title:'test task',instructions:'synthetic only',date:'2026-11-28',minutes:60,reason:null,prerequisites:[]}]}
const desk={p_action:'reserve',p_epoch:0,p_request_id:id(2),p_shift_id:id(3),p_task_id:id(4),p_worker_id:id(5),p_day:'2026-11-28',p_start_minute:480,p_end_minute:540,p_reason:'synthetic reason'}
function harness(opts={}){
 let live=true,t='a.b.c',calls=[]
 const auth={getSession:async()=>({data:{session:{access_token:t}}}),getUser:async()=>({data:{user:{id:actor,is_anonymous:false}}})}
 const config={env,auth,actorId:actor,isCurrent:()=>live,fetchImpl:async(url,init)=>{
  const route=url.split('/').at(-1);calls.push({route,init})
  if(route==='ops_assignment_typed_release_status_v2'){opts.duringStatus?.({invalidate:()=>{live=false},rotate:()=>{t='d.e.f'}});return {ok:opts.ok!==false,json:async()=>opts.status??status}}
  return {ok:true,json:async()=>({synthetic:true})}
 }}
 return {config,calls,b:createScopedDayBatchReleaseHttpTransport(config),d:createScopedDeskCancelReleaseHttpTransport(config)}
}
test('explicit release transports inert and gate each exact route; review constructor still rejects production',async()=>{
 const h=harness();assert.equal(h.calls.length,0);assert.equal(h.b.cancelExistingShift,undefined)
 assert.throws(()=>createScopedDayBatchHttpTransport({...h.config,mode:'review',expectedProjectRef:ref,projectUrl:env.VITE_SUPABASE_URL,publishableKey:env.VITE_SUPABASE_PUBLISHABLE_KEY}))
 assert.throws(()=>createScopedDeskCancelHttpTransport({...h.config,mode:'review',expectedProjectRef:ref,projectUrl:env.VITE_SUPABASE_URL,publishableKey:env.VITE_SUPABASE_PUBLISHABLE_KEY}))
 for(const [fn,args,route] of [[h.b.batchWrite,batch,'ops_assignment_batch_write_v1'],[h.b.batchControl,discover,'ops_assignment_batch_control_v1'],[h.b.legacyControl,discover,'ops_assignment_recovery_control_v2'],[h.d.write,desk,'ops_desk_cancel_write_v1'],[h.d.control,discover,'ops_desk_cancel_control_v1']]){
  assert.deepEqual(await fn(args),{synthetic:true});assert.deepEqual(h.calls.slice(-2).map(x=>x.route),['ops_assignment_typed_release_status_v2',route]);assert.deepEqual(JSON.parse(h.calls.at(-1).init.body),args)
 }
})
test('held or stale status, mismatched release, HTTP failure and token changes stop dispatch',async()=>{
 for(const opts of [{status:{...status,state:'held'}},{status:{...status,release_id:'b'.repeat(40)}},{ok:false},{duringStatus:x=>x.invalidate()},{duringStatus:x=>x.rotate()}]){
  const h=harness(opts);await assert.rejects(()=>h.b.batchWrite(batch));assert.deepEqual(h.calls.map(x=>x.route),['ops_assignment_typed_release_status_v2'])
 }
})
test('invalid payload denied before status request; boundary refuses raw, V2 and arbitrary routes',async()=>{
 const h=harness();await assert.rejects(()=>h.b.batchWrite({...batch,p_rows:[]}));await assert.rejects(()=>h.d.write({...desk,p_reason:'x'}));assert.equal(h.calls.length,0)
 const b=createTypedAssignmentReleaseRequestBoundary(h.config),headers={apikey:env.VITE_SUPABASE_PUBLISHABLE_KEY,Authorization:'Bearer a.b.c','Content-Profile':'public'}
 for(const route of ['ops_cancel_library_desk_shift','ops_assignment_recovery_write_v2','ops_assign_task','ops_assignment_typed_release_status_v2','other'])await assert.rejects(()=>b.fetchImpl(env.VITE_SUPABASE_URL+'/rest/v1/rpc/'+route,{method:'POST',headers,body:'{}',redirect:'error',credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer'}))
 assert.equal(h.calls.length,0)
})

test('recover-only accepts exact control and commit but denies all reserve and raw paths',async()=>{
 const h=harness({status:{...status,state:'recover_only',revision:2}})
 for(const [fn,args] of [[h.b.batchWrite,batch],[h.d.write,desk]]){await assert.rejects(()=>fn(args));assert.equal(h.calls.at(-1).route,'ops_assignment_typed_release_status_v2');assert.deepEqual(await fn({...args,p_action:'commit'}),{synthetic:true})}
 assert.deepEqual(await h.b.batchControl(discover),{synthetic:true});assert.deepEqual(await h.d.control(discover),{synthetic:true});assert.equal(h.calls.some(x=>JSON.parse(x.init.body).p_action==='reserve'),false)
})
