// Synthetic Chrome harness: actual React editors and shared owner, no Supabase import.
import React,{useState} from 'react'
import {createRoot} from 'react-dom/client'
import DayBatchManagerReviewHost from '../../src/components/DayBatchManagerReviewHost.jsx'
import {AdminOperations} from '../../src/OperationsWorkspace.jsx'
import {createWorkPoolRouteFence} from '../../src/lib/workPoolRouteFence.mjs'
import {sameManagerRoute,DISCARD_DRAFT_MESSAGE} from '../../src/lib/managerDraftGuard.mjs'
import ManagerWorkspaceNav from '../../src/components/ManagerWorkspaceNav.jsx'
import ManagerWorkHubTabs from '../../src/components/ManagerWorkHubTabs.jsx'
import {currentManagerDestination,nextManagerNavigation} from '../../src/lib/managerWorkspaceNav.mjs'
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
 let active=initial,epoch=7,seq=20,mode='',callback=null,reads=0,adminWait=null
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
  auth:{getSession:async()=>({data:{session:{access_token:'abc.def.ghi'}}}),getUser:async()=>({data:{user:{id:actor,is_anonymous:false}}}),onAuthStateChange:fn=>{callback=fn;return {data:{subscription:{unsubscribe(){callback=null}}}}}},
  makeId:()=>id(seq++),fetchImpl:transport,read:async scope=>{reads++;return scope==='work'?structuredClone(context):{rows:[]}}})
 return {config,calls,reads:()=>reads,lose:action=>{mode=action},auth:event=>callback?.(event,{user:{id:actor}}),holdAdmin:()=>{let release;adminWait=new Promise(r=>release=r);return release},server:()=>active}
}

const f=fixture()
globalThis.__qaWriteAttempts=0
// Only counters / synthetic fault controls are exposed; no real identity or records.
globalThis.__qaDayBatch={counts:()=>({reserves:f.calls.filter(x=>x[1].p_action==='reserve').length,commits:f.calls.filter(x=>x[1].p_action==='commit').length,acks:f.calls.filter(x=>x[1].p_action==='acknowledge').length,reads:f.reads(),admin:f.calls.filter(x=>x[0]==='ops_is_admin').length,legacyFallback:globalThis.__qaWriteAttempts}),lose:f.lose,refresh:()=>f.auth('TOKEN_REFRESHED'),logout:()=>f.auth('SIGNED_OUT'),holdAdmin:f.holdAdmin}

globalThis.__qaAdminWork={...context.data,workers:context.workers,time_entries:[],profile_requests:[],approved_minutes_total:0}
// The legacy WorkPool read fixture also needs a concrete term, independent of the typed proof provider.
globalThis.__qaTerm=structuredClone(context.term)
globalThis.__qaGeneralOffers=[];globalThis.__qaDeskOffers=[]
let termMode='missing',termReads=0
const dashboard=()=>({ok:true,term:context.term,terms:[context.term],units:[],weeks:[],workers:[],pools:[],filters:{unit_code:null,worker_id:null},allocation_scope:'all_workers'})
const workspaceFixture=Object.freeze({...f.config,today:()=>today,readTerm:async()=>{termReads++;if(termMode==='failed')throw Error('FAKE_TERM_READ_FAILED');if(termMode==='missing')return {...dashboard(),term:null,terms:[]};return structuredClone(dashboard())}})
const flags={r5IaFixture:true}
function Workspace({navigation,commitNavigation,port,draftGuard,fence,revision}){
 const setNavigation=change=>{
  const next=typeof change==='function'?change(navigation):change
  if(!fence.permitsNavigation(navigation,next)||!draftGuard.permitsNavigation(navigation,next,()=>window.confirm(DISCARD_DRAFT_MESSAGE)))return false
  commitNavigation(prev=>{const candidate=typeof change==='function'?change(prev):change;return fence.permitsNavigation(prev,candidate)&&sameManagerRoute(next,candidate)?candidate:prev})
  return true
 }
 const navigate=item=>setNavigation(prev=>nextManagerNavigation(prev,item))
 return <main className="report-shell report-shell--dashboard ops-root swtb22-manager-enabled" dir="rtl">
  <ManagerWorkspaceNav navigation={navigation} {...flags} onNavigate={navigate}/>
  <div className="swtb22-manager-main"><header className="report-header"><h1>{currentManagerDestination(navigation,flags)?.label}</h1><p>بررسی مصنوعی محیط مدیریت</p></header>
   <ManagerWorkHubTabs navigation={navigation} flags={flags} onNavigate={navigate}/>
   {navigation.section==='work'?<AdminOperations navigation={navigation} setNavigation={setNavigation} hideSectionTabs refreshRevision={revision} assignmentReceiptPort={port} workPoolRouteFence={fence}/>:port.panel}
  </div>
 </main>
}
function Stage(){
 const [navigation,commitNavigation]=useState({section:'work',workView:'tasks',workPoolKind:'general',candidateView:'report',candidateFilter:'all',workerId:'',historyWorkerId:''})
 const [fence]=useState(createWorkPoolRouteFence)
 const [revision,setRevision]=useState(0),[checking,setChecking]=useState(false)
 globalThis.__qaWorkspace={termMode:value=>{termMode=value;setRevision(v=>v+1)},termReads:()=>termReads,refresh:()=>setRevision(v=>v+1),checking:setChecking,readFail:value=>{globalThis.__qaAssignmentReadFail=value;setRevision(v=>v+1)}}
 return <DayBatchManagerReviewHost workspace fixture={workspaceFixture} checking={checking} scope={navigation.section==='work'?'work':'report'}>{({workspacePort,draftGuard})=><Workspace navigation={navigation} commitNavigation={commitNavigation} port={workspacePort} draftGuard={draftGuard} fence={fence} revision={revision}/>}</DayBatchManagerReviewHost>
}
createRoot(document.getElementById('root')).render(<Stage/>)
