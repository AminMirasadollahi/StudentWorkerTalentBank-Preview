import test from 'node:test'
import assert from 'node:assert/strict'
import {createScopedRecoveryHttpTransport} from '../src/lib/scopedRecoveryHttpTransport.mjs'
const A='00000000-0000-4000-8000-000000000001',B='00000000-0000-4000-8000-000000000002'
const discover={p_action:'discover',p_epoch:null,p_request_id:null}
const draft={p_action:'reserve',p_epoch:0,p_request_id:B,p_kind:'direct',p_worker_ids:[A],p_unit_code:'library',p_title:'Synthetic title',p_instructions:'Synthetic instructions',p_planned_date:'2026-12-01',p_estimate_minutes:60,p_start_minute:null,p_end_minute:null,p_short_notice_reason:null}
const view={ok:true,epoch:0,active:null}
function fixture(overrides={}){
 let actor=A,valid=true
 const calls=[],verified=[]
 const config={projectUrl:'https://syntheticproject.supabase.co',publishableKey:'sb_publishable_fixture',actorId:A,isCurrent:()=>valid,
 auth:{getSession:async()=>({data:{session:{access_token:'fake.token.one',user:{id:B}}}}),getUser:async t=>{verified.push(t);return {data:{user:{id:actor}}}}},
 fetchImpl:async(u,o)=>{calls.push({u,o});return {ok:true,json:async()=>view}},...overrides}
 return {transport:createScopedRecoveryHttpTransport(config),calls,verified,setActor:x=>{actor=x},invalidate:()=>{valid=false}}
}
test('exact RPC names and original verified JWT; session user metadata ignored',async()=>{
 const f=fixture();assert.deepEqual(await f.transport.control(discover),view)
 assert.deepEqual(await f.transport.write(draft),view)
 assert.equal(f.calls[0].u,'https://syntheticproject.supabase.co/rest/v1/rpc/ops_assignment_recovery_control_v2')
 assert.equal(f.calls[1].u,'https://syntheticproject.supabase.co/rest/v1/rpc/ops_assignment_recovery_write_v2')
 assert.equal(f.calls[1].o.headers.Authorization,'Bearer fake.token.one')
 assert.equal(f.calls[1].o.redirect,'error');assert.equal(f.calls[1].o.credentials,'omit')
 assert.deepEqual(JSON.parse(f.calls[1].o.body),draft);assert.deepEqual(f.verified,['fake.token.one','fake.token.one'])
})
test('wrong verified actor blocks before RPC',async()=>{
 const f=fixture();f.setActor(B);await assert.rejects(f.transport.write(draft),/TRANSPORT_UNCONFIRMED/);assert.equal(f.calls.length,0)
})
test('session token replacement during verification fails closed',async()=>{
 let n=0
 const f=fixture({auth:{getSession:async()=>({data:{session:{access_token:++n===1?'fake.token.one':'fake.token.two'}}}),getUser:async()=>({data:{user:{id:A}}})}})
 await assert.rejects(f.transport.write(draft),/TRANSPORT_UNCONFIRMED/);assert.equal(f.calls.length,0)
})
test('generation invalidated during verification blocks dispatch',async()=>{
 let finish
 const f=fixture({auth:{getSession:async()=>({data:{session:{access_token:'fake.token.one'}}}),getUser:()=>new Promise(r=>{finish=r})}})
 const p=f.transport.write(draft)
 while(!finish)await Promise.resolve()
 f.invalidate();finish({data:{user:{id:A}}})
 await assert.rejects(p,/TRANSPORT_UNCONFIRMED/);assert.equal(f.calls.length,0)
})
test('late response invalidated during fetch cannot return receipt',async()=>{
 let finish
 const f=fixture({fetchImpl:()=>new Promise(r=>{finish=r})})
 const p=f.transport.write(draft)
 while(!finish)await Promise.resolve()
 f.invalidate();finish({ok:true,json:async()=>view})
 await assert.rejects(p,/TRANSPORT_UNCONFIRMED/)
})
test('malformed actions and extra actor fields rejected before dispatch',async()=>{
 const f=fixture()
 for(const p of [{...discover,p_actor_id:A},{...discover,p_action:'commit'},{...discover,p_epoch:0}])await assert.rejects(f.transport.control(p),/TRANSPORT_UNCONFIRMED/)
 await assert.rejects(f.transport.write({...draft,p_action:'cancel'}),/TRANSPORT_UNCONFIRMED/)
 assert.equal(f.calls.length,0)
})
test('HTTP failure opaque and never retried',async()=>{
 let calls=0
 const f=fixture({fetchImpl:async()=>{calls++;return {ok:false,status:503,json:async()=>({message:'private error'})}}})
 await assert.rejects(f.transport.write(draft),e=>e.message==='ASSIGNMENT_RECOVERY_TRANSPORT_UNCONFIRMED')
 assert.equal(calls,1)
})
test('invalid origin or secret key rejected',()=>{
 for(const cfg of [{projectUrl:'http://syntheticproject.supabase.co'},{projectUrl:'https://syntheticproject.supabase.co.evil.invalid'},{projectUrl:'https://syntheticproject.supabase.co/path'},{publishableKey:'sb_secret_fixture'}])assert.throws(()=>fixture(cfg),/TRANSPORT_UNCONFIRMED/)
})
