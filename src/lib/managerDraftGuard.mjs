// Review-only: unsent values held in authorized view memory, never browser persistence.
import {createContext,useContext,useLayoutEffect,useRef,useState} from 'react'
export const ManagerDraftContext=createContext(null)
export const sameManagerRoute=(a,b)=>a?.section===b?.section&&
 (a?.section==='work'?a.workView===b.workView&&(a.workView!=='workPool'||a.workPoolKind===b.workPoolKind):a?.candidateView===b?.candidateView)
export function createManagerDraftGuard(){
 const dirty=new Set()
 const retained=new Map()
 let generation=0
 return Object.freeze({
  register(owner){dirty.add(owner);return()=>dirty.delete(owner)},
  hasDraft:()=>dirty.size>0,
  readDraft(key,revision){const v=retained.get(key);return v?.revision===revision?structuredClone(v.value):undefined},
  generation:()=>generation,
  writeDraft(key,revision,value,expected=generation){if(expected!==generation)return false;retained.set(key,{revision,value:structuredClone(value)});return true},
  clearDraft(key,revision,expected=generation){if(expected!==generation)return false;if(revision===undefined||retained.get(key)?.revision===revision)retained.delete(key);return true},
  clearRetained(){retained.clear();generation++},
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
 const generation=retained?guard.generation():0
 const same=s=>s.guard===guard&&s.key===key&&s.revision===revision&&s.generation===generation
 const fresh=()=>{
  const baseline=initial()
  return {guard,key,revision,generation,baseline,value:retained&&allowed?(guard.readDraft(key,revision)??baseline):baseline,suppressed:false}
 }
 const [stored,setStored]=useState(fresh)
 // Reset before commit if the owner or receipt boundary changes, even when
 // React reuses a mounted editor. Never copy an old owner's local values.
 const state=same(stored)?stored:fresh()
 if(state!==stored)setStored(state)
 const {value}=state
 const dirty=JSON.stringify(value)!==JSON.stringify(state.baseline)
 const clear=()=>{
  if(retained)guard.clearDraft(key,revision,generation)
  setStored(s=>same(s)?{...s,suppressed:true}:s)
 }
 const change=next=>setStored(s=>same(s)?{...s,suppressed:false,value:typeof next==='function'?next(s.value):next}:s)
 const reset=()=>{
  if(retained)guard.clearDraft(key,revision,generation)
  setStored(s=>{if(!same(s))return s;const baseline=initial();return {...s,baseline,value:baseline,suppressed:true}})
 }
 useLayoutEffect(()=>{
  if(!retained)return
  if(!allowed||state.suppressed||!dirty)guard.clearDraft(key,revision,generation)
  else guard.writeDraft(key,revision,value,generation)
 },[guard,key,revision,generation,allowed,value,dirty,retained,state.suppressed])
 return {value,change,reset,clear,retained,dirty}
}
