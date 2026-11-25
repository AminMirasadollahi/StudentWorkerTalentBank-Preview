
// Isolated in-memory transport fixture, not an SQL implementation or real auth.
// Route is intercepted by Playwright only. Retains opaque request/receipt state
// across reload, no browser storage, no raw draft in server view.
export function createRecoveryBrowserFixture(){
 let epoch=0,active=null,loseCommit=false
 const calls=[]
 const view=()=>({ok:true,epoch,active})
 const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0')
 const valid=x=>typeof x==='string'&&/^[a-f0-9-]{36}$/.test(x)
 const same=p=>p.p_epoch===epoch&&active?.request_id===p.p_request_id
 function handle(p){
  if(!p||typeof p!=='object')return {status:400,body:{}}
  calls.push({action:p.p_action,epoch:p.p_epoch,key:p.p_request_id})
  if(p.p_action==='discover'&&p.p_epoch===null&&p.p_request_id===null)return {status:200,body:view()}
  if(!valid(p.p_request_id)||p.p_epoch!==epoch)return {status:409,body:{}}
  if(p.p_action==='reserve'){
   if(active&&!same(p))return {status:409,body:{}}
   if(!active)active={request_id:p.p_request_id,kind:p.p_kind,status:'reserved'}
  }else if(p.p_action==='commit'){
   if(!same(p)||active.status==='cancelled')return {status:409,body:{}}
   if(active.status==='reserved')active={...active,status:'committed',receipt:{ok:true,request_id:p.p_request_id,kind:p.p_kind,result:{id:id(201),state:'assigned',short_notice:true}}}
   if(loseCommit){loseCommit=false;return {status:503,body:{}}}
  }else if(p.p_action==='cancel'){
   if(!same(p))return {status:409,body:{}}
   if(active.status==='reserved')active={...active,status:'cancelled'}
  }else if(p.p_action==='acknowledge'){
   if(!same(p)||active.status==='reserved')return {status:409,body:{}}
   active=null;epoch++
  }else return {status:400,body:{}}
  return {status:200,body:view()}
 }
 return {handle,calls,view,loseNextCommitResponse:()=>{loseCommit=true}}
}
