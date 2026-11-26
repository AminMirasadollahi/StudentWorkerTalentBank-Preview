import test from 'node:test'
import assert from 'node:assert/strict'
import {buildAssignmentRecoveryPayload,canonicalAssignmentPrerequisites} from '../src/lib/assignmentPrerequisites.mjs'
import {createAssignmentRecoverySession} from '../src/lib/assignmentRecoverySession.mjs'
import {createScopedRecoveryHttpTransport} from '../src/lib/scopedRecoveryHttpTransport.mjs'
import {resolveRecoveryReviewConfig} from '../src/lib/recoveryReviewLifecycle.mjs'
const actor='10000000-0000-4000-8000-000000000001',key='10000000-0000-4000-8000-000000000002',a='10000000-0000-4000-8000-000000000003',b='10000000-0000-4000-8000-000000000004'
const draft={kind:'direct',workerIds:[actor],unit:'research',title:'sample task',instructions:'',date:'2026-12-01',minutes:30,startMinute:null,endMinute:null,reason:null}
test('explicit V3 set sorted, immutable, no silent V2 stripping',()=>{
 const ids=[b,a],p=buildAssignmentRecoveryPayload({...draft,prerequisiteIds:ids},key,3);ids.pop()
 assert.deepEqual(p.p_prerequisites,[a,b]);assert.ok(Object.isFrozen(p.p_prerequisites))
 assert.throws(()=>buildAssignmentRecoveryPayload({...draft,prerequisiteIds:[a]},key,2))
 assert.throws(()=>buildAssignmentRecoveryPayload(draft,key,3))
 assert.throws(()=>canonicalAssignmentPrerequisites([a,a]));assert.throws(()=>canonicalAssignmentPrerequisites(Array(1)))
 assert.throws(()=>canonicalAssignmentPrerequisites(Array(21).fill(a)))
 assert.deepEqual(buildAssignmentRecoveryPayload({...draft,prerequisiteIds:[]},key,3).p_prerequisites,[])
 assert.equal(Object.hasOwn(buildAssignmentRecoveryPayload(draft,key,2),'p_prerequisites'),false)
})
test('reserve retry and commit carry exactly the same immutable prerequisite set',async()=>{
 const writes=[];const s=createAssignmentRecoverySession({version:3,makeId:()=>key,control:async()=>({ok:true,epoch:0,active:null}),write:async p=>{
  writes.push(p);if(writes.length===1)throw Error('lost')
  return {ok:true,epoch:0,active:{request_id:key,kind:'direct',status:p.p_action==='commit'?'committed':'reserved',...(p.p_action==='commit'?{receipt:{ok:true,request_id:key,kind:'direct',result:{id:b,state:'assigned',short_notice:false}}}:{})}}
 }})
 s.setAccess({status:'verified',actorId:actor});assert.equal(await s.discover(),'idle')
 const ids=[a];assert.equal(await s.reserve({...draft,prerequisiteIds:ids}),'unknown');ids.push(b)
 assert.equal(await s.discover(),'reserve_unknown');assert.equal(await s.retryReserve(),'reserved');assert.equal(await s.commit(),'committed')
 assert.deepEqual(writes.map(p=>p.p_prerequisites),[[a],[a],[a]])
 assert.equal(writes[0].p_request_id,writes[2].p_request_id)
})
test('strict transport uses V3 only, missing/malformed sets rejected without fetch; controls stay V2',async()=>{
 const calls=[];const auth={getSession:async()=>({data:{session:{access_token:'a.b.c'}}}),getUser:async()=>({data:{user:{id:actor}}})}
 const t=createScopedRecoveryHttpTransport({version:3,projectUrl:'https://aaaaaaaaaaaaaaaaaaaa.supabase.co',publishableKey:'sb_publishable_fixture',actorId:actor,auth,isCurrent:()=>true,fetchImpl:async(url,options)=>{calls.push([url,JSON.parse(options.body)]);return {ok:true,json:async()=>({ok:true})}}})
 const base={p_action:'reserve',p_epoch:0,...buildAssignmentRecoveryPayload(draft,key,2)}
 await assert.rejects(t.write(base));await assert.rejects(t.write({...base,p_prerequisites:[b,a]}));assert.equal(calls.length,0)
 await t.write({...base,p_prerequisites:[a,b]});await t.control({p_action:'discover',p_epoch:null,p_request_id:null})
 assert.ok(calls[0][0].endsWith('/ops_assignment_recovery_write_v3'));assert.deepEqual(calls[0][1].p_prerequisites,[a,b])
 assert.ok(calls[1][0].endsWith('/ops_assignment_recovery_control_v2'))
})
test('strict policy flag without matching recovery configuration blocks legacy mode',()=>{
 assert.equal(resolveRecoveryReviewConfig({VITE_SWTB23_WORKER_POLICY_RELEASE:'true'}).mode,'blocked')
 const env={VITE_SWTB22_RECOVERY_REVIEW_UI:'true',VITE_SWTB22_RECOVERY_REVIEW_PROJECT_REF:'aaaaaaaaaaaaaaaaaaaa',VITE_SUPABASE_URL:'https://aaaaaaaaaaaaaaaaaaaa.supabase.co',VITE_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture'}
 assert.equal(resolveRecoveryReviewConfig(env).version,undefined)
 assert.equal(resolveRecoveryReviewConfig({...env,VITE_SWTB23_WORKER_POLICY_RELEASE:'true'}).version,3)
})
