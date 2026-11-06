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
 if(row?.worker_id)return row?.worker_state==='active'?'حساب فعال':'حساب ایجادشده'
 if(candidateIsReady(row))return 'آماده فعال‌سازی'
 if(row?.interview_status==='not_approved'||row?.clearance_status==='not_cleared')
  return 'تأیید نشده'
 return 'در انتظار بررسی'
}

export const selectManagerCandidates=(rows,filter='all',search='')=>{
 const q=normalizeCandidateQuery(search)
 return (Array.isArray(rows)?rows:[]).filter(row=>{
  if(filter==='active'&&!row.worker_id)return false
  if(filter==='pending'&&row.worker_id)return false
  if(filter==='ready'&&!candidateIsReady(row))return false
  if(q){
   const searchable=[
    row.full_name,row.major,row.phone,row.entry_year,
    row.primary_unit,
   ].map(normalizeCandidateQuery).join(' ')
   if(!searchable.includes(q))return false
  }
  return true
 })
}
