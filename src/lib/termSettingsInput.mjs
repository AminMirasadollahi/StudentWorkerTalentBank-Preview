// SWTB20 manager input policy: UI defaults never change accounting contracts.
export const UNIT_LABELS={library:'کتابخانه',research:'پژوهش',public_relations:'روابط عمومی'}
export const AUTO_TERM_REASON='ثبت اولیه نیمسال (توضیح خودکار سامانه)'
export const AUTO_POOL_REASON='ثبت اولیه سهمیه مصوب (توضیح خودکار سامانه)'

export function normalizeDigits(value){
 return String(value??'').trim().replace(/[۰-۹]/g,c=>String(c.charCodeAt(0)-1776))
  .replace(/[٠-٩]/g,c=>String(c.charCodeAt(0)-1632))
}
export function wholeHoursToMinutes(value){
 const normalized=normalizeDigits(value)
 if(!/^\d+$/.test(normalized))return null
 const h=Number(normalized)
 if(!Number.isSafeInteger(h)||h<0||h*60>2000000)return null
 return h*60
}
export const minutesToWholeHours=value=>{
 if(!Number.isSafeInteger(value)||value<0||value%60!==0)return ''
 return String(value/60)
}
export const sameUnits=(a=[],b=[])=>a.length===b.length&&
 a.every(x=>b.includes(x))&&new Set(a).size===a.length&&new Set(b).size===b.length
export function automaticPoolLabel(selected=[]){
 return Object.keys(UNIT_LABELS).filter(u=>selected.includes(u)).map(u=>UNIT_LABELS[u]).join(' و ')
}
export function termChanged(term,{label,start,end}){
 if(!term)return true
 return term.label!==label.trim()||term.start_date!==start||term.end_date!==end
}
export function poolChanged(pool,{label,units,allocatedMinutes}){
 if(!pool)return true
 return pool.label!==label.trim()||!sameUnits(pool.units||[],units)||
   pool.allocated_minutes!==allocatedMinutes
}
