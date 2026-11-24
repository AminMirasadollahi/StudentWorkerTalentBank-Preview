// Presentation-only search over manager-authorized snapshots. Never grants access.
import {normalizeCandidateQuery} from './managerCandidateView.mjs'
const text=value=>typeof value==='string'?value.trim():''
const normalized=value=>normalizeCandidateQuery(text(value).replace(/[\u200c\u200d]/g,' '))
export function buildOriginalWorkerNameIndex(workers,candidates){
 const names=new Map(), list=Array.isArray(workers)?workers:[]
 if(!Array.isArray(candidates))return {names,complete:false}
 const byWorker=new Map(),byApplication=new Map(),workerCounts=new Map()
 for(const w of list)if(text(w?.id))workerCounts.set(w.id,(workerCounts.get(w.id)||0)+1)
 for(const c of candidates){
  if(!c||typeof c!=='object')continue
  if(text(c.worker_id)){
   const group=byWorker.get(c.worker_id)||[]
   group.push(c);byWorker.set(c.worker_id,group)
  }
  if(text(c.id))byApplication.set(c.id,(byApplication.get(c.id)||0)+1)
 }
 for(const w of list){
  if(!text(w?.id)||!text(w.application_id)||workerCounts.get(w.id)!==1)continue
  const matches=byWorker.get(w.id)||[]
  if(matches.length!==1)continue
  const c=matches[0]
  if(c.id!==w.application_id||byApplication.get(c.id)!==1||!text(c.full_name))continue
  names.set(w.id,text(c.full_name))
 }
 return {names,complete:names.size===list.length}
}
export function selectManagerWorkerProfiles(workers,requests,originalNames,query=''){
 const list=Array.isArray(workers)?workers:[], q=normalized(query)
 const prior=new Map()
 for(const r of Array.isArray(requests)?requests:[]){
  if(r?.field_code!=='full_name'||r.review_state!=='approved'||!text(r.worker_id)||!text(r.proposed_value))continue
  const names=prior.get(r.worker_id)||[]
  names.push(normalized(r.proposed_value));prior.set(r.worker_id,names)
 }
 return list.flatMap(worker=>{
  if(!worker||!text(worker.id))return []
  if(!q||normalized(worker.name).includes(q))return [{worker,matchKind:'current'}]
  if(normalized(originalNames?.get(worker.id)).includes(q))return [{worker,matchKind:'original'}]
  if((prior.get(worker.id)||[]).some(name=>name.includes(q)))return [{worker,matchKind:'approved_history'}]
  return []
 })
}
