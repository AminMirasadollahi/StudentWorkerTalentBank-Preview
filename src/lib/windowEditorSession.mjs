// A single in-memory review session per synthetic principal. No persistence,
// no automatic retries, no new key after uncertain mutation.
import {createWindowFixtureApiV1} from './windowFixtureApiV1.mjs'
export function createWindowEditorSession({syntheticReviewOnly,fixtureTransport,context}={}){
 const api=createWindowFixtureApiV1({syntheticReviewOnly,fixtureTransport})
 api.setContext(context)
 let slot=null,frozenDraft=null,receipt=null,pendingKind=null,closed=false
 const state=()=>Object.freeze({...api.state(),slot,frozenDraft,receipt,pendingKind})
 const blocked=()=>({status:'blocked'})
 const usable=()=>!closed&&api.state().ready&&!api.state().busy&&!api.state().uncertain
 const reconcile=async()=>{if(closed||context.role!=='manager'||api.state().busy)return blocked();const r=await api.call('recovery',{p_action:'discover',p_epoch:null,p_request_id:null});if(r.status==='ok')slot=r.value;else slot=null;return r}
 const connect=async()=>{const r=await api.negotiate();if(r.status==='ready'&&context.role==='manager')await reconcile();return r}
 const settle=(kind,r)=>{
  if(r.status==='ok'){
   pendingKind=null
   if(kind==='reserve'||kind==='commit'||kind==='cancel'||kind==='ack'){slot=r.value;if(kind==='ack')frozenDraft=null;receipt=slot.active?.receipt??null}
   else receipt=r.value
  }else if(r.status!=='uncertain'&&r.status!=='stale')pendingKind=null
  return r
 }
 const reserve=async args=>{
  if(!usable()||context.role!=='manager'||!slot||slot.active!==null||args.p_action!=='reserve'||args.p_epoch!==slot.epoch)return blocked()
  frozenDraft=Object.freeze({...args,p_prerequisites:Object.freeze([...args.p_prerequisites])});pendingKind='reserve'
  const r=settle('reserve',await api.call('assignment',frozenDraft));if(r.status==='invalid'||r.status==='blocked')frozenDraft=null;return r
 }
 const commit=async()=>{
  if(!usable()||!frozenDraft||slot?.active?.status!=='reserved'||slot.active.requestId!==frozenDraft.p_request_id||slot.epoch!==frozenDraft.p_epoch)return blocked()
  pendingKind='commit';return settle('commit',await api.call('assignment',{...frozenDraft,p_action:'commit'}))
 }
 const recoveryAction=async action=>{
  if(!usable()||context.role!=='manager'||slot?.active?.kind!=='single_report_window_v1'||(action==='cancel'?slot.active.status!=='reserved':!['committed','cancelled'].includes(slot.active.status)))return blocked()
  const kind=action==='cancel'?'cancel':'ack';pendingKind=kind
  return settle(kind,await api.call('recovery',{p_action:action,p_epoch:slot.epoch,p_request_id:slot.active.requestId}))
 }
 const perform=async(kind,args)=>{
  if(!usable()||!['start','submit','review'].includes(kind))return blocked()
  pendingKind=kind;return settle(kind,await api.call(kind,args))
 }
 const replay=async()=>{if(closed||!api.state().canReplay||!['reserve','commit','submit'].includes(pendingKind))return blocked();const k=pendingKind;return settle(k,await api.replay())}
 const dispose=()=>{closed=true;api.dispose();slot=null;frozenDraft=null;receipt=null;pendingKind=null}
 return Object.freeze({connect,reconcile,reserve,commit,cancel:()=>recoveryAction('cancel'),ack:()=>recoveryAction('acknowledge'),perform,replay,state,dispose})
}
