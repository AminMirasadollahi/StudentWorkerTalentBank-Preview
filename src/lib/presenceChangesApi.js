// SWTB18: guarded RPC-only frontend adapter, no client table DML.
// These functions are not called by the production build unless the explicit
// VITE_SWTB18_PRESENCE_APPROVAL_UI flag is true AND backend rollout is ready.
// Lazy-import the existing client only when the approved feature is actually
// used. Merely importing a feature-OFF React module must never bootstrap an
// independent Supabase session/timer in production or synthetic UI tests.
async function rpc(name,args) {
  const {opsClient}=await import('./operations.js')
  return opsClient.rpc(name,args)
}
function assertData({data,error}) {
  if(error)throw error
  if(!data?.ok)throw new Error('پاسخ قابل تأیید از سامانه دریافت نشد.')
  return data
}
export async function requestPresenceChange({
  requestId,workerId,date,action,kind=null,intervals=[],note=null,reason=null,
}) {
  return assertData(await rpc('ops_request_presence_change',{
    p_request_id:requestId,p_worker_id:workerId,p_local_date:date,
    p_action:action,p_kind:kind,p_intervals:intervals,
    p_worker_note:note,p_reason:reason,
  }))
}
export async function listPresenceChanges(workerId=null,pendingOnly=false) {
  return assertData(await rpc('ops_list_presence_changes',{
    p_worker_id:workerId,p_pending_only:pendingOnly,
  }))
}
export async function reviewPresenceChange({requestId,decision,note='',allowRetrospective=false}) {
  return assertData(await rpc('ops_review_presence_change',{
    p_request_id:requestId,p_decision:decision,p_review_note:note||null,
    p_allow_retrospective:allowRetrospective,
  }))
}
export async function cancelPresenceChange(requestId) {
  return assertData(await rpc('ops_cancel_presence_change',{
    p_request_id:requestId,
  }))
}
