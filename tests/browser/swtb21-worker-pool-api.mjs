/* Synthetic browser-only RPCs. No imports, network or credentials. */
const g=globalThis
const current=()=>g.__qaPoolState?.[g.__qaCurrentWorker]||{general:[],desk:[]}
const read=(kind)=>{g.__qaPoolReads=(g.__qaPoolReads||0)+1;return structuredClone(current()[kind])}
export const getWorkerWorkPool=async()=>({ok:true,scope:'worker_published_work_pool',opportunities:read('general')})
export const getWorkerUnifiedWorkPool=getWorkerWorkPool
export const getWorkerDeskWorkPool=async()=>({ok:true,scope:'worker_desk_offers',offers:read('desk')})
async function claim(kind,args){
 const who=g.__qaCurrentWorker,mode=g.__qaClaimMode
 const item=current()[kind].find(x=>x.id===(args.opportunityId||args.offerId))
 if(!item||!item.claimable)throw Error('SYNTHETIC_SCOPE_DENIED')
 const taskId='TASK-'+item.id
 g.__qaClaimCalls.push({who,kind,args:structuredClone(args)})
 if(mode==='reject'){g.__qaClaimMode='ok';throw Error('SYNTHETIC_NO_RECEIPT')}
 const receipt={ok:true,task_id:taskId,shift_id:'SHIFT-'+item.id}
 if(mode==='defer'){
  return new Promise(resolve=>{g.__qaFinishClaim=()=>resolve(receipt)})
 }
 item.my_task_id=taskId;item.claimable=false
 g.__qaWorkerData.tasks.push({id:taskId,worker_id:who,title:item.title,planned_date:item.date,
  state:'assigned',estimate_minutes:60,unit:'library',instructions:'SYNTHETIC ONLY',collaborators:[]})
 if(mode==='lost'){g.__qaClaimMode='ok';throw Error('SYNTHETIC_LOST_RESPONSE_AFTER_COMMIT')}
 return receipt
}
export const claimWorkOpportunity=args=>claim('general',args)
export const claimUnifiedWorkShare=args=>claim('general',args)
export const claimDeskWorkOffer=args=>claim('desk',args)
