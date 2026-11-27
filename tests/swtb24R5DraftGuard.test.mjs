import test from 'node:test'
import assert from 'node:assert/strict'
import {createManagerDraftGuard,sameManagerRoute} from '../src/lib/managerDraftGuard.mjs'
const tasks={section:'work',workView:'tasks'},pool={section:'work',workView:'workPool',workPoolKind:'general'},people={section:'candidates',candidateView:'applicants'}
test('only dirty cross-route navigation requires explicit affirmative discard',()=>{
 const guard=createManagerDraftGuard()
 let calls=0;const deny=()=>{calls++;return false}
 assert.ok(guard.permitsNavigation(tasks,pool,deny));assert.equal(calls,0)
 const off=guard.register(Symbol())
 assert.ok(guard.hasDraft())
 assert.ok(sameManagerRoute(tasks,{...tasks,taskSearch:'a'}))
 assert.ok(guard.permitsNavigation(tasks,{...tasks,taskSearch:'a'},deny));assert.equal(calls,0)
 assert.equal(guard.permitsNavigation(tasks,pool,deny),false);assert.equal(calls,1)
 assert.equal(guard.permitsNavigation(tasks,people,()=>undefined),false)
 assert.ok(guard.permitsNavigation(tasks,pool,()=>true))
 assert.ok(guard.hasDraft(),'permission is not a state mutation')
 off();assert.ok(!guard.hasDraft());assert.ok(guard.permitsNavigation(tasks,pool,deny))
})
test('multiple registered editors stay guarded until all unmount; new scope is empty',()=>{
 const guard=createManagerDraftGuard(),a=guard.register(Symbol()),b=guard.register(Symbol())
 a();assert.ok(guard.hasDraft());assert.ok(!guard.permitsNavigation(pool,{...pool,workPoolKind:'desk'},()=>false))
 b();assert.ok(!guard.hasDraft());assert.ok(!createManagerDraftGuard().hasDraft())
})

test('retained drafts are cloned, revision scoped and clearable without affecting route locks',()=>{
 const g=createManagerDraftGuard(),v={title:'synthetic',ids:['a']};g.writeDraft('direct',1,v);v.ids.push('b')
 assert.deepEqual(g.readDraft('direct',1),{title:'synthetic',ids:['a']});assert.equal(g.readDraft('direct',2),undefined)
 const read=g.readDraft('direct',1);read.ids.push('c');assert.deepEqual(g.readDraft('direct',1).ids,['a'])
 assert.equal(createManagerDraftGuard().readDraft('direct',1),undefined);assert.equal(g.hasDraft(),false)
 g.clearDraft('direct');assert.equal(g.readDraft('direct',1),undefined);g.writeDraft('pool',0,v);g.clearRetained();assert.equal(g.readDraft('pool',0),undefined)
})
