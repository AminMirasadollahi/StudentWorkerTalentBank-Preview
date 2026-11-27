// Review-only: tracks unsent form changes, never stores draft contents.
import {createContext,useContext,useLayoutEffect,useRef} from 'react'
export const ManagerDraftContext=createContext(null)
export const sameManagerRoute=(a,b)=>a?.section===b?.section&&
 (a?.section==='work'?a.workView===b.workView&&(a.workView!=='workPool'||a.workPoolKind===b.workPoolKind):a?.candidateView===b?.candidateView)
export function createManagerDraftGuard(){
 const dirty=new Set()
 return Object.freeze({
  register(owner){dirty.add(owner);return()=>dirty.delete(owner)},
  hasDraft:()=>dirty.size>0,
  permitsNavigation(prev,next,confirmDiscard){
   return sameManagerRoute(prev,next)||!dirty.size||confirmDiscard()===true
  }
 })
}
export function useManagerDraftWarning(value,enabled=true,force=false){
 const guard=useContext(ManagerDraftContext)
 const baseline=useRef(JSON.stringify(value))
 const owner=useRef(Symbol('manager-unsent-draft')).current
 const dirty=enabled&&(force||JSON.stringify(value)!==baseline.current)
 useLayoutEffect(()=>guard&&dirty?guard.register(owner):undefined,[guard,dirty,owner])
}
export const DISCARD_DRAFT_MESSAGE='تغییرات ثبت‌نشده دارید. با خروج از این بخش، پیش‌نویس حذف می‌شود. برای ادامه و حذف پیش‌نویس تأیید کنید؛ برای حفظ آن، انصراف را بزنید.'
