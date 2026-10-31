// Management dashboard projection only: never mutates worker data or calls APIs.
// Task workflow stage is categorical. Approved minutes are NOT a percentage of work.
const openStages=new Set(['assigned','in_progress','submitted','needs_changes'])
const stages=Object.freeze({
  assigned:{label:'واگذار شده',step:1},
  in_progress:{label:'در حال انجام',step:2},
  needs_changes:{label:'نیازمند اصلاح',step:2},
  submitted:{label:'منتظر بررسی',step:3},
  completed:{label:'تکمیل‌شده',step:4},
  cancelled:{label:'لغوشده',step:null},
})
const iso=/^\d{4}-\d{2}-\d{2}$/
const validDay=value=>typeof value==='string'&&iso.test(value)&&
  !Number.isNaN(Date.parse(value+'T00:00:00Z'))&&
  new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value

export function describeTaskWorkflow(task,reports=[]){
  const stage=stages[task?.state]||{label:'وضعیت نامشخص',step:null}
  const matching=reports.filter(r=>r.task_id===task?.id)
  const approved=matching.filter(e=>e.review_state==='approved')
  return {
    ...stage,
    isOpen:openStages.has(task?.state),
    reportCount:matching.length,
    waitingCount:matching.filter(e=>e.review_state==='submitted').length,
    approvedMinutes:approved.reduce((sum,e)=>sum+Number(e.approved_minutes||0),0),
    isHistoricalDate:validDay(task?.planned_date),
  }
}

export function selectManagerTasks(data,filters={}){
  const worker=filters.workerId||'',unit=filters.unit||'',state=filters.state||'',search=String(filters.search||'').trim().toLocaleLowerCase('fa')
  const tasks=(data?.tasks||[]).filter(task=>
    (!worker||task.worker_id===worker)&&
    (!unit||task.unit===unit)&&
    (!state||task.state===state)&&
    (!search||String(task.title||'').toLocaleLowerCase('fa').includes(search)))
  const asc=filters.order==='oldest'
  return [...tasks].sort((a,b)=>{
    const c=String(a.planned_date||'').localeCompare(String(b.planned_date||''))
    if(c)return asc?c:-c
    const time=String(a.created_at||'').localeCompare(String(b.created_at||''))
    if(time)return asc?time:-time
    return String(a.id).localeCompare(String(b.id))
  })
}

export function summarizeTaskWorkflow(tasks){
  const list=tasks||[]
  return {
    total:list.length,
    open:list.filter(task=>openStages.has(task.state)).length,
    waiting:list.filter(task=>task.state==='submitted').length,
    completed:list.filter(task=>task.state==='completed').length,
    cancelled:list.filter(task=>task.state==='cancelled').length,
    needsChanges:list.filter(task=>task.state==='needs_changes').length,
  }
}

export function classifyTimeRequest(entry,task){
  // Missing task/standard duration cannot truthfully be called 'ordinary'.
  const requested=Number(entry?.reported_minutes)
  const standard=Number(task?.estimate_minutes)
  if(!task || !Number.isFinite(requested)||!Number.isFinite(standard)||
     standard<=0 || requested<0)return 'unknown'
  return requested>standard?'extra':'standard'
}

export function selectPendingApprovals(data,filters={}){
  const tasks=new Map((data?.tasks||[]).map(t=>[t.id,t]))
  const worker=filters.workerId||'',unit=filters.unit||'',kind=filters.kind||''
  return [...(data?.time_entries||[])].filter(e=>
    e.review_state==='submitted'&&
    (!worker||e.worker_id===worker)&&
    (!unit||tasks.get(e.task_id)?.unit===unit)&&
    (!kind||classifyTimeRequest(e,tasks.get(e.task_id))===kind))
    .sort((a,b)=>{
      const x=Date.parse(a.submitted_at||''),y=Date.parse(b.submitted_at||'')
      const t=(Number.isFinite(x)?x:Number.MAX_SAFE_INTEGER)-
        (Number.isFinite(y)?y:Number.MAX_SAFE_INTEGER)
      return t||String(a.id).localeCompare(String(b.id))
    })
}
