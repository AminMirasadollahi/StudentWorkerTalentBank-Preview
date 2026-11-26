import {workerPrerequisiteStatus,workerReportContract} from './workerReportContract.mjs'
// Explicit release selection. No V2 fallback after V3 is selected, even on RPC failure.
const own=(x,k)=>Object.prototype.hasOwnProperty.call(x,k)
const obj=x=>x&&typeof x==='object'&&!Array.isArray(x)
const iso=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&Number.isFinite(Date.parse(x+'T00:00:00Z'))&&new Date(x+'T00:00:00Z').toISOString().slice(0,10)===x
const open=new Set(['assigned','in_progress','needs_changes'])
const closed=new Set(['submitted','completed','cancelled'])
export function validateWorkerPolicySnapshot(data,workerId){
 if(!obj(data)||!workerId||data.report_contract_version!==1||!iso(data.server_today))throw Error('worker_policy_contract_unavailable')
 if(!Number.isInteger(data.approved_minutes_total)||data.approved_minutes_total<0)throw Error('worker_policy_contract_unavailable')
 for(const name of ['tasks','weekly_slots','exceptions','time_entries']){
  if(!Array.isArray(data[name])||data[name].some(r=>!obj(r)||(r.worker_id!=null&&r.worker_id!==workerId)))throw Error('worker_policy_contract_unavailable')
 }
 const ids=new Set()
 for(const task of data.tasks){
  if(typeof task.id!=='string'||!task.id||ids.has(task.id)||!obj(task.prerequisites)||Object.keys(task.prerequisites).length!==2||!workerPrerequisiteStatus(task).valid||
    !own(task,'report_contract')||!own(task,'latest_report')||!own(task,'desk_slot')||
    !(open.has(task.state)||closed.has(task.state))||
    (open.has(task.state)?!workerReportContract(task):task.report_contract!==null)||
    (task.latest_report!==null&&(!obj(task.latest_report)||typeof task.latest_report.id!=='string'||!task.latest_report.id||
       !iso(task.latest_report.work_date)||!Number.isInteger(task.latest_report.reported_minutes)||
       task.latest_report.reported_minutes<1||task.latest_report.reported_minutes>1440||
       !['submitted','approved','changes_requested','rejected'].includes(task.latest_report.review_state)))||
    (task.desk_slot!==null&&(!obj(task.desk_slot)||!iso(task.desk_slot.date)||!['scheduled','cancelled'].includes(task.desk_slot.state))))
    throw Error('worker_policy_contract_unavailable')
  ids.add(task.id)
 }
 return data
}
export async function readWorkerPolicySnapshot({enabled,readV2,readV3,workerId}){
 if(!enabled)return readV2()
 return validateWorkerPolicySnapshot(await readV3(),workerId)
}
