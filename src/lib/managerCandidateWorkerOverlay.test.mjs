import test from 'node:test';
import assert from 'node:assert/strict';
import {needsManagerWorkerIdentitySnapshot,projectCandidatesFromManagerWorkers as join,fetchCandidatesWithAuthorizedWorkerIdentity as fetchJoined} from './managerCandidateWorkerOverlay.mjs';
const base={id:'a1',worker_id:'w1',full_name:'OLD_N',major:'OLD_M'};
const worker={id:'w1',application_id:'a1',name:'APPROVED_N',major:'APPROVED_M'};
const snapshot={workers:[worker],tasks:[{task:'SECRET_TASK'}],time_entries:[{note:'SECRET_NOTE'}]};
test('linked worker projects approved name and major',()=>{const r=join([base],snapshot)[0];assert.equal(r.worker_effective_full_name,'APPROVED_N');assert.equal(r.worker_effective_major,'APPROVED_M');});
test('historical application identity remains unchanged',()=>{const r=join([base],snapshot)[0];assert.equal(r.full_name,'OLD_N');assert.equal(r.major,'OLD_M');});
test('unlinked application preserved byte-for-byte, even if worker snapshot includes matching app',()=>{const row={id:'a1',worker_id:null,full_name:'OLD'};const r=join([row],snapshot);assert.equal(r[0],row);});
test('no linked worker requires no work snapshot',()=>{assert.equal(needsManagerWorkerIdentitySnapshot([{id:'a',worker_id:null}]),false);assert.equal(join([{id:'a',worker_id:null}],undefined).length,1);});
test('backend already returned both current fields: no extra snapshot required',()=>{const c={...base,worker_effective_full_name:'CURRENT',worker_effective_major:'CURRENT_M'};assert.equal(needsManagerWorkerIdentitySnapshot([c]),false);assert.equal(join([c],null)[0],c);});
test('worker ID not in manager snapshot => STOP',()=>assert.throws(()=>join([base],{workers:[]}),/JOIN_MISMATCH/));
test('same worker id but wrong application id => STOP',()=>assert.throws(()=>join([base],{workers:[{...worker,application_id:'other'}]}),/JOIN_MISMATCH/));
test('duplicate worker IDs => STOP',()=>assert.throws(()=>join([base],{workers:[worker,worker]}),/DUPLICATE/));
test('missing workers array => STOP',()=>assert.throws(()=>join([base],{}),/SNAPSHOT_INVALID/));
test('missing current worker name => STOP',()=>assert.throws(()=>join([base],{workers:[{...worker,name:''}]}),/NAME_MISSING/));
test('missing current worker major and historical major => STOP',()=>assert.throws(()=>join([{...base,major:null}],{workers:[{...worker,major:null}]}),/MAJOR_MISSING/));
test('future candidate backend and manager snapshot differ => STOP',()=>assert.throws(()=>join([{...base,worker_effective_full_name:'CURRENT'}],snapshot),/CONFLICTING/));
test('equal partial backend and manager snapshot => PASS',()=>{const r=join([{...base,worker_effective_full_name:'APPROVED_N'}],snapshot);assert.equal(r[0].worker_effective_major,'APPROVED_M');});
test('blank candidate list is valid without snapshot',()=>assert.deepEqual(join([],null),[]));
test('malformed candidate list => STOP',()=>assert.throws(()=>join({},snapshot),/LIST_INVALID/));
test('malformed worker id => STOP',()=>assert.throws(()=>join([{...base,worker_id:123}],snapshot),/WORKER_ID_INVALID/));
test('leading and trailing whitespace normalized only in displayed approved fields',()=>{const r=join([base],{workers:[{...worker,name:'  APPROVED_N  ',major:' APPROVED_M  '}]})[0];assert.equal(r.worker_effective_full_name,'APPROVED_N');assert.equal(r.worker_effective_major,'APPROVED_M');});
test('response excludes unrelated sensitive manager data',()=>{const r=join([base],snapshot);assert.ok(!JSON.stringify(r).includes('SECRET_TASK'));assert.ok(!JSON.stringify(r).includes('SECRET_NOTE'));});
test('feature default OFF: never fetch manager aggregate',async()=>{
  let calls=0;const got=await fetchJoined({fetchCandidates:async()=>[base],fetchManagerSnapshot:async()=>{calls++;return snapshot}});
  assert.equal(calls,0);assert.equal(got[0],base);
});
test('feature ON with legacy fields: fetch manager once and project',async()=>{
  let calls=0;const got=await fetchJoined({enableFallback:true,fetchCandidates:async()=>[base],fetchManagerSnapshot:async()=>{calls++;return snapshot}});
  assert.equal(calls,1);assert.equal(got[0].worker_effective_full_name,'APPROVED_N');
});
test('feature ON with unlinked application: no extra fetch',async()=>{
  let calls=0;await fetchJoined({enableFallback:true,fetchCandidates:async()=>[{id:'a',worker_id:null}],fetchManagerSnapshot:async()=>{calls++;return snapshot}});
  assert.equal(calls,0);
});
test('feature ON with backend effective fields: no extra fetch',async()=>{
  let calls=0;await fetchJoined({enableFallback:true,fetchCandidates:async()=>[{...base,worker_effective_full_name:'A',worker_effective_major:'B'}],fetchManagerSnapshot:async()=>{calls++;return snapshot}});
  assert.equal(calls,0);
});
test('manager snapshot access denial fails closed',async()=>{
  await assert.rejects(fetchJoined({enableFallback:true,fetchCandidates:async()=>[base],fetchManagerSnapshot:async()=>{throw new Error('manager_denied')}}),/manager_denied/);
});
test('candidate RPC denial fails closed and skips manager read',async()=>{
  let calls=0;await assert.rejects(fetchJoined({enableFallback:true,fetchCandidates:async()=>{throw new Error('candidate_denied')},fetchManagerSnapshot:async()=>{calls++;return snapshot}}),/candidate_denied/);
  assert.equal(calls,0);
});
test('malformed candidate RPC response fails closed',async()=>{
  await assert.rejects(fetchJoined({enableFallback:true,fetchCandidates:async()=>({error:'bad'}),fetchManagerSnapshot:async()=>snapshot}),/LIST_INVALID/);
});
