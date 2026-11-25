// Detached lifecycle candidate; no browser wiring or network on construction.
// Caller must invalidate synchronously on auth/session boundaries and visibility loss.
// Use fresh server role verification; never derive proof from cached user metadata.
export function createRecoveryAccessBinding({projectUrl,publishableKey,auth,fetchImpl,makeId,isVisible,createTransport}){
 const denied=()=>new Error('ASSIGNMENT_RECOVERY_ACCESS_UNVERIFIED')
 const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(x)&&x!=='00000000-0000-0000-0000-000000000000'
 if(typeof projectUrl!=='string'||!/^https:\/\/[a-z0-9]+\.supabase\.co\/?$/.test(projectUrl)||typeof publishableKey!=='string'||!/^sb_publishable_[A-Za-z0-9_-]+$/.test(publishableKey)||typeof auth?.getSession!=='function'||typeof auth?.getUser!=='function'||[fetchImpl,makeId,isVisible,createTransport].some(f=>typeof f!=='function'))throw denied()
 let generation=0,phase='blocked',ticket=null,scope=null,disposed=false
 const visible=()=>{try{return isVisible()===true}catch{return false}}
 const active=(s,g)=>!disposed&&phase==='verified'&&scope===s&&generation===g&&visible()
 const invalidate=()=>{generation++;ticket=null;phase='blocked';scope=null}
 const beginCheck=()=>{
  if(disposed)throw denied()
  generation++;phase='checking';ticket=Object.freeze({})
  return ticket
 }
 const makeScope=actorId=>{
  const s={actorId,fixture:null}
  const call=async(method,args)=>{
   const g=generation
   const isCurrent=()=>active(s,g)
   try{
    if(!isCurrent())throw denied()
    const transport=createTransport({projectUrl,publishableKey,auth,fetchImpl,actorId,isCurrent})
    const result=await transport[method](args)
    if(!isCurrent())throw denied()
    return result
   }catch{throw denied()}
  }
  s.fixture=Object.freeze({version:2,manualReserve:false,write:args=>call('write',args),control:args=>call('control',args),cancelExistingShift:args=>call('cancelExistingShift',args),makeId:()=>{if(!active(s,generation))throw denied();return makeId()}})
  return s
 }
 const accept=(proof,identity)=>{
  if(disposed||phase!=='checking'||!proof||proof!==ticket)return null
  ticket=null
  const id=identity?.user?.id
  if(!visible()||identity?.role!=='admin'||!uuid(id)||identity.user.is_anonymous===true){invalidate();return null}
  if(scope&&scope.actorId!==id){invalidate();return null}
  if(!scope)scope=makeScope(id)
  phase='verified'
  return scope.fixture
 }
 const fail=proof=>{if(!disposed&&phase==='checking'&&proof===ticket)invalidate()}
 const dispose=()=>{invalidate();disposed=true}
 return Object.freeze({beginCheck,accept,fail,invalidate,dispose})
}
