// SWTB22-D2: authorized candidates are already scoped by the server.
// These helpers only filter and label the authorized rows for UI; never grant access.
export const normalizeCandidateQuery=value=>String(value??'')
 .normalize('NFKC').toLocaleLowerCase('fa')
 .replace(/[يى]/g,'ی').replace(/ك/g,'ک')
 .replace(/[۰-۹]/g,c=>String(c.charCodeAt(0)-0x06f0))
 .replace(/[٠-٩]/g,c=>String(c.charCodeAt(0)-0x0660))
 .replace(/\s+/g,' ').trim()

export const candidateIsReady=row=>!row?.worker_id&&
 row?.interview_status==='approved'&&row?.clearance_status==='cleared'

export const candidateStage=row=>{
 if(row?.worker_id)return row?.worker_state==='active'?'همکاری فعال':'حساب ایجادشده'
 if(candidateIsReady(row))return 'آماده فعال‌سازی'
 if(row?.interview_status==='not_approved'||row?.clearance_status==='not_cleared')
  return 'تأیید نشده'
 return 'در انتظار بررسی'
}

// Identity display is sourced only from the already manager-authorized RPC.
// The application name/major are historical. Never treat an unapproved worker
// request, unlinked applicant or unavailable newer RPC fields as an override.
const safeCurrentField=(row,effectiveKey,legacyKey)=>{
 const original=typeof row?.[legacyKey]==='string'?row[legacyKey]:''
 if(!row?.worker_id)return original
 const effective=row?.[effectiveKey]
 return typeof effective==='string'&&effective.trim()?effective.trim():original
}
export const candidateDisplayName=row=>safeCurrentField(row,'worker_effective_full_name','full_name')
export const candidateDisplayMajor=row=>safeCurrentField(row,'worker_effective_major','major')

// Both helpers are *presentation only*: the manager RPC is the authority.
// Absent optional fields from an older deployed backend are UNKNOWN, never
// a false claim that no password was set, an email was not delivered, or
// the student never used the worker workspace.
export const candidateOnboardingLabel=row=>{
 if(!row?.worker_id)return 'حساب دانشجوکار ایجاد نشده'
 if(row.worker_onboarding_state==='password_required')return 'در انتظار تکمیل تعیین رمز'
 if(row.worker_onboarding_state==='ready')return 'راه‌اندازی حساب تکمیل‌شده'
 return 'اطلاعات راه‌اندازی در دسترس نیست'
}

export const candidateAuthSignInLabel=row=>{
 if(!row?.worker_id)return 'حساب دانشجوکار ایجاد نشده'
 if(row.worker_auth_account_found===false)return 'حساب احراز هویت متناظر یافت نشد'
 if(row.worker_auth_account_found!==true)return 'اطلاعات ورود در دسترس نیست'
 const raw=row.worker_last_auth_sign_in_at
 if(!raw)return 'ورودی در سرویس احراز هویت ثبت نشده'
 const date=new Date(raw)
 if(Number.isNaN(date.getTime()))return 'زمان ورود نامعتبر است'
 return new Intl.DateTimeFormat('fa-IR',{
  timeZone:'Asia/Tehran',year:'numeric',month:'long',day:'numeric',
  hour:'2-digit',minute:'2-digit',
 }).format(date)
}

export const selectManagerCandidates=(rows,filter='all',search='')=>{
 const q=normalizeCandidateQuery(search)
 return (Array.isArray(rows)?rows:[]).filter(row=>{
  if(filter==='active'&&!row.worker_id)return false
  if(filter==='pending'&&row.worker_id)return false
  if(filter==='ready'&&!candidateIsReady(row))return false
  if(q){
   const searchable=[
    candidateDisplayName(row),row.full_name,candidateDisplayMajor(row),row.major,row.phone,row.entry_year,
    row.primary_unit,
   ].map(normalizeCandidateQuery).join(' ')
   if(!searchable.includes(q))return false
  }
  return true
 })
}
