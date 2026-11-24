import test from 'node:test'
import assert from 'node:assert/strict'
import {createWorkPoolRouteFence} from '../src/lib/workPoolRouteFence.mjs'
const pool={section:'work',workView:'workPool',workPoolKind:'general'}
const tasks={...pool,workView:'tasks'}
const desk={...pool,workPoolKind:'desk'}
const applicants={...pool,section:'candidates'}
test('fence locks synchronously before awaiting a write and prevents route or kind escape',()=>{
 const f=createWorkPoolRouteFence(),a=Symbol(),b=Symbol()
 assert.equal(f.permitsNavigation(pool,tasks),true)
 assert.equal(f.begin(a,'create'),true)
 assert.equal(f.begin(b,'desk'),false)
 assert.equal(f.begin(a,'create'),false)
 for(const n of [tasks,desk,applicants])assert.equal(f.permitsNavigation(pool,n),false)
 assert.equal(f.permitsNavigation(pool,{...pool,taskSearch:'new'}),true)
 assert.equal(f.unknown(a),true);assert.equal(f.getSnapshot().status,'unknown')
 assert.equal(f.reviewReady(a),false)
 assert.equal(f.confirmed(b),false);assert.equal(f.retry(b,'create'),false)
 assert.equal(f.retry(a,'edit'),false);assert.equal(f.retry(a,'create'),true)
 assert.equal(f.confirmed(a),true);assert.equal(f.permitsNavigation(pool,tasks),true)
})
test('legacy/desk unknown is not replay permission; explicit fresh review required to release',()=>{
 for(const kind of ['legacy','desk','transition']){
  const f=createWorkPoolRouteFence(),a=Symbol()
  f.begin(a,kind);f.unknown(a)
  assert.equal(f.acknowledgeReview(a),false)
  assert.equal(f.retry(a,kind),false)
  assert.equal(f.reviewReady(a),true);assert.equal(f.permitsNavigation(pool,tasks),false)
  assert.equal(f.invalidateReview(a),true);assert.equal(f.acknowledgeReview(a),false)
  f.reviewReady(a);assert.equal(f.acknowledgeReview(a),true)
  assert.equal(f.getSnapshot(),null)
 }
})
test('remount or different owner cannot clear a pending fence; new identity has a new fence',()=>{
 const f=createWorkPoolRouteFence(),a=Symbol(),b=Symbol()
 f.begin(a,'edit');f.unknown(a)
 assert.equal(f.begin(b,'edit'),false);assert.equal(f.reviewReady(b),false)
 assert.equal(f.confirmed(b),false);assert.equal(createWorkPoolRouteFence().getSnapshot(),null)
})
test('subscriber is notified on lock transitions and unsubscribe works',()=>{
 const f=createWorkPoolRouteFence(),a=Symbol();let n=0
 const off=f.subscribe(()=>n++);f.begin(a,'create');f.unknown(a);off();f.confirmed(a)
 assert.equal(n,2)
})
