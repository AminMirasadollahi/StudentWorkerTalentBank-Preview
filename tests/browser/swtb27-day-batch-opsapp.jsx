// Synthetic Chrome harness: actual React editors and shared owner, no Supabase import.
import React,{useState} from 'react'
import {createRoot} from 'react-dom/client'
import DayBatchManagerReviewHost from '../../src/components/DayBatchManagerReviewHost.jsx'
import OpsApp from '../../src/OpsApp.jsx'
import '../../src/manager-shell.css'
import '../../src/typography.css'
import '../../src/styles.css'
import '../../src/production-polish.css'
import '../../src/report.css'
import '../../src/ops.css'
import '../../src/operations-workspace.css'
const assert={ok:x=>{if(!x)throw Error('FAKE_ASSERT')},equal:(a,b)=>{if(a!==b)throw Error('FAKE_EQUAL')}}
const id=n=>'20000000-0000-4000-8000-'+String(n).padStart(12,'0')
const actor=id(1),worker=id(2),term=id(3)
const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{calendar:'gregory',timeZone:'Asia/Tehran',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).map(x=>[x.type,x.value]))
const today=[parts.year,parts.month,parts.day].join('-'),date=new Date(Date.now()+7*86400000).toISOString().slice(0,10)
const context={today,defaultDate:date,term:{id:term,state:'active',start_date:today,end_date:new Date(Date.now()+90*86400000).toISOString().slice(0,10)},workers:[{id:worker,name:'دانشجوکار الف',state:'active'},{id:id(5),name:'دانشجوکار ب',state:'active'}],data:{tasks:[],weekly_slots:[],exceptions:[]}}
function fixture(initial=null){
 let active=initial,epoch=7,seq=20,mode='',reads=0,adminWait=null
 const listeners=new Set();let currentActor=actor;let signedIn=true
 const calls=[]
 const transport=async(url,init)=>{
  assert.ok(url.startsWith('https://abcdefghijklmnopqrst.supabase.co/rest/v1/rpc/'))
  const rpc=url.split('/').pop(),a=JSON.parse(init.body);calls.push([rpc,a])
  if(rpc==='ops_is_admin'){if(adminWait){const pending=adminWait;adminWait=null;await pending}return {ok:true,json:async()=>true}}
  assert.ok(['ops_assignment_batch_write_v1','ops_assignment_batch_control_v1','ops_assignment_recovery_write_v3','ops_assignment_recovery_control_v2'].includes(rpc))
  const batch=rpc.includes('_batch_'),control=rpc.endsWith('control_v1')||rpc.endsWith('control_v2')
  if(a.p_action==='reserve'){
   assert.equal(active,null);assert.equal(a.p_epoch,epoch)
   active={kind:batch?'batch_direct_v1':a.p_kind,status:'reserved',request_id:a.p_request_id}
  }
  if(a.p_action==='commit'){
   assert.equal(active.request_id,a.p_request_id);assert.equal(active.status,'reserved')
   const result=batch?{term_id:term,rows:a.p_rows.map((r,i)=>({row_id:r.id,mode:r.mode,group_id:null,minutes_per_worker:r.minutes,tasks:r.worker_ids.map((w,j)=>({worker_id:w,task_id:id(100+i*10+j)}))})),pair_count:a.p_rows.reduce((n,r)=>n+r.worker_ids.length,0),standard_person_minutes:a.p_rows.reduce((n,r)=>n+r.worker_ids.length*r.minutes,0)}:{id:id(101),state:'assigned',short_notice:false}
   active={...active,status:'committed',receipt:{ok:true,kind:active.kind,request_id:active.request_id,result}}
  }
  if(a.p_action==='cancel'){assert.equal(active.request_id,a.p_request_id);active={...active,status:'cancelled'}}
  if(a.p_action==='acknowledge'){assert.equal(active.request_id,a.p_request_id);active=null;epoch++}
  if(mode===a.p_action){mode='';throw Error('SYNTHETIC_LOST_RESPONSE')}
  if(!batch&&active?.kind==='batch_direct_v1')throw Error('LEGACY_UPGRADE_REQUIRED')
  const projection=batch&&a.p_action==='discover'&&active&&active.kind!=='batch_direct_v1'?{kind:active.kind,status:active.status,foreign:true}:active
  const result={ok:true,epoch,active:projection,...(batch&&control?{durable_active:false}:{})}
  return {ok:true,json:async()=>structuredClone(result)}
 }
 const config=Object.freeze({mode:'synthetic-review',actorId:actor,expectedProjectRef:'abcdefghijklmnopqrst',projectUrl:'https://abcdefghijklmnopqrst.supabase.co',publishableKey:'sb_publishable_fixture',
  auth:{getSession:async()=>({data:{session:signedIn?{access_token:'abc.def.ghi'}:null}}),getUser:async()=>({data:{user:signedIn?{id:currentActor,is_anonymous:false}:null}}),onAuthStateChange:fn=>{listeners.add(fn);return {data:{subscription:{unsubscribe(){listeners.delete(fn)}}}}}},
  makeId:()=>id(seq++),fetchImpl:transport,read:async scope=>{reads++;return scope==='work'?structuredClone(context):{rows:[]}}})
 return {config,calls,reads:()=>reads,lose:action=>{mode=action},auth:event=>{if(event==='SIGNED_OUT')signedIn=false;for(const fn of [...listeners])fn(event,signedIn?{user:{id:currentActor}}:null)},setActor:value=>{currentActor=value},holdAdmin:()=>{let release;adminWait=new Promise(r=>release=r);return release},server:()=>active}
}

const f=fixture()
globalThis.__qaWriteAttempts=0
// Only counters / synthetic fault controls are exposed; no real identity or records.
globalThis.__qaDayBatch={counts:()=>({reserves:f.calls.filter(x=>x[1].p_action==='reserve').length,commits:f.calls.filter(x=>x[1].p_action==='commit').length,acks:f.calls.filter(x=>x[1].p_action==='acknowledge').length,reads:f.reads(),admin:f.calls.filter(x=>x[0]==='ops_is_admin').length,legacyFallback:globalThis.__qaWriteAttempts}),lose:f.lose,refresh:()=>f.auth('TOKEN_REFRESHED'),logout:()=>f.auth('SIGNED_OUT'),holdAdmin:f.holdAdmin}

globalThis.__qaAdminWork={...context.data,workers:context.workers,time_entries:[],profile_requests:[],approved_minutes_total:0}
globalThis.__qaGeneralOffers=[];globalThis.__qaDeskOffers=[]
let termMode='valid',termReads=0
const dashboard=()=>({ok:true,term:context.term,terms:[context.term],units:[],weeks:[],workers:[],pools:[]})
const workspaceFixture=Object.freeze({...f.config,today:()=>today,readTerm:async()=>{termReads++;if(termMode==='failed')throw Error('FAKE_TERM_READ_FAILED');if(termMode==='missing')return {...dashboard(),term:null,terms:[]};return structuredClone(dashboard())}})

let identityReads=0,candidateReads=0,identityWait=null,role='admin',candidateFail=false,reportReads=0
const user=()=>f.config.auth.getUser().then(r=>r.data.user)
const forbid=()=>{globalThis.__qaWriteAttempts++;throw Error('SYNTHETIC_FORBIDDEN_WRITE')}
globalThis.__qaOpsAppApi={
 auth:f.config.auth,forbid,
 identity:async()=>{identityReads++;if(identityWait){const wait=identityWait;identityWait=null;await wait}const u=await user();return u?{user:u,role}:null},
 candidates:async()=>{candidateReads++;if(candidateFail)throw Error('SYNTHETIC_CANDIDATE_READ_FAILED');return [{id:id(80),full_name:'داوطلب کاملاً مصنوعی',major:'رشته نمونه',entry_year:1404,primary_unit:'library',interview_status:'pending',clearance_status:'pending'}]},
 rpc:async name=>{if(name==='ops_get_admin_student_worker_report'){reportReads++;return {data:null,error:{code:'SYNTHETIC_REPORT_UNAVAILABLE'}}}if(name==='ops_get_operations_v3')return {data:structuredClone(globalThis.__qaAdminWork),error:null};return forbid()},
 logout:async()=>f.auth('SIGNED_OUT')
}
const injected=Object.freeze({Host:DayBatchManagerReviewHost,fixture:workspaceFixture})
globalThis.__qaOpsApp={counts:()=>({identityReads,candidateReads,termReads,reportReads}),holdIdentity:()=>{let release;identityWait=new Promise(r=>release=r);return release},candidateFail:value=>{candidateFail=value},role:value=>{role=value},changeActor:()=>{f.setActor(id(90));f.auth('TOKEN_REFRESHED')}}
createRoot(document.getElementById('root')).render(<OpsApp r5IaFixture dayBatchReviewFixture={injected}/>)
