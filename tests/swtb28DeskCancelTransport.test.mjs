import test from 'node:test'
import assert from 'node:assert/strict'
import {createScopedDeskCancelHttpTransport} from '../src/lib/scopedDeskCancelHttpTransport.mjs'
const id=n=>'20000000-0000-4000-8000-'+String(n).padStart(12,'0')
const actor=id(1),ref='abcdefghijklmnopqrst'
const write={p_action:'reserve',p_epoch:7,p_request_id:id(2),p_shift_id:id(3),p_task_id:id(4),p_worker_id:id(5),p_day:'2026-11-28',p_start_minute:480,p_end_minute:540,p_reason:'دلیل نمونه'}
const discover={p_action:'discover',p_epoch:null,p_request_id:null}
function fixture(){
 let current=true,user=actor,token='abc.def.ghi',response={ok:true,json:async()=>({ok:true})},calls=[],authCalls=0,getUserHook=null
 const config={mode:'review',expectedProjectRef:ref,projectUrl:'https://'+ref+'.supabase.co',publishableKey:'sb_publishable_fixture',actorId:actor,isCurrent:()=>current,
 auth:{getSession:async()=>{authCalls++;return {data:{session:{access_token:token}}}},getUser:async()=>{authCalls++;if(getUserHook)getUserHook();return {data:{user:{id:user,is_anonymous:false}}}}},
 fetchImpl:async(url,init)=>{calls.push([url,init]);return response}}
 const t=createScopedDeskCancelHttpTransport(config)
 return {t,config,calls,authCalls:()=>authCalls,current:x=>{current=x},user:x=>{user=x},response:x=>{response=x},hook:x=>{getUserHook=x},token:x=>{token=x}}
}
test('constructor inert; exact public versioned write and control only',async()=>{
 const f=fixture();assert.equal(f.calls.length,0);assert.equal(f.authCalls(),0)
 await f.t.write(write);await f.t.write({...write,p_action:'commit'});await f.t.control(discover)
 assert.deepEqual(f.calls.map(x=>x[0].split('/').pop()),['ops_desk_cancel_write_v1','ops_desk_cancel_write_v1','ops_desk_cancel_control_v1'])
 assert.deepEqual(JSON.parse(f.calls[0][1].body),write)
 assert.equal(f.calls[0][1].redirect,'error');assert.equal(f.calls[0][1].credentials,'omit')
})
test('wrong project or production ref, release mode, secret key and implicit fetch refused',()=>{
 const f=fixture()
 for(const change of [{mode:'production'},{projectUrl:'https://example.com'},{publishableKey:'sb_secret_fixture'},{fetchImpl:undefined},{expectedProjectRef:'pmwxryavkrjcdobwkryw',projectUrl:'https://pmwxryavkrjcdobwkryw.supabase.co'}])
  assert.throws(()=>createScopedDeskCancelHttpTransport({...f.config,...change}))
})
test('malformed writes or control never reach auth or network',async()=>{
 const f=fixture()
 for(const a of [{...write,p_shift_id:id(0).replace(/^2/,'0')+'x'},{...write,p_reason:' short '},{...write,p_reason:'abc'},{...write,p_reason:'a'.repeat(501)},{...write,p_reason:'abcd\0e'},{...write,p_day:'2026-02-30'},{...write,p_day:'0000-01-01'},{...write,p_end_minute:480},{...write,p_start_minute:-1},{...write,p_epoch:1.5},{...write,extra:true},{...write,p_action:'cancel'}])await assert.rejects(f.t.write(a))
 for(const a of [{...discover,p_epoch:7},{...discover,p_action:'cancel'},{...discover,extra:true}])await assert.rejects(f.t.control(a))
 assert.equal(f.calls.length,0);assert.equal(f.authCalls(),0)
})
test('changed actor, hidden owner, refreshed token stop before dispatch',async()=>{
 const f=fixture();f.user(id(99));await assert.rejects(f.t.write(write));f.user(actor)
 f.current(false);await assert.rejects(f.t.write(write));f.current(true)
 f.hook(()=>f.token('xyz.def.ghi'));await assert.rejects(f.t.write(write))
 assert.equal(f.calls.length,0)
})
test('HTTP failure and stale JSON response never fall back to raw cancellation',async()=>{
 const f=fixture();f.response({ok:false,json:async()=>({ok:true})});await assert.rejects(f.t.write(write))
 f.response({ok:true,json:async()=>{f.current(false);return {ok:true}}});await assert.rejects(f.t.write(write))
 assert.deepEqual(f.calls.map(x=>x[0].split('/').pop()),['ops_desk_cancel_write_v1','ops_desk_cancel_write_v1'])
})
test('body captured before async verification, response not treated as receipt',async()=>{
 const f=fixture(),args={...write};f.hook(()=>{args.p_reason='متن تغییر کرده'})
 const raw=await f.t.write(args);assert.deepEqual(raw,{ok:true});assert.deepEqual(JSON.parse(f.calls[0][1].body),write)
})
