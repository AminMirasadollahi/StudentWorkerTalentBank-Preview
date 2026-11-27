import test from 'node:test'
import assert from 'node:assert/strict'
import {createWindowReadReviewPort,windowReadReviewScope} from '../src/lib/windowReadReviewPort.mjs'
import {id,worker,manager,self} from './browser/windowReadReviewFixtureData.mjs'
const actor=id(98)
const ctx={status:'verified',role:'manager',actorId:actor,workerId:null}
const student={...ctx,role:'worker',workerId:worker,ready:true}
const holds=['window_extension','late_submission','correction','term_closure_policy','post_assignment_eligibility_policy','window_prerequisite_edit','nonapproval_review','batch_write']
const cap=c=>({contract_version:1,audience:c.role,actor_id:c.actorId,worker_id:c.workerId,schedule_contract_version:2,review_only:true,operational_enabled:false,fixture_enabled:true,allowed_schedule_kinds:['legacy_day','single_report_window'],held_operations:holds})
const make=(c=ctx,data=manager,capability=cap(c))=>{const calls=[];const port=createWindowReadReviewPort({syntheticReviewOnly:true,fixtureTransport:async(n,a)=>{calls.push(n);return n.endsWith('capabilities_v1')?capability:data}});return {port,calls,request:{port,context:c}}}
test('explicit port only, no fake object accepted',()=>{assert.throws(()=>createWindowReadReviewPort({fixtureTransport:async()=>manager}));assert.equal(windowReadReviewScope({port:{read:async()=>manager},context:ctx},'manager',null,0),null)})
test('checking, other role, wrong worker, not-ready and invalid revision denied',()=>{const {request}=make(student,self);assert.ok(windowReadReviewScope(request,'worker',worker,0));for(const [req,role,w,rev] of [[{...request,context:{...student,status:'checking'}},'worker',worker,0],[request,'manager',null,0],[request,'worker',id(3),0],[{...request,context:{...student,ready:false}},'worker',worker,0],[request,'worker',worker,-1]])assert.equal(windowReadReviewScope(req,role,w,rev),null)})
test('refresh, port replacement and principal change invalidate scope identity',()=>{const a=make(),b=make();const key=(r,rev=0)=>windowReadReviewScope(r,'manager',null,rev).key;assert.notEqual(key(a.request),key(b.request));assert.notEqual(key(a.request),key(a.request,1));assert.notEqual(key(a.request),key({...a.request,context:{...ctx,actorId:id(99)}}))})
test('only negotiated manager read; no legacy fallback',async()=>{const {port,calls}=make();assert.deepEqual(await port.read(ctx),manager);assert.deepEqual(calls,['qa_window_api_capabilities_v1','qa_window_api_manager_read_v1'])})
test('capability mismatch stops before read',async()=>{const {port,calls}=make(ctx,manager,{...cap(ctx),actor_id:id(99)});await assert.rejects(port.read(ctx));assert.deepEqual(calls,['qa_window_api_capabilities_v1'])})
test('old scope or unknown coverage rejected, no fallback',async()=>{for(const scope of [undefined,'legacy_recent_plus_all_open']){const {port,calls}=make(ctx,{...manager,history_scope:scope});await assert.rejects(port.read(ctx));assert.equal(calls.length,2)}})
test('worker report owner mismatch denied',async()=>{const {port}=make(student,{...self,time_entries:[{...self.time_entries[0],worker_id:id(99)}]});await assert.rejects(port.read(student));assert.deepEqual(await make(student,self).port.read(student),self)})

import {assignmentScopeFixture} from './browser/windowTermFixtureData.mjs'
test('assignment scope uses only negotiated manager route and exact actor',async()=>{const {port,calls}=make(ctx,assignmentScopeFixture);assert.deepEqual(await port.assignmentScope(ctx),assignmentScopeFixture);assert.deepEqual(calls,['qa_window_api_capabilities_v1','qa_window_api_assignment_scope_v1']);await assert.rejects(make(ctx,{...assignmentScopeFixture,actor_id:id(99)}).port.assignmentScope(ctx));const w=make(student,assignmentScopeFixture);await assert.rejects(w.port.assignmentScope(student));assert.deepEqual(w.calls,['qa_window_api_capabilities_v1'])})
