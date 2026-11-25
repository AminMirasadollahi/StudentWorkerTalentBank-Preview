import React,{useLayoutEffect,useRef,useState} from 'react'
import {createAssignmentRecoverySession} from '../lib/assignmentRecoverySession.mjs'
import AssignmentRecoveryPanel from './AssignmentRecoveryPanel'
// Actor-owned recovery session; transport injected by the verified access host.
export default function AssignmentRecoveryFixtureHost({actorId,checking,fixture,children}){
 const owner=useRef(null)
 const [,render]=useState(0)
 const [editor,setEditor]=useState({revision:0,committedRevision:0})
 const redraw=()=>render(v=>v+1)
 const same=i=>owner.current===i&&i.actorId===actorId
 const usable=i=>same(i)&&!i.checking&&i.readState==='ready'
 const completeAck=(i,previous)=>{
  i.ack=null
  setEditor(e=>({revision:e.revision+1,committedRevision:e.committedRevision+(previous.state==='committed'?1:0)}))
 }
 const run=async(i,fn,...args)=>{
  if(!usable(i)||(i.shiftCancellation&&fn!==i.session.discover))return 'blocked'
  const generation=i.accessGeneration
  const p=fn(...args);redraw()
  const result=await p
  if(!usable(i)||generation!==i.accessGeneration)return 'stale'
  // Lost acknowledgement can be confirmed only by a fresh idle view
  // with a strictly advanced epoch. Do not infer a commit from an idle slot.
  if(i.ack&&result==='idle'&&i.session.snapshot().epoch>i.ack.epoch)completeAck(i,i.ack)
  redraw()
  return result
 }
 const sync=i=>{
  const verified=usable(i)
  if(i.verified===verified)return
  i.verified=verified
  i.accessGeneration++
  i.session.setAccess(verified?{status:'verified',actorId:i.actorId}:{status:'checking'})
  if(verified)void run(i,i.session.discover)
  redraw()
 }
 useLayoutEffect(()=>{
  const i={actorId,session:createAssignmentRecoverySession(fixture),checking:true,readState:'ready',readScope:null,readRevision:0,readScopeOwner:Object.freeze({}),verified:false,ack:null,shiftCancellation:null,accessGeneration:0}
  owner.current=i
  setEditor({revision:0,committedRevision:0});redraw()
  return ()=>{if(owner.current===i)owner.current=null;i.session.dispose()}
 },[actorId,fixture])
 useLayoutEffect(()=>{
  const i=owner.current
  if(!i)return
  i.checking=checking;sync(i)
 },[actorId,checking,fixture])
 const i=owner.current
 if(!i||!same(i))return null
 const updateReadState=state=>{
  if(!same(i)||!['checking','ready','failed'].includes(state)||state===i.readState)return
  i.readState=state;sync(i)
 }
 // Older fixture callers retain the unscoped contract. A real manager route
 // selects a scope; unscoped responses can never reopen a scoped gate.
 const setReadState=state=>{if(i.readScope===null)updateReadState(state)}
 const setReadScope=scope=>{
  if(!same(i)||!['work','candidates','report'].includes(scope)||scope===i.readScope)return
  i.readScope=scope;i.readRevision++
  updateReadState('checking')
  // Reports have no assignment editor or dependency on candidate/work rows.
  // Receipt actions still require the independent verified admin transport.
  if(scope==='report')updateReadState('ready')
 }
 const beginScopedRead=scope=>{
  if(!same(i)||scope!==i.readScope||!['work','candidates'].includes(scope))return ()=>false
  const revision=++i.readRevision
  updateReadState('checking')
  let settled=false
  return state=>{
   if(settled||!same(i)||scope!==i.readScope||revision!==i.readRevision||!['ready','failed'].includes(state))return false
   settled=true;updateReadState(state);return true
  }
 }
 const canStartFromRoute=()=>i.readScope===null||i.readScope==='work'
 const acknowledge=()=>{
  if(!usable(i))return
  const previous=i.session.snapshot()
  if(!previous.canAcknowledge)return
  i.ack={state:previous.state,epoch:previous.epoch}
  void run(i,i.session.acknowledge)
 }
 // Existing-shift cancellation is separate from the V2 intent ledger. Keep
 // its in-flight lock above route/editor remounts; never retry automatically.
 const cancelExistingShift=async args=>{
  if(!usable(i)||!canStartFromRoute()||i.shiftCancellation||!i.session.snapshot().canStart||typeof fixture.cancelExistingShift!=='function')throw Error('SHIFT_CANCEL_BLOCKED')
  const attempt={generation:i.accessGeneration};i.shiftCancellation=attempt;redraw()
  try{
   const result=await fixture.cancelExistingShift(args)
   if(!usable(i)||i.accessGeneration!==attempt.generation||i.shiftCancellation!==attempt)throw Error('SHIFT_CANCEL_UNCONFIRMED')
   if(result?.ok!==true||result.shift_id!==args?.shiftId||result.state!=='cancelled')throw Error('SHIFT_CANCEL_UNCONFIRMED')
   return result
  }finally{
   if(i.shiftCancellation===attempt)i.shiftCancellation=null
   if(same(i))redraw()
  }
 }
 const snapshot=checking||i.readState!=='ready'?{state:'checking'}:i.shiftCancellation?{state:'cancelling_shift',canStart:false}:i.session.snapshot()
 const panel=<AssignmentRecoveryPanel snapshot={snapshot} onDiscover={()=>void run(i,i.session.discover)}
  onRetryReserve={()=>void run(i,i.session.retryReserve)} onCommit={()=>void run(i,i.session.commit)}
  onCancel={()=>void run(i,i.session.cancel)} onAcknowledge={acknowledge}/>
 const manualReserve=fixture.manualReserve===true // focused review tests only
 const port={version:2,manualReserve,snapshot,submit:d=>canStartFromRoute()?run(i,manualReserve?i.session.reserve:i.session.submit,d):Promise.resolve('blocked'),setReadState,setReadScope,beginScopedRead,readScopeOwner:i.readScopeOwner,panel,
  ...(typeof fixture.cancelExistingShift==='function'?{cancelExistingShift}:{}),
  editorRevision:editor.revision,initialPayload:usable(i)?snapshot.payload:null,committedRevision:editor.committedRevision}
 return children(port)
}
