import test from 'node:test'
import assert from 'node:assert/strict'
import {resolveRecoveryReviewConfig,verifyRecoveryReviewAdmin,createRecoveryReviewLifecycle,assertLegacyAssignmentAllowed} from '../src/lib/recoveryReviewLifecycle.mjs'
async function reviewChecks(resolveConfig,verifyAdmin,createLifecycle){
 const A='00000000-0000-4000-8000-000000000101',B='00000000-0000-4000-8000-000000000102',P='aaaaaaaaaaaaaaaaaaaa'
 const env={VITE_SWTB22_RECOVERY_REVIEW_UI:'true',VITE_SWTB22_RECOVERY_REVIEW_PROJECT_REF:P,VITE_SUPABASE_URL:'https://'+P+'.supabase.co',VITE_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test'}
 let count=0;const check=(ok,label)=>{if(!ok)throw Error(label);count++}
 const reject=async(fn,label)=>{let rejected=false;try{await fn()}catch{rejected=true}check(rejected,label)}
 check(resolveConfig({}).mode==='off','default off')
 check(resolveConfig(env).mode==='review','explicit review')
 for(const e of [{...env,VITE_SUPABASE_URL:undefined},{...env,VITE_SUPABASE_PUBLISHABLE_KEY:'sb_secret_test'},{...env,VITE_SUPABASE_URL:'https://other.supabase.co'},{...env,VITE_SWTB22_RECOVERY_REVIEW_PROJECT_REF:'pmwxryavkrjcdobwkryw',VITE_SUPABASE_URL:'https://pmwxryavkrjcdobwkryw.supabase.co'}])check(resolveConfig(e).mode==='blocked','wrong config')
 let current=true,actor=A,token='fake.token.one',role=true,calls=[],getCount=0,replaceToken=false
 const cfg={projectUrl:env.VITE_SUPABASE_URL,publishableKey:env.VITE_SUPABASE_PUBLISHABLE_KEY,actorId:A,isCurrent:()=>current,auth:{getSession:async()=>({data:{session:{access_token:replaceToken&&++getCount>1?'fake.token.two':token}}}),getUser:async()=>({data:{user:{id:actor}}})},fetchImpl:async(url,opt)=>{calls.push({url,opt});return {ok:true,json:async()=>role}}}
 check((await verifyAdmin(cfg)).user.id===A,'verified role')
 check(calls[0].url.endsWith('/ops_is_admin')&&calls[0].opt.headers.Authorization==='Bearer fake.token.one','fixed token')
 actor=B;await reject(()=>verifyAdmin(cfg),'wrong actor');check(calls.length===1,'no wrong actor RPC');actor=A
 replaceToken=true;await reject(()=>verifyAdmin(cfg),'token changes');check(calls.length===1,'no changed-token RPC');replaceToken=false
 role=false;await reject(()=>verifyAdmin(cfg),'not admin');role=true
 current=false;await reject(()=>verifyAdmin(cfg),'invalidated');current=true
 let seq=0,ticket=null,disposed=false,visible=true,events=[],pending=[]
 const f=Object.freeze({version:2})
 const binding={beginCheck:()=>ticket=++seq,accept:(t,i)=>t===ticket&&i?.user?.id===A?f:null,fail:t=>{if(t===ticket)ticket=null},invalidate:()=>{ticket=null},dispose:()=>{disposed=true}}
 const l=createLifecycle({binding,actorId:A,isVisible:()=>visible,notify:s=>events.push(s),verify:({isCurrent})=>new Promise(r=>pending.push({r,isCurrent}))})
 const p1=l.check();check(events.at(-1).status==='checking','checking')
 l.suspend();check(!pending[0].isCurrent(),'old proof invalid')
 const p2=l.check();pending[0].r({role:'admin',user:{id:A}});check(await p1===false,'stale proof')
 pending[1].r({role:'admin',user:{id:A}});check(await p2===true&&events.at(-1).fixture===f,'fresh proof')
 check(l.authChanged('TOKEN_REFRESHED',{user:{id:A}})===true&&events.at(-1).status==='checking','refresh suspend')
 const p3=l.check();visible=false;l.suspend();pending[2].r({role:'admin',user:{id:A}});check(await p3===false,'hidden stale')
 visible=true;const p4=l.check();check(l.authChanged('SIGNED_IN',{user:{id:B}})===false,'actor switch')
 pending[3].r({role:'admin',user:{id:A}});check(await p4===false&&events.at(-1).terminal===true&&events.at(-1).fixture===null,'terminal no reactivation')
 check(await l.check()===false,'terminal check blocked')
 l.dispose();check(disposed,'dispose')
 return count
}
test('review target, fixed token role proof and auth lifecycle',async()=>{if(await reviewChecks(resolveRecoveryReviewConfig,verifyRecoveryReviewAdmin,createRecoveryReviewLifecycle)!==24)throw Error('ASSERTION_COUNT')})

test('release opt-in pinned to exact production target; mutually exclusive; no legacy fallback',()=>{
 const P='pmwxryavkrjcdobwkryw'
 const env={VITE_SWTB22_RECOVERY_RELEASE_UI:'true',VITE_SWTB22_RECOVERY_RELEASE_PROJECT_REF:P,VITE_SUPABASE_URL:'https://'+P+'.supabase.co',VITE_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_build_only'}
 assert.equal(resolveRecoveryReviewConfig(env).mode,'release')
 assert.doesNotThrow(()=>assertLegacyAssignmentAllowed({}))
 assert.throws(()=>assertLegacyAssignmentAllowed(env),/SWTB22_LEGACY_ASSIGNMENT_BLOCKED/)
 for(const e of [{...env,VITE_SWTB22_RECOVERY_REVIEW_UI:'true'},{...env,VITE_SWTB22_RECOVERY_RELEASE_PROJECT_REF:undefined},{...env,VITE_SUPABASE_URL:undefined},{...env,VITE_SUPABASE_PUBLISHABLE_KEY:undefined},{...env,VITE_SUPABASE_PUBLISHABLE_KEY:'sb_secret_test'},{...env,VITE_SUPABASE_URL:'https://other.supabase.co'},{...env,VITE_SWTB22_RECOVERY_RELEASE_PROJECT_REF:'aaaaaaaaaaaaaaaaaaaa',VITE_SUPABASE_URL:'https://aaaaaaaaaaaaaaaaaaaa.supabase.co'}]){
  assert.equal(resolveRecoveryReviewConfig(e).mode,'blocked')
  assert.throws(()=>assertLegacyAssignmentAllowed(e),/SWTB22_LEGACY_ASSIGNMENT_BLOCKED/)
 }
 assert.equal(resolveRecoveryReviewConfig({...env,VITE_SWTB22_RECOVERY_RELEASE_UI:'false'}).mode,'off')
})
