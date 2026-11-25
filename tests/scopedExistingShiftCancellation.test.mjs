import test from 'node:test'
import {createScopedRecoveryHttpTransport} from '../src/lib/scopedRecoveryHttpTransport.mjs'
import {createRecoveryAccessBinding} from '../src/lib/recoveryAccessBinding.mjs'
async function cancellationChecks(createTransport,createBinding){
 const A='00000000-0000-4000-8000-000000000101',B='00000000-0000-4000-8000-000000000102',S='00000000-0000-4000-8000-000000000301';
 const args={shiftId:S,reason:'authorized synthetic reason'};
 let actor=A,token='fake.token.one',visible=true,answer={ok:true,shift_id:S,state:'cancelled'},calls=[],defer=null,mode='normal';
 const cfg={projectUrl:'https://synthetic.supabase.co',publishableKey:'sb_publishable_test',auth:{getSession:async()=>({data:{session:{access_token:token}}}),getUser:async()=>({data:{user:{id:actor}}})},makeId:()=>S,isVisible:()=>visible,createTransport,fetchImpl:async(url,options)=>{calls.push({url,options});if(mode==='defer')return await new Promise(r=>{defer=r});if(mode==='http')return {ok:false,status:503};return {ok:true,json:async()=>answer}}};
 const gate=createBinding(cfg),identity=id=>({role:'admin',user:{id}}),a=gate.accept(gate.beginCheck(),identity(A));
 let checks=0;const check=(ok,label)=>{if(!ok)throw Error(label);checks++};
 const reject=async(fn,label)=>{let rejected=false;try{await fn()}catch{rejected=true}check(rejected,label)};
 check((await a.cancelExistingShift(args)).state==='cancelled','confirmed');
 check(calls.length===1&&calls[0].url.endsWith('/ops_cancel_library_desk_shift'),'exact endpoint');
 check(JSON.stringify(JSON.parse(calls[0].options.body))===JSON.stringify({p_shift_id:S,p_reason:args.reason}),'exact payload');
 check(calls[0].options.headers.Authorization==='Bearer fake.token.one'&&calls[0].options.redirect==='error','bound auth');
 for(const bad of [{...args,actorId:A},{...args,shiftId:'bad'},{...args,reason:'a'},{...args,reason:' padded '},{...args,reason:'x'.repeat(501)}])await reject(()=>a.cancelExistingShift(bad),'invalid input');
 check(calls.length===1,'no invalid dispatch');
 actor=B;await reject(()=>a.cancelExistingShift(args),'wrong actor');check(calls.length===1,'wrong actor no dispatch');actor=A;
 answer={ok:true,shift_id:B,state:'cancelled'};await reject(()=>a.cancelExistingShift(args),'wrong receipt');
 answer={ok:true,shift_id:S,state:'scheduled'};await reject(()=>a.cancelExistingShift(args),'wrong state');
 answer={ok:true,shift_id:S,state:'cancelled',extra:1};await reject(()=>a.cancelExistingShift(args),'extra response');
 answer={ok:true,shift_id:S,state:'cancelled'};mode='http';const n=calls.length;await reject(()=>a.cancelExistingShift(args),'http');check(calls.length===n+1,'no retry');
 mode='defer';const pending=a.cancelExistingShift(args);while(!defer)await Promise.resolve();const proof=gate.beginCheck();check(gate.accept(proof,identity(A))===a,'same scope');
 defer({ok:true,json:async()=>answer});await reject(()=>pending,'late response rejected');mode='normal';
 visible=false;await reject(()=>a.cancelExistingShift(args),'hidden');visible=true;
 gate.invalidate();await reject(()=>a.cancelExistingShift(args),'invalidated');
 actor=B;const b=gate.accept(gate.beginCheck(),identity(B));check(b!==a,'new scope');check((await b.cancelExistingShift(args)).ok===true,'new actor scope');
 return checks
}
test('scoped cancellation uses exact existing RPC and rejects stale or malformed outcomes',async()=>{if(await cancellationChecks(createScopedRecoveryHttpTransport,createRecoveryAccessBinding)!==23)throw Error('ASSERTION_COUNT')})
