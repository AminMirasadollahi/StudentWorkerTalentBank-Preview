// Review-only: tracks unsent form changes, never stores draft contents.
import {createContext,useContext,useLayoutEffect,useRef,useState} from 'react'
export const ManagerDraftContext=createContext(null)
export const sameManagerRoute=(a,b)=>a?.section===b?.section&&
 (a?.section==='work'?a.workView===b.workView&&(a.workView!=='workPool'||a.workPoolKind===b.workPoolKind):a?.candidateView===b?.candidateView)
export function createManagerDraftGuard(){
 const dirty=new Set()
 const retained=new Map()
 return Object.freeze({
  register(owner){dirty.add(owner);return()=>dirty.delete(owner)},
  hasDraft:()=>dirty.size>0,
  readDraft(key,revision){const v=retained.get(key);return v?.revision===revision?structuredClone(v.value):undefined},
  writeDraft(key,revision,value){retained.set(key,{revision,value:structuredClone(value)})},
  clearDraft(key){retained.delete(key)},
  clearRetained(){retained.clear()},
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

// Only the authorized AdminView owns the store; no browser persistence or writers.
// Retention is for editable unsent values, not request/receipt snapshots.
export function useManagerDraftScope(){return useContext(ManagerDraftContext)}
export function useManagerRetainedState(key,revision,initial,allowed=true){
 const guard=useManagerDraftScope()
 const retained=Boolean(guard&&key)
 const baseline=useRef(null)
 if(baseline.current===null)baseline.current=initial()
 const [value,setValue]=useState(()=>retained&&allowed?(guard.readDraft(key,revision)??baseline.current):baseline.current)
 const suppressed=useRef(false)
 const dirty=JSON.stringify(value)!==JSON.stringify(baseline.current)
 const clear=()=>{suppressed.current=true;if(retained)guard.clearDraft(key)}
 const change=next=>{suppressed.current=false;setValue(next)}
 const reset=()=>{clear();baseline.current=initial();setValue(baseline.current)}
 useLayoutEffect(()=>{
  if(!retained)return
  if(!allowed||suppressed.current||!dirty)guard.clearDraft(key)
  else guard.writeDraft(key,revision,value)
 },[guard,key,revision,allowed,value,dirty,retained])
 return {value,change,reset,clear,retained,dirty}
}
