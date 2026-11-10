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

// Administrator-only worker lifecycle; live Postgres RPC validates role,
// expected state and audit reason, and atomically writes immutable history.
export const setWorkerState=({workerId,expectedState,newState,reason})=>
 rpc('ops_set_worker_state',{
  p_worker_id:workerId,p_expected_state:expectedState,
  p_new_state:newState,p_reason:reason,
 })
export const getWorkerStateHistory=workerId=>
 rpc('ops_get_worker_state_history',{p_worker_id:workerId})

// SWTB21-B: manager-only term eligibility and explicit assignment-gate mode.
// Both RPC contracts are installed. The default gate is OBSERVE and remains
// disabled until the manager explicitly reviews real term eligibility.
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

// SWTB21-D1: general (NON-DESK) manager-published task opportunities.
// The server derives worker identity exclusively from auth.uid(); the browser
// cannot assign a task to another worker or report approved hours.
export const getWorkerWorkPool=()=>rpc('ops_get_worker_work_pool')
export const getManagerWorkPool=({from,to})=>rpc('ops_get_manager_work_pool',{
  p_start_date:from,p_end_date:to,
})
export const createWorkTemplate=({unit,title,description,privateInstructions,minutes,priority})=>
  rpc('ops_create_work_template',{
    p_unit_code:unit,p_title:title,p_worker_description:description,
    p_private_instructions:privateInstructions||'',p_estimated_minutes:Number(minutes),
    p_priority:Number(priority),
  })
export const createWorkOpportunity=({templateId,termId,date,capacity,claimDeadline=null})=>
  rpc('ops_create_work_opportunity',{
    p_template_id:templateId,p_term_id:termId,p_planned_date:date,
    p_capacity:Number(capacity),p_claim_deadline:claimDeadline||null,
  })
export const setWorkOpportunityState=({opportunityId,state,reason=null})=>
  rpc('ops_set_work_opportunity_state',{
    p_opportunity_id:opportunityId,p_state:state,p_reason:reason||null,
  })
// requestId MUST be retained for uncertain HTTP failures; NEVER issue a fresh
// identifier for a blind retry. Server ensures one claim/task per worker+offer.
export const claimWorkOpportunity=({opportunityId,requestId})=>
  rpc('ops_claim_work_opportunity',{
    p_opportunity_id:opportunityId,p_request_id:requestId,
  })

// SWTB21-D2B (FEATURE FLAG OFF): timed library desk opportunities.
// These calls require the separately approved D2A+D2B migration. The server
// enforces the GLOBAL 2-seat desk advisory lock, even against manager bookings.
export const getWorkerDeskWorkPool=()=>rpc('ops_get_worker_desk_work_pool')
export const getManagerDeskWorkPool=({from,to})=>
 rpc('ops_get_manager_desk_work_pool',{p_from:from,p_to:to})
export const createDeskWorkTemplate=({title,description,privateInstructions,minutes,priority})=>
 rpc('ops_create_desk_work_template',{
  p_title:title,p_worker_description:description,
  p_private_instructions:privateInstructions||'',
  p_duration_minutes:Number(minutes),p_priority:Number(priority),
 })
export const createDeskWorkOffer=({templateId,termId,date,start,end,capacity,deadline})=>
 rpc('ops_create_desk_work_offer',{
  p_template_id:templateId,p_term_id:termId,p_shift_date:date,
  p_start_minute:Number(start),p_end_minute:Number(end),
  p_capacity:Number(capacity),p_claim_deadline:deadline||null,
 })
export const setDeskWorkOfferState=({offerId,state,reason})=>
 rpc('ops_set_desk_work_offer_state',{
  p_offer_id:offerId,p_state:state,p_reason:reason||null,
 })
export const claimDeskWorkOffer=({offerId,requestId})=>
 rpc('ops_claim_desk_work_offer',{p_offer_id:offerId,p_request_id:requestId})

// SWTB15: reserved for the NOT-YET-INSTALLED private PR37–40 agreement ledger.
// Never treat the locally bundled RC6 preview as a published server version.
// The browser sends only the exact UUID/digest it just displayed, never a
// worker_id or a client-computed digest. No automatic retries on acceptance.
export const getMyWorkerAgreement=()=>rpc('ops_get_my_worker_agreement')
export const acceptMyWorkerAgreement=({versionId,digest})=>
 rpc('ops_accept_my_worker_agreement',{
  p_version_id:versionId,p_displayed_digest:digest,
 })
