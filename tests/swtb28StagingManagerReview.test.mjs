import test from 'node:test'
import assert from 'node:assert/strict'
import {resolveStagingManagerReviewConfig,createStagingManagerFixture} from '../src/lib/stagingManagerReview.mjs'
const ref='abcdefghijklmnopqrst',actor='20000000-0000-4000-8000-000000000001',day='2026-11-28'
const env={DEV:true,VITE_SWTB28_STAGING_REVIEW_UI:'true',VITE_SWTB28_STAGING_PROJECT_REF:ref,VITE_SWTB22_RECOVERY_REVIEW_UI:'true',VITE_SWTB22_RECOVERY_REVIEW_PROJECT_REF:ref,VITE_SWTB23_WORKER_POLICY_RELEASE:'true',VITE_SWTB22_MANAGER_SHELL_UI:'true',VITE_SWTB24_R5_MANAGER_IA_UI:'true',VITE_SUPABASE_URL:'https://'+ref+'.supabase.co',VITE_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture'}
const location={hostname:'127.0.0.1',protocol:'http:'}
const work={workers:[],tasks:[],weekly_slots:[],exceptions:[],time_entries:[]}
function fixture(){
 let current=true,user=actor,token='abc.def.ghi',reply=work,ok=true,hook=null,anon=false
 const calls=[],auth={getSession:async()=>({data:{session:{access_token:token}}}),getUser:async()=>({data:{user:{id:user,is_anonymous:anon}}}),onAuthStateChange:()=>({})}
 const f=createStagingManagerFixture({env,location,auth,actorId:actor,fetchImpl:async(url,init)=>{calls.push([url,init]);return {ok,json:async()=>{hook?.();return reply}}},makeId:()=>actor,today:()=>day})
 return {f,calls,current:()=>current,reply:v=>{reply=v},hide:()=>{current=false},user:v=>{user=v},hook:v=>{hook=v},token:v=>{token=v},fail:()=>{ok=false},anon:()=>{anon=true}}
}
test('explicit local DEV staging config only, production release and missing target fail before client',()=>{
 assert.equal(resolveStagingManagerReviewConfig(env,location).projectUrl,env.VITE_SUPABASE_URL)
 for(const e of [{...env,DEV:false},{...env,VITE_SWTB28_STAGING_REVIEW_UI:'false'},{...env,VITE_SWTB28_STAGING_PROJECT_REF:'other'},{...env,VITE_SUPABASE_URL:'https://pmwxryavkrjcdobwkryw.supabase.co'},{...env,VITE_SUPABASE_PUBLISHABLE_KEY:'sb_secret_fixture'},{...env,VITE_SWTB22_RECOVERY_RELEASE_UI:'true'},{...env,VITE_SWTB23_WORKER_POLICY_RELEASE:'false'}])assert.throws(()=>resolveStagingManagerReviewConfig(e,location),/STAGING_REVIEW_BLOCKED/)
 assert.throws(()=>resolveStagingManagerReviewConfig(env,{hostname:'example.com',protocol:'https:'}),/STAGING_REVIEW_BLOCKED/)
})
test('only four existing exact read RPCs; same actor, fixed POST, no default invocation',async()=>{
 const f=fixture();assert.equal(f.calls.length,0)
 await f.f.readWork(f.current);f.reply([]);await f.f.readCandidates(f.current)
 f.reply({ok:true,terms:[]});await f.f.readTerm(f.current)
 f.reply({ok:true,from:day,to:day,shifts:[]});await f.f.readDeskShifts(day,f.current)
 assert.deepEqual(f.calls.map(x=>[x[0].split('/').pop(),JSON.parse(x[1].body)]),[['ops_get_operations_v3',{}],['ops_list_candidates',{}],['ops_get_operations_term_dashboard',{p_term_id:null,p_unit_code:null,p_worker_id:null}],['ops_get_library_desk_shifts',{p_from:day,p_to:day}]])
 assert.ok(f.calls.every(([url,i])=>url.startsWith(env.VITE_SUPABASE_URL+'/rest/v1/rpc/')&&i.method==='POST'&&i.redirect==='error'&&i.credentials==='omit'&&i.headers.Authorization==='Bearer abc.def.ghi'))
})
test('wrong actor, anonymous, stale guard, malformed day are blocked before fetch',async()=>{
 for(const change of [f=>f.user('wrong'),f=>f.hide(),f=>f.anon()]){
  const f=fixture();change(f);await assert.rejects(()=>f.f.readWork(f.current),/STAGING_REVIEW_BLOCKED/);assert.equal(f.calls.length,0)
 }
 const f=fixture();await assert.rejects(()=>f.f.readDeskShifts('2026-02-31',f.current),/STAGING_REVIEW_BLOCKED/);assert.equal(f.calls.length,0)
})
test('late result, token refresh, invalid scope and HTTP failure do not yield proof',async()=>{
 for(const change of [f=>f.hook(f.hide),f=>f.hook(()=>f.token('new.def.ghi')),f=>f.fail(),f=>f.reply({tasks:[]})]){
  const f=fixture();change(f);await assert.rejects(()=>f.f.readWork(f.current),/STAGING_REVIEW_BLOCKED/);assert.equal(f.calls.length,1)
 }
 const f=fixture();f.reply({ok:true,from:'2026-11-29',to:day,shifts:[]});await assert.rejects(()=>f.f.readDeskShifts(day,f.current),/STAGING_REVIEW_BLOCKED/);assert.equal(f.calls.length,1)
})
