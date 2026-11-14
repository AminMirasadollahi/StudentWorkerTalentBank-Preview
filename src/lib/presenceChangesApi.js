// SWTB18: guarded RPC-only frontend adapter, no client table DML.
// These functions are not called by the production build unless the explicit
// VITE_SWTB18_PRESENCE_APPROVAL_UI flag is true AND backend rollout is ready.
import {opsClient} from './operations.js'
function assertData({data,error}) {
  if(error)throw error
  if(!data?.ok)throw new Error('پاسخ قابل تأیید از سامانه دریافت نشد.')
  return data
}
export async function requestPresenceChange({
  requestId,workerId,date,action,kind=null,intervals=[],note=null,reason=null,
}) {
  return assertData(await opsClient.rpc('ops_request_presence_change',{
    p_request_id:requestId,p_worker_id:workerId,p_local_date:date,
    p_action:action,p_kind:kind,p_intervals:intervals,
    p_worker_note:note,p_reason:reason,
  }))
}
export async function listPresenceChanges(workerId=null,pendingOnly=false) {
  return assertData(await opsClient.rpc('ops_list_presence_changes',{
    p_worker_id:workerId,p_pending_only:pendingOnly,
  }))
}
export async function reviewPresenceChange({requestId,decision,note='',allowRetrospective=false}) {
  return assertData(await opsClient.rpc('ops_review_presence_change',{
    p_request_id:requestId,p_decision:decision,p_review_note:note||null,
    p_allow_retrospective:allowRetrospective,
  }))
}
export async function cancelPresenceChange(requestId) {
  return assertData(await opsClient.rpc('ops_cancel_presence_change',{
    p_request_id:requestId,
  }))
}
