// Synthetic Chrome harness: actual React editors and shared owner, no Supabase import.
import React,{useState} from 'react'
import {createRoot} from 'react-dom/client'
import DayBatchManagerReviewHost from '../../src/components/DayBatchManagerReviewHost.jsx'
import BatchAssignmentPreview from '../../src/components/BatchAssignmentPreview.jsx'
import TaskAssignmentEditor from '../../src/components/TaskAssignmentEditor.jsx'
import '../../src/typography.css'
import '../../src/styles.css'
import '../../src/production-polish.css'
import '../../src/report.css'
import '../../src/ops.css'
import '../../src/operations-workspace.css'
const assert={ok:x=>{if(!x)throw Error('FAKE_ASSERT')},equal:(a,b)=>{if(a!==b)throw Error('FAKE_EQUAL')}}
const id=n=>'20000000-0000-4000-8000-'+String(n).padStart(12,'0')
const actor=id(1),worker=id(2),term=id(3)
const today=new Date().toISOString().slice(0,10),date=new Date(Date.now()+7*86400000).toISOString().slice(0,10)
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
function Stage(){
 const [view,setView]=useState('batch')
 return <main className="report-shell report-shell--dashboard ops-root" dir="rtl">
  <header className="report-header"><div><h1>واگذاری کارها — بررسی مصنوعی</h1><p>هیچ ارتباطی با داده‌های عملیاتی وجود ندارد.</p></div></header>
  <nav aria-label="مسیرهای واگذاری آزمایشی" className="ow-tabs">
   {[['batch','واگذاری مجموعه‌ای'],['direct','واگذاری مستقیم'],['report','گزارش‌ها']].map(([key,label])=><button key={key} type="button" aria-pressed={view===key} onClick={()=>setView(key)}>{label}</button>)}
  </nav>
  <DayBatchManagerReviewHost fixture={f.config} scope={view==='report'?'report':'work'}>{p=>view==='batch'?<BatchAssignmentPreview key={p.batchPort.editorRevision} context={p.context} reviewPort={p.batchPort}/>:<TaskAssignmentEditor key={p.legacyPort.editorRevision} retentionKey="direct-task" workers={p.context.workers} data={p.context.data} defaultWorkerId={worker} defaultDate={date} assignmentReceiptPort={p.legacyPort}/>}</DayBatchManagerReviewHost>
 </main>
}
createRoot(document.getElementById('root')).render(<Stage/>)
