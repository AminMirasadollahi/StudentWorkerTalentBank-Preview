import {test} from 'node:test'
import {createRecoveryAccessBinding} from '../src/lib/recoveryAccessBinding.mjs'
async function checkRecoveryAccessBinding(createBinding){
 const A='00000000-0000-4000-8000-000000000101',B='00000000-0000-4000-8000-000000000102'
 const identity=(id,role='admin')=>({role,user:{id,is_anonymous:false}})
 let visible=true,requests=0,pending=null,guard=null
 const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r});return {promise,resolve}}
 const make=()=>createBinding({projectUrl:'https://synthetic.supabase.co',publishableKey:'sb_publishable_test',auth:{getSession(){},getUser(){}},fetchImpl(){throw Error('NO_NETWORK')},makeId:()=>A,isVisible:()=>visible,createTransport:({actorId,isCurrent})=>{guard=isCurrent;return {write:async()=>{requests++;pending=deferred();return pending.promise},control:async()=>{requests++;return actorId}}}})
 let pass=0
 const assert=(x,label)=>{if(!x)throw Error(label);pass++}
 const rejects=async(fn,label)=>{let ok=false;try{await fn()}catch{ok=true}assert(ok,label)}
 const c=make()
 const t1=c.beginCheck(),t2=c.beginCheck()
 assert(c.accept(t1,identity(A))===null,'stale proof')
 const a=c.accept(t2,identity(A));assert(a?.version===2&&!a.manualReserve,'accepted scope')
 assert(c.accept(t2,identity(A))===null,'single use proof')
 assert(await a.control({})===A,'actor bound')
 const op=a.write({});const old=guard
 const t3=c.beginCheck();assert(!old(),'blocked during check')
 await rejects(()=>a.control({}),'blocked before transport')
 assert(c.accept(t3,identity(A))===a,'same fixture')
 assert(!old(),'old generation remains invalid')
 pending.resolve('late');await rejects(()=>op,'late response rejected')
 assert(await a.control({})===A,'new generation')
 const t4=c.beginCheck();assert(c.accept(t4,identity(B))===null,'silent account switch rejected')
 await rejects(()=>a.control({}),'old actor revoked')
 const b=c.accept(c.beginCheck(),identity(B));assert(b!==a&&await b.control({})===B,'new explicit actor')
 c.invalidate();await rejects(()=>b.control({}),'logout blocked')
 const a2=c.accept(c.beginCheck(),identity(A));assert(a2!==a,'A B A new scope')
 await rejects(()=>a.control({}),'old A still denied')
 visible=false;await rejects(()=>a2.control({}),'hidden denied')
 visible=true
 const t5=c.beginCheck();c.fail(t5);assert(c.accept(t5,identity(A))===null,'failed proof')
 assert(c.accept(c.beginCheck(),identity(A,'worker'))===null,'worker denied')
 assert(c.accept(c.beginCheck(),{role:'admin',user:{id:A,is_anonymous:true}})===null,'anonymous denied')
 const a3=c.accept(c.beginCheck(),identity(A));c.dispose();await rejects(()=>a3.write({}),'dispose blocks')
 assert(requests===4,'no transport on blocked calls')
 return pass
}
test('scope generation, stale proof, actor switch and blocked calls',async()=>{if(await checkRecoveryAccessBinding(createRecoveryAccessBinding)!==22)throw Error('ASSERTION_COUNT')})
