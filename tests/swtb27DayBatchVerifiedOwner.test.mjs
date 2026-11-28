import test from 'node:test'
import assert from 'node:assert/strict'
import {createDayBatchVerifiedOwner} from '../src/lib/dayBatchVerifiedOwner.mjs'
const id=n=>'20000000-0000-4000-8000-'+String(n).padStart(12,'0')
const actor=id(1),worker=id(2),term=id(3),ref='abcdefghijklmnopqrst'
const context={today:'2026-11-27',term:{id:term,state:'active',start_date:'2026-09-23',end_date:'2027-02-09'},workers:[{id:worker,state:'active'}],data:{tasks:[],weekly_slots:[],exceptions:[]}}
const draft={termId:term,defaults:{date:'2026-12-01',unit:'library',reason:''},rows:[{id:'r1',title:'کار نمونه',instructions:'شرح',minutes:45,mode:'independent',workerIds:[worker],date:null,unit:null,reason:null,prerequisiteIds:[]}]}
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {resolve,promise}}
function fixture(durableDeskCancel=false){
 let admin=true,visible=true,epoch=7,active=null,calls=[],seq=4,hold=null,user=actor
 const config={mode:'review',durableDeskCancel,expectedProjectRef:ref,projectUrl:'https://'+ref+'.supabase.co',publishableKey:'sb_publishable_fixture',actorId:actor,isVisible:()=>visible,makeId:()=>id(seq++),
  auth:{getSession:async()=>({data:{session:{access_token:'abc.def.ghi'}}}),getUser:async()=>({data:{user:{id:user,is_anonymous:false}}})},
  fetchImpl:async(url,init)=>{
   const rpc=url.split('/').pop(),args=JSON.parse(init.body);calls.push([rpc,args])
   if(rpc==='ops_is_admin')return {ok:true,json:async()=>admin}
   if(!['ops_assignment_batch_write_v1','ops_assignment_batch_control_v1','ops_desk_cancel_write_v1','ops_desk_cancel_control_v1'].includes(rpc))throw Error('UNEXPECTED_RPC')
   if(hold?.action===args.p_action){const h=hold;hold=null;await h.wait.promise}
   if(args.p_action==='reserve')active={kind:rpc==='ops_desk_cancel_write_v1'?'desk_cancel_v1':'batch_direct_v1',status:'reserved',request_id:args.p_request_id}
   if(args.p_action==='commit')active={...active,status:'committed',receipt:{ok:true,kind:'batch_direct_v1',request_id:args.p_request_id,result:{term_id:term,rows:[{row_id:'r1',mode:'independent',group_id:null,minutes_per_worker:45,tasks:[{worker_id:worker,task_id:id(10)}]}],pair_count:1,standard_person_minutes:45}}}
   const projection=rpc==='ops_assignment_batch_control_v1'&&active?.kind==='desk_cancel_v1'?{kind:active.kind,status:active.status,foreign:true}:active
   const view={ok:true,epoch,active:projection,...(rpc.endsWith('control_v1')?{durable_active:false}:{})}
   return {ok:true,json:async()=>view}
  }}
 const o=createDayBatchVerifiedOwner(config)
 const load=()=>{o.selectReadScope('work');o.beginScopedRead('work')('ready')}
 return {o,calls,load,admin:x=>{admin=x},visible:x=>{visible=x},user:x=>{user=x},hold:action=>{const wait=deferred();hold={action,wait};return wait}}
}
test('no network on construction, fresh server admin proof and new scoped read required',async()=>{
 const f=fixture(),{o,calls}=f;f.load()
 assert.equal(calls.length,0);assert.equal(await o.discover(),'blocked');assert.equal(await o.check(),true)
 assert.equal(calls.length,1);assert.equal(calls[0][0],'ops_is_admin');assert.equal(await o.discover(),'blocked')
 f.load();assert.equal(await o.discover(),'idle');assert.equal(o.snapshot().canStart,true)
 assert.equal(await o.submitBatch(draft,context),'committed')
})
test('deny failed verification, invalidate old read and require fresh proof after refresh',async()=>{
 const f=fixture(),{o}=f;assert.equal(await o.check(),true);o.selectReadScope('work');const stale=o.beginScopedRead('work')
 assert.equal(o.authChanged('TOKEN_REFRESHED',{user:{id:actor}}),true);assert.equal(stale('ready'),false)
 f.admin(false);assert.equal(await o.check(),false);assert.equal(o.snapshot().state,'blocked')
 f.admin(true);assert.equal(await o.check(),true);assert.equal(await o.discover(),'blocked');f.load();assert.equal(await o.discover(),'idle')
})
test('suspend in-flight reserve keeps same owner and forbids automatic commit',async()=>{
 const f=fixture(),{o,calls}=f;await o.check();f.load();await o.discover()
 const h=f.hold('reserve'),p=o.submitBatch(draft,context)
 for(let i=0;i<80&&calls.filter(x=>x[1].p_action==='reserve').length===0;i++)await Promise.resolve()
 assert.equal(calls.filter(x=>x[1].p_action==='reserve').length,1)
 f.visible(false);o.suspend();assert.equal(o.snapshot().canStart,false)
 f.visible(true);assert.equal(await o.check(),true);f.load();assert.equal(await o.discover(),'blocked')
 h.resolve();assert.equal(await p,'stale');assert.equal(calls.filter(x=>x[1].p_action==='commit').length,0)
 assert.equal(await o.discover(),'reserved');assert.equal(o.snapshot().canCommit,true);assert.equal(await o.commit(),'committed')
})
test('actor change and logout terminate old owner permanently',async()=>{
 const f=fixture(),{o,calls}=f;await o.check();f.load();await o.discover()
 assert.equal(o.authChanged('SIGNED_IN',{user:{id:id(99)}}),false)
 const n=calls.length;assert.equal(await o.check(),false);assert.equal(await o.submitBatch(draft,context),'blocked');assert.equal(calls.length,n)
 assert.equal(o.snapshot().state,'unavailable')
})

test('typed desk owner blocks writes and hides recovery after admin role denial and actor change',async()=>{
 const f=fixture(true),{o,calls}=f
 const shiftId=id(50),taskId=id(51),day='2026-11-28',d={shiftId,reason:'دلیل نمونه'}
 const c={day,shifts:{ok:true,from:day,to:day,shifts:[{id:shiftId,task_id:taskId,worker_id:worker,shift_date:day,start_minute:480,end_minute:540,state:'scheduled'}]},work:{tasks:[{id:taskId,worker_id:worker,unit:'library',planned_date:day,estimate_minutes:60,state:'assigned'}],time_entries:[]}}
 await o.check();f.load();await o.discover()
 const h=f.hold('reserve'),pending=o.submitDeskCancel(d,c)
 for(let i=0;i<80&&!calls.some(x=>x[0]==='ops_desk_cancel_write_v1'&&x[1].p_action==='reserve');i++)await Promise.resolve()
 assert.equal(calls.filter(x=>x[0]==='ops_desk_cancel_write_v1'&&x[1].p_action==='reserve').length,1)
 o.authChanged('TOKEN_REFRESHED',{user:{id:actor}});f.admin(false);assert.equal(await o.check(),false)
 h.resolve();assert.equal(await pending,'stale');assert.equal(o.snapshot().state,'blocked')
 assert.equal(await o.commit(),'blocked');assert.equal(await o.submitDeskCancel(d,c),'blocked')
 assert.equal(calls.filter(x=>x[1].p_action==='commit').length,0)
 f.admin(true);assert.equal(await o.check(),true);f.load();assert.equal(await o.discover(),'reserved')
 o.authChanged('SIGNED_IN',{user:{id:id(99)}});assert.equal(o.snapshot().state,'unavailable')
 const n=calls.length;assert.equal(await o.commit(),'blocked');assert.equal(await o.cancel(),'blocked');assert.equal(calls.length,n)
})
