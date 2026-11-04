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

// SWTB17: only manager-verified RPCs may create or cancel routine desk shifts.
// A read failure must fail closed in the editor: never fall back to generic
// task assignment because it lacks time bounds and concurrent seat checks.
export const getLibraryDeskShifts=({from,to})=>rpc('ops_get_library_desk_shifts',{
 p_from:from,p_to:to,
})
export const assignLibraryDeskShift=({workerIds,date,startMinute,endMinute,title,instructions,shortNoticeReason})=>
 rpc('ops_assign_library_desk_shift',{
  p_worker_ids:workerIds,p_shift_date:date,
  p_start_minute:startMinute,p_end_minute:endMinute,
  p_title:title,p_instructions:instructions,
  p_short_notice_reason:shortNoticeReason||null,
 })
export const cancelLibraryDeskShift=({shiftId,reason})=>
 rpc('ops_cancel_library_desk_shift',{p_shift_id:shiftId,p_reason:reason})

// SWTB18: authority for historical term budgets is the server, never the
// clipped manager list. All calls are manager-only, through database guards.
export const getOperationsTermDashboard=({termId=null,unit=null,workerId=null}={})=>
 rpc('ops_get_operations_term_dashboard',{
  p_term_id:termId||null,p_unit_code:unit||null,p_worker_id:workerId||null,
 })
export const saveOperationsTerm=({termId=null,label,startDate,endDate,state,reason})=>
 rpc('ops_save_operations_term',{
  p_id:termId||null,p_label:label,p_start_date:startDate,
  p_end_date:endDate,p_state:state,p_reason:reason,
 })
export const saveOperationsAllocation=({termId,unit,minutes,reason})=>
 rpc('ops_save_operations_allocation',{
  p_term_id:termId,p_unit_code:unit,p_allocated_minutes:minutes,
  p_reason:reason,
 })

export const saveOperationsBudgetPool=({id=null,termId,label,units,minutes,reason})=>
 rpc('ops_save_operations_budget_pool',{
  p_id:id||null,p_term_id:termId,p_label:label,p_unit_codes:units,
  p_allocated_minutes:minutes,p_reason:reason,
 })

// SWTB21-B: manager-only term eligibility status, changes and explicit
// enforcement activation. These RPCs are NOT installed on live Supabase yet.
// The optional UI is disabled by default until its audited backend rollout.
export const getTermAccessOverview=termId=>
 rpc('ops_get_term_access_overview',{p_term_id:termId})
export const setWorkerTermMembership=({workerId,termId,eligibility,reason=null})=>
 rpc('ops_set_worker_term_membership',{
  p_worker_id:workerId,p_term_id:termId,p_eligibility:eligibility,
  p_reason:reason||null,
 })
export const setTermAccessMode=({termId,mode,reason})=>
 rpc('ops_set_term_access_mode',{
  p_term_id:termId,p_mode:mode,p_reason:reason,
 })

// SWTB21-C2/C3: student-worker-only, privacy-minimal team calendar.
// The server derives the caller from auth.uid(); never send worker_id or
// fetch the privileged manager operations payload for a worker browser.
export const getWorkerTeamCalendar=({from,to})=>
 rpc('ops_get_team_calendar',{p_start_date:from,p_end_date:to})
