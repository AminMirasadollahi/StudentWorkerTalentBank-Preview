// SWTB18 #30/#51: pure, browser-session-only request receipt bookkeeping.
// The server alone decides 48h cutoffs, permissions and effective schedule.
export const PRESENCE_STATUS_TEXT=Object.freeze({
  pending:'در انتظار تأیید مدیر',
  applied:'اعمال‌شده با اطلاع قبلی',
  approved:'تأیید و اعمال‌شده',
  rejected:'ردشده',
  cancelled:'انصراف داده‌شده',
})
export const PRESENCE_ACTION_TEXT=Object.freeze({
  set_exception:'تغییر برنامه این روز',
  inherit_weekly:'بازگشت به برنامه ثابت هفتگی',
})
export function canonicalPresencePayload({workerId,date,action,kind,intervals=[],note='',reason=''}) {
  const cleaned=Array.isArray(intervals)
    ?intervals.map(x=>({start:Number(x.start),end:Number(x.end)}))
      .sort((a,b)=>a.start-b.start||a.end-b.end)
    :intervals
  return {
    workerId, date, action,
    kind:action==='inherit_weekly'?null:kind,
    intervals:action==='inherit_weekly'?[]:cleaned,
    note:action==='inherit_weekly'?null:(note?.trim()||null),
    reason:reason?.trim()||null,
  }
}
export function createPresenceAttemptLedger(uuidFactory=()=>globalThis.crypto?.randomUUID?.()) {
  const entries=new Map()
  const identity=payload=>JSON.stringify(canonicalPresencePayload(payload))
  return {
    get(payload) {
      const key=identity(payload)
      const previous=entries.get(key)
      if(previous)return previous
      const requestId=uuidFactory()
      if(typeof requestId!=='string'||!(/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i).test(requestId))
        throw new Error('شناسه امن درخواست در مرورگر در دسترس نیست.')
      entries.set(key,requestId)
      return requestId
    },
    acknowledge(payload) {entries.delete(identity(payload))},
    reset() {entries.clear()},
  }
}
export function interpretPresenceReceipt(result) {
  if(!result?.ok || !['pending','applied'].includes(result.status) ||
     typeof result.request_id!=='string') {
    throw new Error('پاسخ ثبت تغییر قابل تأیید نیست؛ وضعیت را دوباره بررسی کنید.')
  }
  return {
    id:result.request_id,
    status:result.status,
    effective:result.status==='applied'&&result.effective===true,
    message:result.status==='pending'
      ?'درخواست ثبت شد و در انتظار بررسی مدیر است؛ برنامه مؤثر هنوز تغییر نکرده است.'
      :'تغییر پیش از بازه حساس ثبت و در برنامه اعمال شد.',
  }
}
export function workerPresenceItems(response,workerId) {
  if(!response?.ok || response.scope!=='my_worker' || !Array.isArray(response.items))
    throw new Error('پاسخ مجاز درخواست‌های حضور دریافت نشد.')
  if(response.items.some(item=>item.worker_id!==workerId))
    throw new Error('محدوده اطلاعات درخواست‌های حضور معتبر نیست.')
  return response.items
}
export function managerPresenceItems(response) {
  if(!response?.ok || response.scope!=='manager'|| !Array.isArray(response.items))
    throw new Error('صف تأیید مدیر قابل دریافت نیست.')
  return response.items
}
