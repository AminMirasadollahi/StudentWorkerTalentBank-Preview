// Synthetic-only editor contracts. Final authority remains the private server.
const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(x)&&x!=='00000000-0000-0000-0000-000000000000'
const day=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&x>='2000-01-01'&&x<='2100-12-31'&&Number.isFinite(Date.parse(x+'T00:00:00Z'))&&new Date(x+'T00:00:00Z').toISOString().slice(0,10)===x
const len=x=>typeof x==='string'?Array.from(x).length:Infinity
const pgTrim=x=>x.replace(/^ +| +$/g,'')
const integer=(x,min,max)=>typeof x==='string'&&/^\d+$/.test(x)&&Number.isSafeInteger(Number(x))&&Number(x)>=min&&Number(x)<=max
const plus=(d,n)=>new Date(Date.parse(d+'T00:00:00Z')+86400000*n).toISOString().slice(0,10)
const deny=code=>({ok:false,code})
const good=args=>({ok:true,args:Object.freeze(args)})
const units=['library','research','public_relations']
export const extraReasons=Object.freeze({equipment_issue:'مشکل تجهیزات',unexpected_complexity:'پیچیدگی پیش‌بینی‌نشده',instructions_changed:'تغییر دستور کار',skill_gap:'نیاز به یادگیری بیشتر',other:'سایر'})
export function assignmentWindowPayload(d,scope,key,epoch){
 if(!uuid(key)||!Number.isSafeInteger(epoch)||epoch<0||!day(scope?.serverToday)||!scope.term||!uuid(scope.term.id)||scope.term.state!=='active'||!day(scope.term.start_date)||!day(scope.term.end_date)||!Array.isArray(scope.workers)||!Array.isArray(scope.prerequisites))return deny('SCOPE')
 if(!scope.workers.some(w=>w.id===d.workerId&&w.state==='active'&&w.onboarding_state==='ready'&&w.eligibility==='eligible')||!uuid(d.workerId)||!units.includes(d.unit)||(scope.activeUnits!==undefined&&(!Array.isArray(scope.activeUnits)||!scope.activeUnits.includes(d.unit))))return deny('WORKER')
 if(!day(d.start)||!day(d.end)||d.start<scope.serverToday||d.start<scope.term.start_date||d.end>scope.term.end_date||d.start>d.end)return deny('DATE')
 if(len(d.title)>160||len(pgTrim(d.title))<3||len(d.instructions)>3000)return deny('TEXT')
 if(!integer(d.minutes,1,1440))return deny('MINUTES')
 if(len(d.reason)>300||(d.start<plus(scope.serverToday,2)&&!pgTrim(d.reason)))return deny('SHORT_NOTICE')
 if(!Array.isArray(d.prerequisites)||d.prerequisites.length>20||new Set(d.prerequisites).size!==d.prerequisites.length||d.prerequisites.some(id=>!uuid(id)||!scope.prerequisites.some(t=>t.id===id)))return deny('PREREQUISITES')
 return good({p_action:'reserve',p_epoch:epoch,p_request_id:key,p_term_id:scope.term.id,p_worker_id:d.workerId,p_unit:d.unit,p_title:pgTrim(d.title),p_instructions:d.instructions,p_start:d.start,p_end:d.end,p_minutes:Number(d.minutes),p_reason:pgTrim(d.reason)||null,p_prerequisites:Object.freeze([...d.prerequisites].sort())})
}
export function reportWindowPayload(task,d,key){
 const a=task?.window_actions
 if(!uuid(task?.id)||task.schedule_kind!=='single_report_window'||!Number.isSafeInteger(task.window_revision)||task.window_revision<1||!uuid(key)||!a||a.review_only!==true||a.can_submit!==true||a.hold_reason!==null||a.window_empty!==false||!['assigned','in_progress'].includes(task.state))return deny('SCOPE')
 if(!day(d.date)||!day(a.date_min)||!day(a.date_max)||d.date<a.date_min||d.date>a.date_max||d.date<task.window_start||d.date>task.window_end)return deny('DATE')
 if(a.minimum_minutes!==task.estimate_minutes||a.maximum_minutes!==1440||!integer(d.minutes,a.minimum_minutes,a.maximum_minutes)||len(d.note)>2000)return deny('MINUTES')
 const extra=Number(d.minutes)>task.estimate_minutes
 if(extra&&(!Object.hasOwn(extraReasons,d.reasonCode)||len(d.reasonText)>600||len(pgTrim(d.reasonText))<10))return deny('EXTRA_REASON')
 return good({p_task_id:task.id,p_expected_revision:task.window_revision,p_work_date:d.date,p_reported_minutes:Number(d.minutes),p_worker_note:d.note,p_client_submission_id:key,p_extra_reason_code:extra?d.reasonCode:null,p_extra_reason_text:extra?pgTrim(d.reasonText):null})
}
export function reviewWindowPayload(task,entry,d){
 if(!uuid(task?.id)||task.schedule_kind!=='single_report_window'||task.state!=='submitted'||!Number.isSafeInteger(task.window_revision)||task.window_revision<1||!uuid(entry?.id)||entry.task_id!==task.id||entry.worker_id!==task.worker_id||entry.review_state!=='submitted'||!Number.isSafeInteger(entry.reported_minutes)||entry.reported_minutes<1||entry.reported_minutes>1440||!day(entry.work_date)||entry.work_date<task.window_start||entry.work_date>task.window_end)return deny('SCOPE')
 if(!integer(d.minutes,0,entry.reported_minutes)||len(d.note)>1000)return deny('MINUTES')
 if((Number(d.minutes)!==entry.reported_minutes||Number(d.minutes)>task.estimate_minutes)&&!pgTrim(d.note))return deny('REVIEW_REASON')
 return good({p_entry_id:entry.id,p_expected_revision:task.window_revision,p_decision:'approved',p_approved_minutes:Number(d.minutes),p_review_note:pgTrim(d.note)||null})
}

// Validation uses the established report rules; this sentinel is local only,
// discarded before returning V4 args. No client submission UUID is generated.
export function durableReportWindowPayload(task,d){
 const v=reportWindowPayload(task,d,'10000000-0000-4000-8000-000000000001')
 if(!v.ok)return v
 const {p_client_submission_id,...args}=v.args
 return good(args)
}
