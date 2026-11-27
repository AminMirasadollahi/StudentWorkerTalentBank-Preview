import React from 'react'
import {createRoot} from 'react-dom/client'
import WindowEditorReview from '../../src/components/WindowEditorReview.jsx'
import {createWindowEditorSession} from '../../src/lib/windowEditorSession.mjs'
import {id,worker,self,manager} from './windowReadReviewFixtureData.mjs'
import '../../src/typography.css'
import '../../src/styles.css'
const holds=['window_extension','late_submission','correction','term_closure_policy','post_assignment_eligibility_policy','window_prerequisite_edit','nonapproval_review','batch_write']
const mc={status:'verified',role:'manager',actorId:id(98)},wc={status:'verified',role:'worker',actorId:id(99),workerId:worker}
const task=self.tasks[0],approvalTask={...manager.tasks[2],state:'submitted'},entry={...manager.time_entries[0],reported_minutes:150,review_state:'submitted',approved_minutes:null}
const scope={serverToday:self.server_today,term:{id:id(10),state:'active',start_date:'2026-09-23',end_date:'2027-02-09'},workers:[{id:worker,name:'دانشجوکار نمونه',state:'active',onboarding_state:'ready',eligibility:'eligible'}],prerequisites:[{id:id(6),title:'مرتب‌سازی کتاب‌ها'}]}
let epoch=0,active=null,reserved=null,loseCommit=true,loseReport=true,reportArgs=null,reportCount=0
globalThis.__qaEditorCalls=[]
const transport=c=>async(n,a)=>{
 globalThis.__qaEditorCalls.push({name:n,args:a})
 if(n.endsWith('capabilities_v1'))return {contract_version:1,audience:c.role,actor_id:c.actorId,worker_id:c.workerId??null,schedule_contract_version:2,review_only:true,operational_enabled:false,fixture_enabled:true,allowed_schedule_kinds:['legacy_day','single_report_window'],held_operations:holds}
 if(n.endsWith('recovery_v1')){
  if(a.p_action==='cancel')active={...active,status:'cancelled'}
  if(a.p_action==='acknowledge'){epoch++;active=null;reserved=null}
  return {ok:true,epoch,active}
 }
 if(n.endsWith('assignment_v1')){
  if(a.p_action==='reserve'){reserved={...a};active={kind:'single_report_window_v1',request_id:a.p_request_id,status:'reserved'}}
  else{if(JSON.stringify({...a,p_action:'reserve'})!==JSON.stringify(reserved))throw Error('QA_PAYLOAD_CHANGED');active={...active,status:'committed',receipt:{ok:true,request_id:a.p_request_id,kind:'single_report_window_v1',result:{task_id:id(40),worker_id:a.p_worker_id,term_id:a.p_term_id,window_start:a.p_start,window_end:a.p_end,revision:1,standard_minutes:a.p_minutes}}};if(loseCommit){loseCommit=false;throw Error('QA_RESPONSE_LOST')}}
  return {ok:true,epoch,active}
 }
 if(n.endsWith('start_v1'))return {ok:true,state:'in_progress'}
 if(n.endsWith('submit_v1')){if(reportArgs&&JSON.stringify(reportArgs)!==JSON.stringify(a))throw Error('QA_REPORT_CHANGED');if(!reportArgs){reportArgs=a;reportCount++}if(loseReport){loseReport=false;throw Error('QA_RESPONSE_LOST')}return {id:id(41),status:'submitted',replayed:true}}
 if(n.endsWith('review_v1'))return {id:a.p_entry_id,review_state:'approved',approved_minutes:a.p_approved_minutes}
 throw Error('QA_ROUTE_DENIED')
}
const create=c=>createWindowEditorSession({syntheticReviewOnly:true,context:c,fixtureTransport:transport(c)})
const managerSession=create(mc),workerSession=create(wc)
globalThis.__qaReportCount=()=>reportCount
let serial=100
const newId=()=>id(++serial)
function Stage(){
 const [mode,setMode]=React.useState('assignment')
 const s=mode==='report'?workerSession:managerSession
 return <><div dir="rtl" className="we-actions"><button onClick={()=>setMode('assignment')}>واگذاری نمونه</button><button onClick={()=>setMode('report')}>گزارش نمونه</button><button onClick={()=>setMode('approval')}>تأیید نمونه</button></div>
 <WindowEditorReview key={mode} session={s} role={mode==='report'?'worker':'manager'} mode={mode} scope={scope} task={mode==='approval'?approvalTask:task} entry={entry} newId={newId} syntheticReviewOnly/></>
}
createRoot(document.getElementById('root')).render(<Stage/>)
