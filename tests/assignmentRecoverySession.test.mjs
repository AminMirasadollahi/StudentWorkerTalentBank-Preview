import test from 'node:test'
import assert from 'node:assert/strict'
import {createAssignmentRecoverySession,parseRecoveryView} from '../src/lib/assignmentRecoverySession.mjs'
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0')
const A=id(1),B=id(2),K=id(100)
const draft={kind:'direct',workerIds:[id(10)],unit:'library',title:'نمونه کار',instructions:'شرح نمونه',date:'2026-12-01',minutes:60,startMinute:null,endMinute:null,reason:null}
const envelope=(epoch=0,active=null)=>({ok:true,epoch,active})
const reserved=(key=K,kind='direct')=>({request_id:key,kind,status:'reserved'})
const terminal=(key=K,kind='direct')=>({...reserved(key,kind),status:'committed',receipt:{ok:true,request_id:key,kind,result:{id:id(200),state:'assigned',short_notice:false}}})
function fixture(){
 let view=envelope(),mode='',n=100
 const calls=[]
 const write=async p=>{
  calls.push(p)
  if(mode==='lost-before')throw Error('lost')
  if(p.p_epoch!==view.epoch)throw Error('stale')
  if(p.p_action==='reserve'){
   if(view.active&&view.active.request_id!==p.p_request_id)throw Error('occupied')
   if(!view.active)view=envelope(view.epoch,reserved(p.p_request_id,p.p_kind))
  }else{
   if(view.active?.status!=='reserved'||view.active.request_id!==p.p_request_id)throw Error('sealed')
   view=envelope(view.epoch,terminal(p.p_request_id,p.p_kind))
  }
  if(mode==='lost-after')throw Error('lost')
  return view
 }
 const control=async p=>{
  calls.push(p)
  if(p.p_action==='discover')return view
  if(view.epoch!==p.p_epoch||view.active?.request_id!==p.p_request_id)throw Error('stale')
  if(p.p_action==='cancel'&&view.active.status==='reserved')view=envelope(view.epoch,{...view.active,status:'cancelled'})
  if(p.p_action==='acknowledge'&&view.active.status!=='reserved')view=envelope(view.epoch+1)
  if(mode==='lost-after')throw Error('lost')
  return view
 }
 const make=()=>{const s=createAssignmentRecoverySession({write,control,makeId:()=>id(n++)});s.setAccess({status:'verified',actorId:A});return s}
 return {make,calls,setMode:m=>{mode=m},setView:v=>{view=v}}
}
test('fresh discovery mandatory and exact typed reserve/commit/ack arguments',async()=>{
 const f=fixture(),s=f.make()
 assert.equal(await s.reserve(draft),'blocked');assert.equal(await s.discover(),'idle')
 assert.equal(await s.reserve(draft),'reserved');assert.equal(s.snapshot().canCommit,true)
 assert.equal(await s.commit(),'committed');assert.equal(await s.commit(),'blocked')
 assert.equal(await s.acknowledge(),'idle')
 assert.deepEqual(f.calls[0],{p_action:'discover',p_epoch:null,p_request_id:null})
 assert.equal(f.calls[1].p_action,'reserve');assert.equal(f.calls[2].p_action,'commit')
 assert.deepEqual({...f.calls[1],p_action:'commit'},f.calls[2])
 assert.equal(Object.isFrozen(f.calls[1]),true);assert.equal(Object.isFrozen(f.calls[1].p_worker_ids),true)
 assert.deepEqual(f.calls[3],{p_action:'acknowledge',p_epoch:0,p_request_id:K})
})
test('lost reserve response and reload allow cancellation but never replay without payload',async()=>{
 const f=fixture(),s=f.make();await s.discover();f.setMode('lost-after')
 assert.equal(await s.reserve(draft),'unknown');s.dispose();f.setMode('')
 const t=f.make();assert.equal(await t.discover(),'reserved');assert.equal(t.snapshot().payload,null)
 assert.equal(await t.commit(),'blocked');assert.equal(await t.cancel(),'cancelled');assert.equal(await t.acknowledge(),'idle')
})
test('absent discovery at same epoch after lost reserve does not permit new key',async()=>{
 const f=fixture(),s=f.make();await s.discover();f.setMode('lost-before')
 assert.equal(await s.reserve(draft),'unknown');f.setMode('')
 assert.equal(await s.discover(),'reserve_unknown');assert.equal(await s.reserve(draft),'blocked')
 assert.equal(await s.retryReserve(),'reserved')
 assert.equal(f.calls[1].p_request_id,f.calls[3].p_request_id)
 assert.deepEqual(f.calls[1],f.calls[3])
})
test('lost commit response recovered by fresh discovery, no second write',async()=>{
 const f=fixture(),s=f.make();await s.discover();await s.reserve(draft);f.setMode('lost-after')
 assert.equal(await s.commit(),'unknown');f.setMode('');s.dispose()
 const t=f.make();assert.equal(await t.discover(),'committed');assert.equal(t.snapshot().payload,null)
 assert.equal(t.snapshot().receipt.result.id,id(200));assert.equal(await t.commit(),'blocked')
 assert.equal(f.calls.filter(x=>x.p_action==='commit').length,1)
})
test('cancel can return committed winner rather than report cancellation',async()=>{
 const f=fixture(),s=f.make();await s.discover();await s.reserve(draft)
 f.setView(envelope(0,terminal()));assert.equal(await s.cancel(),'committed')
 assert.equal(s.snapshot().canAcknowledge,true)
})
test('ack response lost, later discover sees advanced epoch',async()=>{
 const f=fixture(),s=f.make();await s.discover();await s.reserve(draft);await s.commit()
 f.setMode('lost-after');assert.equal(await s.acknowledge(),'unknown');f.setMode('')
 assert.equal(await s.discover(),'idle');assert.equal(s.snapshot().epoch,1)
})
test('another tab occupies slot; old payload never reused',async()=>{
 const f=fixture(),s=f.make();await s.discover();f.setView(envelope(0,reserved(id(111))))
 assert.equal(await s.reserve(draft),'unknown');assert.equal(await s.discover(),'reserved')
 assert.equal(s.snapshot().requestId,id(111));assert.equal(s.snapshot().payload,null);assert.equal(await s.commit(),'blocked')
})
test('recheck and actor switch discard late response, require fresh discovery',async()=>{
 let finish
 const s=createAssignmentRecoverySession({write:async()=>{throw Error('must not write')},control:()=>new Promise(r=>{finish=r}),makeId:()=>K})
 s.setAccess({status:'verified',actorId:A});const p=s.discover()
 s.setAccess({status:'checking'});s.setAccess({status:'verified',actorId:B})
 finish(envelope(0,terminal()));assert.equal(await p,'stale');assert.equal(s.snapshot().canStart,false);assert.equal(s.snapshot().receipt,null)
})
test('same actor recheck retains immutable payload but blocks commit until fresh read',async()=>{
 const f=fixture(),s=f.make();await s.discover();await s.reserve(draft)
 const p=s.snapshot().payload;s.setAccess({status:'checking'});assert.equal(s.snapshot().payload,undefined)
 s.setAccess({status:'verified',actorId:A});assert.equal(await s.commit(),'blocked')
 assert.equal(await s.discover(),'reserved');assert.equal(s.snapshot().payload,p)
})
test('invalid view and incorrect receipt never permit acknowledgment',()=>{
 for(const raw of [null,{},envelope(-1),envelope(0,{...reserved(),digest:'private'}),envelope(0,{...terminal(),receipt:{ok:true}}),envelope(0,{...terminal(),request_id:id(111)})])assert.equal(parseRecoveryView(raw),null)
})
test('recovered group/desk shape validates without reconstructing draft',()=>{
 const group={...terminal(),receipt:{ok:true,request_id:K,kind:'direct',result:{ok:true,group_id:id(201),member_count:2,minutes_per_worker:60,unit_code:'library'}}}
 assert.equal(parseRecoveryView(envelope(0,group)).active.receipt.result.member_count,2)
 const desk={...terminal(K,'desk'),receipt:{ok:true,request_id:K,kind:'desk',result:{ok:true,assigned:[{task_id:id(202),worker_id:id(10)}],shift_date:'2026-12-01',start_minute:480,end_minute:540,minutes_per_worker:60}}}
 assert.equal(parseRecoveryView(envelope(0,desk)).active.receipt.result.minutes_per_worker,60)
 desk.receipt.result.end_minute=470;assert.equal(parseRecoveryView(envelope(0,desk)),null)
})
test('missing slot after observed reservation is inconsistent and stays blocked',async()=>{
 const f=fixture(),s=f.make();await s.discover();await s.reserve(draft);f.setView(envelope())
 assert.equal(await s.discover(),'unknown');assert.equal(s.snapshot().canStart,false)
})

test('late reserve response after identity change cannot permit commit or reveal draft',async()=>{
 let finish
 const calls=[]
 const s=createAssignmentRecoverySession({makeId:()=>K,control:async()=>envelope(),write:p=>{calls.push(p);return new Promise(r=>{finish=r})}})
 s.setAccess({status:'verified',actorId:A});await s.discover()
 const p=s.reserve(draft)
 s.setAccess({status:'verified',actorId:B})
 finish(envelope(0,reserved()))
 assert.equal(await p,'stale')
 assert.equal(s.snapshot().payload,null);assert.equal(await s.commit(),'blocked')
 assert.equal(calls.length,1)
})
test('malformed commit receipt requires discovery before any new action',async()=>{
 const f=fixture(),s=f.make();await s.discover();await s.reserve(draft)
 f.setView(envelope(0,{...terminal(),receipt:{ok:true}}))
 assert.equal(await s.discover(),'unknown')
 assert.equal(await s.acknowledge(),'blocked')
 assert.equal(await s.reserve(draft),'blocked')
})

test('one explicit submit performs exact reserve then commit once',async()=>{
 const f=fixture(),s=f.make();await s.discover()
 const p=s.submit(draft)
 assert.equal(await s.submit(draft),'blocked')
 assert.equal(await p,'committed')
 assert.deepEqual(f.calls.filter(x=>x.p_action!=='discover').map(x=>x.p_action),['reserve','commit'])
 assert.deepEqual({...f.calls[1],p_action:'commit'},f.calls[2])
})
test('lost reserve response stops one-click chain; discovery does not commit',async()=>{
 const f=fixture(),s=f.make();await s.discover();f.setMode('lost-after')
 assert.equal(await s.submit(draft),'unknown');f.setMode('')
 assert.equal(await s.discover(),'reserved')
 assert.equal(f.calls.filter(x=>x.p_action==='commit').length,0)
 assert.equal(await s.commit(),'committed')
})
test('same actor verification change while reserve pending never auto-commits',async()=>{
 let finish
 const calls=[]
 // First discovery must be idle, subsequent discovery sees the reservation.
 let first=true
 const t=createAssignmentRecoverySession({makeId:()=>K,control:async()=>{if(first){first=false;return envelope()}return envelope(0,reserved())},write:p=>{calls.push(p);return new Promise(r=>{finish=r})}})
 t.setAccess({status:'verified',actorId:A});await t.discover()
 const pending=t.submit(draft)
 t.setAccess({status:'checking'});t.setAccess({status:'verified',actorId:A})
 await t.discover();finish(envelope(0,reserved()))
 assert.equal(await pending,'stale');assert.equal(calls.length,1)
 assert.equal(t.snapshot().state,'reserved');assert.equal(t.snapshot().canCommit,true)
 t.dispose()
})
test('malformed reservation response does not trigger commit',async()=>{
 const calls=[]
 const s=createAssignmentRecoverySession({makeId:()=>K,control:async()=>envelope(),write:async p=>{calls.push(p);return envelope(0,reserved(id(999)))}})
 s.setAccess({status:'verified',actorId:A});await s.discover()
 assert.equal(await s.submit(draft),'unknown');assert.equal(calls.length,1);assert.equal(s.snapshot().canStart,false)
})
