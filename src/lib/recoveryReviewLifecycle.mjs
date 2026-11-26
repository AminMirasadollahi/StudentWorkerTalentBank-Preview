// Explicit review or operational candidate configuration. Both opt-ins default OFF.
const PRODUCTION_REF='pmwxryavkrjcdobwkryw'
export function resolveRecoveryReviewConfig(env){
 const review=env?.VITE_SWTB22_RECOVERY_REVIEW_UI==='true'
 const release=env?.VITE_SWTB22_RECOVERY_RELEASE_UI==='true'
 const atomic=env?.VITE_SWTB23_WORKER_POLICY_RELEASE==='true'
 // The strict policy release must never expose a legacy assignment writer.
 if(!review&&!release)return Object.freeze({mode:atomic?'blocked':'off'})
 const blocked=()=>Object.freeze({mode:'blocked'})
 if(review&&release)return blocked()
 const expected=review?env.VITE_SWTB22_RECOVERY_REVIEW_PROJECT_REF:env.VITE_SWTB22_RECOVERY_RELEASE_PROJECT_REF
 const url=env.VITE_SUPABASE_URL,key=env.VITE_SUPABASE_PUBLISHABLE_KEY
 if(typeof expected!=='string'||! /^[a-z0-9]{20}$/.test(expected)||
  (review?expected===PRODUCTION_REF:expected!==PRODUCTION_REF)||
  url!=='https://'+expected+'.supabase.co'||typeof key!=='string'||!/^sb_publishable_[A-Za-z0-9_-]+$/.test(key))
  return blocked()
 return Object.freeze({mode:review?'review':'release',projectUrl:url,publishableKey:key,...(atomic?{version:3}:{})})
}
export function assertLegacyAssignmentAllowed(env){
 if(resolveRecoveryReviewConfig(env).mode!=='off')throw Error('SWTB22_LEGACY_ASSIGNMENT_BLOCKED')
}
export async function verifyRecoveryReviewAdmin({projectUrl,publishableKey,auth,fetchImpl,actorId,isCurrent}){
 const denied=()=>Error('RECOVERY_REVIEW_ADMIN_UNVERIFIED')
 const guard=()=>{if(isCurrent()!==true)throw denied()}
 try{
  const sessionToken=async()=>{
   guard();const r=await auth.getSession();guard()
   const token=r?.data?.session?.access_token
   if(r?.error||typeof token!=='string'||!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token))throw denied()
   return token
  }
  const token=await sessionToken()
  const user=await auth.getUser(token);guard()
  if(user?.error||user?.data?.user?.id!==actorId||user.data.user.is_anonymous===true)throw denied()
  if(await sessionToken()!==token)throw denied()
  guard()
  const result=await fetchImpl(projectUrl+'/rest/v1/rpc/ops_is_admin',{method:'POST',headers:{apikey:publishableKey,Authorization:'Bearer '+token,'Content-Type':'application/json',Accept:'application/json','Content-Profile':'public'},body:'{}',credentials:'omit',redirect:'error',cache:'no-store',referrerPolicy:'no-referrer'})
  guard()
  if(result?.ok!==true||await result.json()!==true)throw denied()
  guard()
  if(await sessionToken()!==token)throw denied()
  guard()
  return {role:'admin',user:{id:actorId,is_anonymous:false}}
 }catch{throw denied()}
}
export function createRecoveryReviewLifecycle({binding,verify,actorId,isVisible,notify}){
 let revision=0,fixture=null,terminal=false,disposed=false
 const publish=(status)=>notify(Object.freeze({status,fixture,terminal}))
 const suspend=()=>{
  if(disposed||terminal)return
  revision++;binding.beginCheck();publish('checking')
 }
 const terminate=()=>{
  if(disposed)return
  revision++;terminal=true;binding.invalidate();fixture=null;publish('blocked')
 }
 const check=async()=>{
  if(disposed||terminal||!isVisible())return false
  const g=++revision,ticket=binding.beginCheck();publish('checking')
  const current=()=>!disposed&&!terminal&&revision===g&&isVisible()===true
  try{
   const identity=await verify({actorId,isCurrent:current})
   if(!current())return false
   const accepted=binding.accept(ticket,identity)
   if(!accepted)throw Error('REVIEW_DENIED')
   fixture=accepted;publish('ready');return true
  }catch{
   if(current()){binding.fail(ticket);fixture=null;publish('blocked')}
   return false
  }
 }
 const authChanged=(event,session)=>{
  if(disposed||terminal||event==='INITIAL_SESSION')return false
  if(event==='SIGNED_OUT'||event==='PASSWORD_RECOVERY'||session?.user?.id!==actorId){terminate();return false}
  // Event metadata is used only to deny/suspend, never to authorize.
  suspend();return true
 }
 const dispose=()=>{revision++;disposed=true;binding.dispose();fixture=null}
 return Object.freeze({suspend,terminate,check,authChanged,dispose})
}
