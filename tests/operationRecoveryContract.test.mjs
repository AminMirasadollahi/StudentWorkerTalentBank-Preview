import test from 'node:test'
import assert from 'node:assert/strict'
import {createSyntheticOperationRegistry,recoveryProjection,createSyntheticRecoveryReader} from './fixtures/operationRecoveryContract.mjs'
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0')
const A=id(1),B=id(2),K=id(100),L=id(101),R=id(200)
const intent=(epoch=0,requestId=K,kind='assignment',digest='a'.repeat(64))=>({epoch,requestId,kind,digest})
test('lost reserve response is discoverable after a fresh reader, no payload persisted',()=>{
 const s=createSyntheticOperationRegistry()
 s.reserve(A,intent())
 const p=recoveryProjection(s.discover(A))
 assert.equal(p.state,'reserved');assert.equal(p.canStart,false);assert.equal(p.canReplay,false);assert.equal(p.canCancel,true)
 assert.equal(p.requestId,K)
 assert.equal(recoveryProjection(s.discover(B)).state,'idle')
 assert.equal(s.reserve(A,{...intent(),description:'private'}).ok,false)
})
test('same reservation is idempotent; new key and changed digest blocked',()=>{
 const s=createSyntheticOperationRegistry()
 assert.deepEqual(s.reserve(A,intent()),s.reserve(A,intent()))
 assert.equal(s.reserve(A,intent(0,L)).code,'ACTIVE_EXISTS')
 assert.equal(s.reserve(A,intent(0,K,'assignment','b'.repeat(64))).code,'KEY_CONFLICT')
})
test('commit winner returns one receipt; replay cannot invoke writer twice; cancel does not undo commit',()=>{
 const s=createSyntheticOperationRegistry();let writes=0
 s.reserve(A,intent());const write=()=>{writes++;return R}
 const first=s.commit(A,intent(),write)
 assert.deepEqual(s.commit(A,intent(),write),first)
 assert.deepEqual(s.cancel(A,0,K),first)
 assert.equal(writes,1)
 assert.equal(recoveryProjection(s.discover(A)).state,'committed')
 assert.equal(recoveryProjection(s.discover(A)).canStart,false)
 assert.equal(s.acknowledge(A,0,K).epoch,1)
 assert.equal(s.commit(A,intent(),write).ok,false);assert.equal(writes,1)
})
test('cancel winner seals delayed writer, acknowledgment advances epoch and retires key',()=>{
 const s=createSyntheticOperationRegistry();let writes=0
 s.reserve(A,intent())
 assert.equal(s.cancel(A,0,K).active.status,'cancelled')
 assert.equal(s.commit(A,intent(),()=>{writes++;return R}).code,'SEALED')
 assert.equal(s.acknowledge(A,0,K).epoch,1)
 assert.equal(s.reserve(A,intent(0,L)).code,'STALE_EPOCH')
 assert.equal(s.reserve(A,intent(1,K)).code,'KEY_RETIRED')
 assert.equal(s.reserve(A,intent(1,L)).ok,true);assert.equal(writes,0)
})
test('cannot acknowledge unresolved operation or use other actor to cancel/commit',()=>{
 const s=createSyntheticOperationRegistry();s.reserve(A,intent())
 assert.equal(s.acknowledge(A,0,K).code,'UNRESOLVED')
 assert.equal(s.cancel(B,0,K).code,'NOT_ACTIVE')
 assert.equal(s.commit(B,intent(),()=>{throw Error('MUST_NOT_WRITE')}).code,'NOT_ACTIVE')
 assert.equal(s.discover(A).active.status,'reserved')
})
test('unkeyed legacy writes intentionally excluded from registry',()=>{
 const s=createSyntheticOperationRegistry()
 assert.equal(s.reserve(A,intent(0,K,'legacy')).ok,false)
 for(const kind of ['pool_create','pool_edit','pool_transition','desk_create','desk_transition']){
  const r=createSyntheticOperationRegistry()
  assert.equal(r.reserve(A,intent(0,K,kind)).ok,true)
 }
})
test('malformed discovery never authorizes new operation or replay',()=>{
 const s=createSyntheticOperationRegistry();s.reserve(A,intent())
 const raw=s.discover(A)
 for(const bad of [null,{}, {ok:true,epoch:0}, {...raw,active:{...raw.active,title:'secret'}}, {...raw,active:{...raw.active,status:'committed'}}, {...raw,active:{...raw.active,epoch:9}}]){
  const p=recoveryProjection(bad);assert.equal(p.state,'blocked');assert.equal(p.canStart,false);assert.equal(p.canReplay,false)
 }
})
test('stale discovery cannot expose prior actor or earlier verification result',async()=>{
 let finish
 const reader=createSyntheticRecoveryReader(()=>new Promise(r=>{finish=r}))
 reader.setAccess({status:'verified',actorId:A})
 const pending=reader.refresh()
 reader.setAccess({status:'checking'});reader.setAccess({status:'verified',actorId:B})
 const s=createSyntheticOperationRegistry();s.reserve(A,intent());finish(s.discover(A))
 assert.equal(await pending,'stale');assert.equal(reader.snapshot().state,'blocked')
})
test('fresh verification and server discovery mandatory; denied or failed read blocks',async()=>{
 const s=createSyntheticOperationRegistry()
 const r=createSyntheticRecoveryReader(async a=>s.discover(a))
 assert.equal(await r.refresh(),'blocked')
 r.setAccess({status:'verified',actorId:A})
 assert.equal(r.snapshot().canStart,false)
 assert.equal(await r.refresh(),'idle');assert.equal(r.snapshot().canStart,true)
 r.setAccess({status:'denied'});assert.equal(r.snapshot().canStart,false)
 const bad=createSyntheticRecoveryReader(async()=>{throw Error('network')})
 bad.setAccess({status:'verified',actorId:A});assert.equal(await bad.refresh(),'blocked')
})
test('older same-actor read cannot replace fresh discovery',async()=>{
 const queue=[]
 const r=createSyntheticRecoveryReader(()=>new Promise(resolve=>queue.push(resolve)))
 r.setAccess({status:'verified',actorId:A});const old=r.refresh(),latest=r.refresh()
 const s=createSyntheticOperationRegistry();s.reserve(A,intent())
 queue[1](s.discover(A));assert.equal(await latest,'reserved')
 queue[0]({ok:true,epoch:0,active:null});assert.equal(await old,'stale');assert.equal(r.snapshot().state,'reserved')
})
