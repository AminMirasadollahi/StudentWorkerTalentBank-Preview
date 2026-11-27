import test from 'node:test'
import assert from 'node:assert/strict'
import {validateWindowTermRead as read,validateWindowTermAccess as access,buildReviewAssignmentScope as scope} from '../src/lib/windowTermReview.mjs'
import {term,termFixture as fixture,accessFixture,fixtureReadiness} from './browser/windowTermFixtureData.mjs'
import {manager,worker,id} from './browser/windowReadReviewFixtureData.mjs'
const f=()=>fixture()
const snapshot={...manager,workers:[{...manager.workers[0],state:'active'}]}
test('whole term, unit slice and worker slice preserve shared pool semantics',()=>{assert.equal(read(f()).pools[0].remaining_minutes,820);assert.equal(read(fixture({p_unit_code:'research'}),{unit:'research'}).pools[0].approved_minutes,180);assert.equal(read(fixture({p_worker_id:worker}),{workerId:worker}).pools[0].remaining_minutes,null)})
test('invalid scope, remaining and worker totals rejected',()=>{for(const x of [{...f(),filters:{unit_code:'research',worker_id:null}},{...f(),pools:[{...f().pools[0],remaining_minutes:821}]},{...f(),workers:[]}])assert.throws(()=>read(x))})
test('weekly and unreported pools must reconcile',()=>{assert.throws(()=>read({...f(),weeks:[]}));assert.throws(()=>read({...f(),pools:[{...f().pools[0],unreported_estimate_minutes:121}]}))})
test('no active term has no invented totals',()=>{const x={...f(),term:null,terms:[{...term,state:'closed'}],units:[],workers:[],weeks:[],pools:[]};assert.equal(read(x).term,null);assert.throws(()=>read({...x,units:f().units}))})
test('access validates counts, term identity and duplicate workers',()=>{assert.equal(access(accessFixture,term).active_workers,1);for(const x of [{...accessFixture,active_workers:2},{...accessFixture,term_id:id(99)},{...accessFixture,workers:[...accessFixture.workers,...accessFixture.workers]}])assert.throws(()=>access(x,term))})
test('assignment scope uses membership response, not injected eligibility',()=>{const x=scope({snapshot,termRead:f(),access:accessFixture,fixtureReadiness});assert.equal(x.workers[0].eligibility,'eligible');const a={...accessFixture,active_not_eligible:1,workers:[{...accessFixture.workers[0],eligibility:'not_eligible'}]};assert.equal(scope({snapshot,termRead:f(),access:a,fixtureReadiness}).workers[0].eligibility,'not_eligible')})
test('missing synthetic readiness or mismatched roster fail closed',()=>{assert.equal(scope({snapshot,termRead:f(),access:accessFixture}),null);assert.throws(()=>scope({snapshot:{...snapshot,workers:[]},termRead:f(),access:accessFixture,fixtureReadiness}))})
