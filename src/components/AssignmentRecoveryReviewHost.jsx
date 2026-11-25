import React,{useLayoutEffect,useRef,useState} from 'react'
import AssignmentRecoveryFixtureHost from './AssignmentRecoveryFixtureHost'
import {createRecoveryAccessBinding} from '../lib/recoveryAccessBinding.mjs'
import {createScopedRecoveryHttpTransport} from '../lib/scopedRecoveryHttpTransport.mjs'
import {createRecoveryReviewLifecycle,verifyRecoveryReviewAdmin} from '../lib/recoveryReviewLifecycle.mjs'

// Review build only. No default production target, and no legacy fallback.
export default function AssignmentRecoveryReviewHost({config,auth,actorId,checking,onLogout,children}){
 const owner=useRef(null)
 const parentChecking=useRef(checking)
 const [state,setState]=useState({status:'checking',fixture:null,terminal:false})
 useLayoutEffect(()=>{
  let timer=null,alive=true,controller=null,subscription=null
  const clear=()=>{if(timer!==null){clearTimeout(timer);timer=null}}
  const isVisible=()=>alive&&!parentChecking.current&&document.visibilityState==='visible'&&document.hasFocus()
  const schedule=()=>{
   clear()
   if(isVisible()&&controller)timer=setTimeout(()=>{timer=null;void controller.check()},0)
  }
  const pause=()=>{clear();controller?.suspend()}
  const resume=()=>{pause();schedule()}
  const visibility=()=>{if(document.visibilityState==='hidden')pause();else resume()}
  const cleanup=()=>{
   alive=false;clear();controller?.dispose();subscription?.unsubscribe()
   window.removeEventListener('blur',pause);window.removeEventListener('focus',resume)
   document.removeEventListener('visibilitychange',visibility)
   if(owner.current?.controller===controller)owner.current=null
  }
  setState({status:'checking',fixture:null,terminal:false})
  try{
   if(config.mode!=='review'||typeof globalThis.crypto?.randomUUID!=='function')throw Error('REVIEW_UNAVAILABLE')
   const fetchImpl=(...args)=>globalThis.fetch(...args)
   const common={projectUrl:config.projectUrl,publishableKey:config.publishableKey,auth,fetchImpl}
   const binding=createRecoveryAccessBinding({...common,makeId:()=>globalThis.crypto.randomUUID(),isVisible,createTransport:createScopedRecoveryHttpTransport})
   controller=createRecoveryReviewLifecycle({binding,actorId,isVisible,notify:s=>{if(alive)setState(s)},verify:proof=>verifyRecoveryReviewAdmin({...common,...proof})})
   owner.current={controller,pause,schedule}
   // No Supabase async method is called inside the auth callback.
   const observed=auth.onAuthStateChange((event,session)=>{
    if(event==='INITIAL_SESSION')return
    clear()
    if(controller.authChanged(event,session))schedule()
   })
   subscription=observed.data.subscription
   window.addEventListener('blur',pause);window.addEventListener('focus',resume)
   document.addEventListener('visibilitychange',visibility)
   schedule()
  }catch{
   cleanup();setState({status:'blocked',fixture:null,terminal:true})
  }
  return cleanup
 },[config,auth,actorId])
 useLayoutEffect(()=>{
  parentChecking.current=checking
  if(checking)owner.current?.pause()
  else owner.current?.schedule()
 },[checking])
 // Invalidate synchronously, before the parent's asynchronous sign-out.
 const guardedLogout=()=>{owner.current?.controller.terminate();return onLogout?.()}
 const ready=!checking&&state.status==='ready'&&state.fixture!==null
 return <>
  {!ready&&<section className="ops-root" dir="rtl" role="status">
   <p>{state.status==='blocked'?'مسیر آزمایشی واگذاری در دسترس نیست؛ هیچ ثبت جایگزینی انجام نمی‌شود.':'در حال تأیید دسترسی مسیر جدید واگذاری…'}</p>
   {state.status==='blocked'&&!state.terminal&&<button type="button" className="report-btn report-btn--light" onClick={()=>owner.current?.schedule()}>بررسی مجدد دسترسی</button>}
   <button type="button" className="report-btn report-btn--light" onClick={guardedLogout}>خروج از حساب</button>
  </section>}
  {state.fixture&&<div inert={!ready} aria-hidden={!ready?'true':undefined} hidden={!ready}>
   <AssignmentRecoveryFixtureHost actorId={actorId} checking={!ready} fixture={state.fixture}>{port=>children(port,guardedLogout)}</AssignmentRecoveryFixtureHost>
  </div>}
 </>
}
