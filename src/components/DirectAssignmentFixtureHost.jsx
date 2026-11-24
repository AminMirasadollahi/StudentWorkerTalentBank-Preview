import React,{useLayoutEffect,useRef,useState} from 'react'
import {createDirectAssignmentSession} from '../lib/directAssignmentSession.mjs'
import DirectAssignmentReceiptPanel from './DirectAssignmentReceiptPanel'

// Explicit dependency injection only. No production transport or env flag.
// One owner above route/editor lifetime. The outer authenticated view keys
// this host by actor and unmounts it on signout/denial/account switch.
export default function DirectAssignmentFixtureHost({actorId,checking,fixture,children}){
 const owner=useRef(null)
 const [,render]=useState(0)
 const [editor,setEditor]=useState({revision:0,seed:null,committedRevision:0})
 const redraw=()=>render(v=>v+1)
 useLayoutEffect(()=>{
  const session=createDirectAssignmentSession(fixture)
  const instance={session,actorId,checking:true,readState:'ready'}
  owner.current=instance
  setEditor({revision:0,seed:null,committedRevision:0})
  redraw()
  return ()=>{if(owner.current===instance)owner.current=null;session.dispose()}
 },[actorId,fixture])
 useLayoutEffect(()=>{
  const instance=owner.current
  if(!instance)return
  instance.checking=checking
  instance.session.setAccess(checking||instance.readState!=='ready'?{status:'checking'}:{status:'verified',actorId})
  redraw()
 },[actorId,checking,fixture])
 const instance=owner.current
 const same=()=>instance!==null&&owner.current===instance&&instance.actorId===actorId
 const usable=()=>same()&&!instance.checking&&instance.readState==='ready'
 const run=async(fn,...args)=>{
  if(!usable())return 'blocked'
  const promise=fn(...args);redraw()
  const result=await promise
  if(same())redraw()
  return same()?result:'stale'
 }
 // A scoped read failure is not proof that an earlier write failed. Hide
 // projection and block both writers and receipt actions until fresh read.
 // Retain pending in-memory state; actual identity loss disposes it.
 const setReadState=state=>{
  if(!same()||!['checking','ready','failed'].includes(state))return
  instance.readState=state
  instance.session.setAccess(instance.checking||state!=='ready'?{status:'checking'}:{status:'verified',actorId})
  redraw()
 }
 const acknowledge=()=>{
  if(!usable()||!instance.session.acknowledge())return
  setEditor(e=>({revision:e.revision+1,seed:null,committedRevision:e.committedRevision+1}))
  redraw()
 }
 const revise=()=>{
  if(!usable())return
  const seed=instance.session.reviseRejected()
  if(!seed)return
  setEditor(e=>({...e,revision:e.revision+1,seed}))
  redraw()
 }
 // Do not mount children until layout initialization establishes the owner.
 // Their initial data-read effect must never capture a null/stale port.
 if(!same())return null
 const snapshot=checking||instance.readState!=='ready'?{state:'checking'}:instance.session.snapshot()
 const panel=<DirectAssignmentReceiptPanel snapshot={snapshot}
  onReconcile={()=>void run(instance.session.reconcile)} onRetry={()=>void run(instance.session.retry)}
  onAcknowledge={acknowledge} onRevise={revise}/>
 // Never expose a private seed during verification, failure or stale owner.
 const port={snapshot,submit:d=>run(instance.session.submit,d),
  setReadState,panel,editorRevision:editor.revision,initialPayload:usable()?(snapshot.payload??editor.seed):null,
  committedRevision:editor.committedRevision}
 return children(port)
}
