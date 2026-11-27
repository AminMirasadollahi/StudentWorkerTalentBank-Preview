// A single in-memory review session per synthetic principal. No persistence,
// no automatic retries, no new key after uncertain mutation.
import {createWindowFixtureApiV1} from './windowFixtureApiV1.mjs'
import {managerWindowHistoryV2} from './managerWindowReadV2.mjs'
import {workerWindowReviewModel} from './windowReviewPresentation.mjs'
export function createWindowEditorSession({syntheticReviewOnly,fixtureTransport,context,operationReceiptsV2=false,newOperationId}={}){
 const v2=operationReceiptsV2===true
 if(v2&&typeof newOperationId!=='function')throw Error('WINDOW_RECEIPT_KEY_FACTORY_REQUIRED')
 const api=createWindowFixtureApiV1({syntheticReviewOnly,fixtureTransport,operationReceiptsV2:v2})
 const issued=new Set()
 const operationArgs=args=>{if(!v2)return args;const key=newOperationId();if(typeof key!=='string'||issued.has(key))throw Error('WINDOW_RECEIPT_KEY_REUSE');issued.add(key);return {...args,p_operation_id:key}}
 const principal=Object.freeze({role:context?.role,actorId:context?.actorId,workerId:context?.workerId??null})
 api.setContext(context)
 let slot=null,frozenDraft=null,receipt=null,pendingKind=null,closed=false,verified=context?.status==='verified',generation=0,receiptTarget=null,pendingTarget=null
 const drafts=new Map(),listeners=new Set()
 let version=0,readVersion=0,refreshing=false
 const publish=(refresh=false)=>{version++;if(refresh)readVersion++;for(const f of [...listeners])f()}
 const subscribe=f=>{listeners.add(f);return()=>listeners.delete(f)}
 const getVersion=()=>version
 const getReadVersion=()=>readVersion
 const matches=c=>c?.status==='verified'&&c.role===principal.role&&c.actorId===principal.actorId&&(c.workerId??null)===principal.workerId&&(c.role!=='worker'||c.ready!==false)
 const state=()=>Object.freeze({...api.state(),ready:verified&&!closed&&api.state().ready,busy:api.state().busy||refreshing,slot:verified?slot:null,frozenDraft:verified?frozenDraft:null,receipt:verified?receipt:null,pendingKind:verified?pendingKind:null,receiptTarget:verified?receiptTarget:null,pendingTarget:verified?pendingTarget:null})
 const scopeMatches=c=>!closed&&verified&&matches(c)
 const draft=(key,initial)=>verified&&!closed&&drafts.has(key)?structuredClone(drafts.get(key)):structuredClone(initial)
 const saveDraft=(key,value)=>{if(!verified||closed||typeof key!=='string'||key.length>200)return false;drafts.set(key,structuredClone(value));return true}
 const clearDraft=key=>{if(verified&&!closed)drafts.delete(key)}
 const suspend=()=>{if(closed)return;generation++;verified=false;slot=null;refreshing=false;api.setContext({status:'checking'});publish()}
 const setAuthority=c=>{
  if(closed)return false
  if(c?.status==='checking'){suspend();return false}
  if(!matches(c)){dispose();return false}
  generation++;verified=true;slot=null;refreshing=false;api.setContext(c);publish();return true
 }
 const blocked=()=>({status:'blocked'})
 const usable=()=>verified&&!closed&&api.state().ready&&!api.state().busy&&!api.state().uncertain&&!api.state().refreshRequired&&!refreshing
 const reconcile=async()=>{if(closed||!verified||principal.role!=='manager'||api.state().busy||refreshing||api.state().refreshRequired||api.state().pendingReceiptV2)return blocked();const g=generation;const r=await api.call('recovery',{p_action:'discover',p_epoch:null,p_request_id:null});if(g!==generation||closed)return {status:'stale'};if(r.status==='ok')slot=r.value;else slot=null;publish();return r}
 const refreshReceipt=async()=>{
  if(closed||!verified||refreshing||!api.state().refreshRequired||!api.state().ready||api.state().busy)return blocked()
  const g=generation;refreshing=true;slot=null;publish()
  const r=await api.refreshAfterReceipt((snapshot,c)=>{
   if(snapshot.history_scope!=='independent_recent_kinds_plus_all_open_and_loaded_report_links')throw Error('WINDOW_RECEIPT_SCOPE')
   if(c.role==='manager')managerWindowHistoryV2(snapshot,{},{})
   else workerWindowReviewModel(snapshot,c.workerId)
  })
  if(g!==generation||closed||!verified)return {status:'stale'}
  refreshing=false
  if(r.status==='ok'){
   slot=r.value
   if(frozenDraft&&(slot?.epoch!==frozenDraft.p_epoch||slot?.active?.requestId!==frozenDraft.p_request_id))frozenDraft=null
  }
  publish(r.status==='ok');return r
 }
 const connect=async()=>{if(closed||!verified)return blocked();const g=generation;const r=await api.negotiate();if(g!==generation||closed)return {status:'stale'};if(r.status==='ready'&&api.state().refreshRequired)await refreshReceipt();else if(r.status==='ready'&&principal.role==='manager'&&!api.state().pendingReceiptV2)await reconcile();publish();return g===generation&&!closed?r:{status:'stale'}}
 const settle=(kind,r,g)=>{
  if(g!==generation||closed||!verified)return {status:'stale'}
  if(r.status==='ok'&&r.historicalReceipt){
   receiptTarget=pendingTarget;pendingTarget=null;pendingKind=null;slot=null
   receipt=['start','review'].includes(kind)?r.value:null
   if(kind==='ack'){frozenDraft=null;for(const k of drafts.keys())if(k.startsWith('assignment:'))drafts.delete(k)}
   publish(true);return r
  }
  if(r.status==='ok'){
   receiptTarget=pendingTarget;pendingTarget=null;pendingKind=null
   if(kind==='reserve'||kind==='commit'||kind==='cancel'||kind==='ack'){slot=r.value;if(kind==='ack')frozenDraft=null;receipt=slot.active?.receipt??null}
   else receipt=r.value
   if(kind==='ack')for(const k of drafts.keys())if(k.startsWith('assignment:'))drafts.delete(k)
  }else if(r.status!=='uncertain'&&r.status!=='stale'){pendingKind=null;pendingTarget=null}
  publish(r.status==='ok'&&(['commit','start','submit','review'].includes(kind)||(['reserve','cancel'].includes(kind)&&r.value?.active?.status==='committed')))
  return r
 }
 const reserve=async args=>{
  if(!usable()||context.role!=='manager'||!slot||slot.active!==null||args.p_action!=='reserve'||args.p_epoch!==slot.epoch)return blocked()
  if(!Array.isArray(args.p_prerequisites))return blocked()
  frozenDraft=Object.freeze({...args,p_prerequisites:Object.freeze([...args.p_prerequisites])});pendingKind='reserve';pendingTarget='assignment';const g=generation
  const work=api.call('assignment',frozenDraft);publish();const r=settle('reserve',await work,g);if(r.status==='invalid'||r.status==='blocked'){frozenDraft=null;publish()}return r
 }
 const commit=async()=>{
  if(!usable()||!frozenDraft||slot?.active?.status!=='reserved'||slot.active.requestId!==frozenDraft.p_request_id||slot.epoch!==frozenDraft.p_epoch)return blocked()
  pendingKind='commit';pendingTarget='assignment';const g=generation;const work=api.call('assignment',{...frozenDraft,p_action:'commit'});publish();return settle('commit',await work,g)
 }
 const recoveryAction=async action=>{
  if(!usable()||context.role!=='manager'||slot?.active?.kind!=='single_report_window_v1'||(action==='cancel'?slot.active.status!=='reserved':!['committed','cancelled'].includes(slot.active.status)))return blocked()
  const kind=action==='cancel'?'cancel':'ack';pendingKind=kind;pendingTarget='assignment';const g=generation
  let args;try{args=operationArgs({p_action:action,p_epoch:slot.epoch,p_request_id:slot.active.requestId})}catch{pendingKind=null;pendingTarget=null;return {status:'invalid'}}
  const work=api.call('recovery',args);publish();const r=settle(kind,await work,g);if(r.status==='ok'&&r.historicalReceipt)await refreshReceipt();return r
 }
 const perform=async(kind,args)=>{
  if(!usable()||!['start','submit','review'].includes(kind))return blocked()
  let wire;try{wire=kind==='submit'?args:operationArgs(args)}catch{return {status:'invalid'}}
  pendingKind=kind;pendingTarget=kind==='review'?'review:'+args.p_entry_id:'report:'+args.p_task_id;const g=generation;const work=api.call(kind,wire);publish();const r=settle(kind,await work,g);if(r.status==='ok'&&r.historicalReceipt)await refreshReceipt();return r
 }
 const replay=async()=>{if(closed||!verified||!api.state().canReplay||refreshing||!pendingKind)return blocked();const k=pendingKind,g=generation;const work=api.replay();publish();const r=settle(k,await work,g);if(r.status==='ok'&&r.historicalReceipt)await refreshReceipt();return r}
 const observePending=async()=>{if(closed||!verified||!api.state().ready||api.state().busy||!api.state().uncertain||api.state().canReplay)return blocked();const g=generation,work=api.observePending();publish();const r=await work;if(g!==generation||closed||!verified)return {status:'stale'};publish();return r}
 const dispose=()=>{closed=true;verified=false;generation++;api.dispose();slot=null;frozenDraft=null;receipt=null;pendingKind=null;receiptTarget=null;pendingTarget=null;drafts.clear();issued.clear();refreshing=false;publish();listeners.clear()}
 return Object.freeze({connect,reconcile,reserve,commit,cancel:()=>recoveryAction('cancel'),ack:()=>recoveryAction('acknowledge'),perform,replay,refreshReceipt,observePending,state,dispose,setAuthority,suspend,scopeMatches,draft,saveDraft,clearDraft,subscribe,getVersion,getReadVersion})
}
