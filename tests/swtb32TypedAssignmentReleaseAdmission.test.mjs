import test from 'node:test'
import assert from 'node:assert/strict'
import {resolveTypedAssignmentReleaseConfig,createTypedAssignmentReleaseAdmission,parseTypedReleaseCapability} from '../src/lib/typedAssignmentReleaseAdmission.mjs'
const ref='pmwxryavkrjcdobwkryw',id='a'.repeat(40),actor='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002'
const env={PROD:true,DEV:false,VITE_SWTB32_TYPED_ASSIGNMENT_RELEASE:'true',VITE_SWTB32_TYPED_RELEASE_PROJECT_REF:ref,VITE_SWTB32_TYPED_RELEASE_ID:id,VITE_SWTB22_RECOVERY_RELEASE_UI:'true',VITE_SWTB22_RECOVERY_RELEASE_PROJECT_REF:ref,VITE_SWTB23_WORKER_POLICY_RELEASE:'true',VITE_SWTB22_MANAGER_SHELL_UI:'true',VITE_SWTB24_R5_MANAGER_IA_UI:'true',VITE_SUPABASE_URL:'https://'+ref+'.supabase.co',VITE_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fake'}
const ready={ok:true,contract:'swtb-typed-day-v2',project_ref:ref,release_id:id,actor_id:actor,state:'ready',revision:0}
const harness=(opts={})=>{
 let live=true,t='a.b.c',calls=[]
 const auth={getSession:async()=>({data:{session:{access_token:t}}}),getUser:async()=>({data:{user:{id:actor,is_anonymous:false,...opts.user}}})}
 const g=createTypedAssignmentReleaseAdmission({env,auth,actorId:actor,isCurrent:()=>live,fetchImpl:async(url,init)=>{calls.push({url,init});opts.onFetch?.({invalidate:()=>{live=false},rotate:()=>{t='d.e.f'}});return {ok:opts.ok!==false,json:async()=>opts.status??ready}}})
 return {g,calls,invalidate:()=>{live=false}}
}
test('default OFF, explicit exact strict release only; review, dev, stage, malformed and conflicting flags fail closed',()=>{
 assert.equal(resolveTypedAssignmentReleaseConfig({}).mode,'off')
 assert.equal(resolveTypedAssignmentReleaseConfig({...env,VITE_SWTB32_TYPED_ASSIGNMENT_RELEASE:'false'}).mode,'off')
 assert.equal(resolveTypedAssignmentReleaseConfig(env).mode,'release')
 for(const patch of [{DEV:true},{PROD:false},{VITE_SWTB22_RECOVERY_REVIEW_UI:'true'},{VITE_SWTB28_STAGING_REVIEW_UI:'true'},{VITE_SWTB23_WORKER_POLICY_RELEASE:'false'},{VITE_SWTB22_MANAGER_SHELL_UI:'false'},{VITE_SWTB24_R5_MANAGER_IA_UI:'false'},{VITE_SWTB32_TYPED_RELEASE_PROJECT_REF:'z'.repeat(20)},{VITE_SWTB32_TYPED_RELEASE_ID:'0'.repeat(40)},{VITE_SUPABASE_URL:'https://example.org'},{VITE_SWTB32_TYPED_ASSIGNMENT_RELEASE:'TRUE'}]){
  const e={...env,...patch};assert.equal(resolveTypedAssignmentReleaseConfig(e).mode,'blocked');assert.throws(()=>createTypedAssignmentReleaseAdmission({env:e,actorId:actor,isCurrent:()=>true,fetchImpl:()=>assert.fail('network')}),/BLOCKED/)
 }
})
test('only exact fresh status is accepted, single fixed read-only contract route',async()=>{
 const h=harness();assert.equal(h.calls.length,0);assert.deepEqual(await h.g.check(),{state:'ready',revision:0})
 assert.equal(h.calls.length,1);const {url,init}=h.calls[0];assert.equal(url,env.VITE_SUPABASE_URL+'/rest/v1/rpc/ops_assignment_typed_release_status_v2');assert.equal(init.body,'{}');assert.equal(init.headers.Authorization,'Bearer a.b.c');assert.equal(init.redirect,'error');assert.equal(init.cache,'no-store')
 assert.deepEqual(await h.g.check(),{state:'ready',revision:0});assert.equal(h.calls.length,2)
 for(const status of [{...ready,state:'held'},{...ready,release_id:'b'.repeat(40)},{...ready,actor_id:other},{...ready,project_ref:'z'.repeat(20)},{...ready,contract:'v2'},{...ready,ok:false},{...ready,extra:true},[]]){assert.equal(parseTypedReleaseCapability(status,{projectRef:ref,releaseId:id},actor),null);assert.equal(await harness({status}).g.check(),null)}
 assert.equal(await harness({ok:false}).g.check(),null)
})
test('identity change, anonymous, stale generation or token rotation fail without cached admission',async()=>{
 for(const user of [{id:other},{is_anonymous:true}]){const h=harness({user});assert.equal(await h.g.check(),null);assert.equal(h.calls.length,0)}
 const h=harness();h.invalidate();assert.equal(await h.g.check(),null);assert.equal(h.calls.length,0)
 assert.equal(await harness({onFetch:x=>x.invalidate()}).g.check(),null)
 assert.equal(await harness({onFetch:x=>x.rotate()}).g.check(),null)
})

test('recover-only is exact, old contract and malformed revisions denied',async()=>{
 assert.deepEqual(await harness({status:{...ready,state:'recover_only',revision:2}}).g.check(),{state:'recover_only',revision:2})
 for(const revision of [-1,1.5,Number.MAX_SAFE_INTEGER+1,null])assert.equal(await harness({status:{...ready,revision}}).g.check(),null)
 assert.equal(await harness({status:{...ready,contract:'swtb-typed-day-v1'}}).g.check(),null)
})
