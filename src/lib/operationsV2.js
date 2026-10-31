// Isolated versioned operations API, intentionally not wired into public applicant intake.
// Requires independently reviewed private Supabase v2 migrations before deployment.
import {opsClient} from './operations'
function dataOrThrow({data,error}) {
 if(error)throw error
 if(data?.error)throw new Error(data.error)
 return data
}
const rpc=(name,args)=>opsClient.rpc(name,args).then(dataOrThrow)
export const getAdminWorkV2=()=>rpc('ops_get_operations_v3')
export const getMyWorkV2=()=>rpc('ops_get_my_work_v2')
export const getMyWorkerProfileV2=()=>rpc('ops_get_my_worker_profile_v2')
export const getMyProfileChangeRequests=()=>rpc('ops_get_my_profile_change_requests')
export const requestProfileChange=({field,value,reason})=>rpc('ops_request_profile_change',{
 p_field:field,p_value:value,p_reason:reason,
})
export const reviewProfileChange=({requestId,decision,note})=>rpc('ops_review_profile_change',{
 p_request_id:requestId,p_decision:decision,p_note:note||null,
})
// Unit belongs to the assigned work, NEVER inferred from the worker's enrollment unit.
// New RPC preserves atomic group assignment and manager-only authorization.
export const assignGroupTask=({workerIds,unit,title,instructions,date,minutes,shortNoticeReason})=>
 rpc('ops_assign_group_task_for_unit',{
  p_worker_ids:workerIds,p_unit_code:unit,p_title:title,p_instructions:instructions,
  p_planned_date:date,p_estimate_minutes:Number(minutes),
  p_short_notice_reason:shortNoticeReason||null,
 })
export const getUnitHourTotals=()=>rpc('ops_get_unit_hour_totals_v1')
