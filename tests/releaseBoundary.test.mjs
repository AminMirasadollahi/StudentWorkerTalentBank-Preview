import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'

const read=path=>readFileSync(path)
function gitBlobSha(path){
  const b=read(path)
  return createHash('sha1').update(`blob ${b.length}\0`).update(b).digest('hex')
}

// Locked public baseline: all changes to applicant intake require a focused,
// separately reviewed change and an exact pinned Git blob hash. SWTB17 P0
// deliberately updated App + a standalone digits helper, with independent
// regression tests. The intake and QA pins remain unchanged. SWTB22 PR103
// explicitly authorized the scoped operations client, target guard and manual
// publication workflow; PR104 restores the released manager flag contract.
// Pin only those reviewed deltas; all other protected hashes stay unchanged.
const critical=Object.freeze({
  'src/App.jsx':'6b63bdda19f60bd06c48ef9e22374b077aa9f6df',
  'src/lib/digits.mjs':'350abb3c22a6ea8116e71b5822e13c202f9246b7',
  'src/report.css':'88330e1f6469d1763430353a23863f2dd61cf8bb',
  'src/lib/operations.js':'353572294468eae93b9b88703101c33066377eaf',
  'src/components/WorkerLifecycleReadOnlyPreview.jsx':'c9125b5627bb509248a300cc023b83b779092946',
  'vite.config.js':'2553885f37533661066f19abfceb0fa5e81ab132',
  '.github/workflows/pages.yml':'04364074d6b4f80fb450da9d717c1cdcbbd3df2e',
})
test('reviewed intake and SWTB22 authorized API/auth/QA/deploy baselines are byte-identical',()=>{
  for(const [path,sha] of Object.entries(critical))
    assert.equal(gitBlobSha(path),sha,`BLOCK RELEASE: modified protected public asset ${path}`)
})
test('manager lifecycle is explicitly authorized by existing audited RPCs, not raw client writes',()=>{
  const workspace=read('src/OperationsWorkspace.jsx').toString()
  assert.match(workspace,/import WorkerLifecycleManager from ['"]\.\/components\/WorkerLifecycleManager['"]/)
  assert.match(workspace,/<WorkerLifecycleManager key=\{selected.id\}/)
  assert.match(workspace,/onChangeState=\{setWorkerState\} onReadHistory=\{getWorkerStateHistory\}/)
  assert.doesNotMatch(workspace,/WorkerLifecycleControls|VITE_WORKER_LIFECYCLE_ADMIN_ENABLED/)
  const client=read('src/lib/operationsV2.js').toString()
  assert.match(client,/rpc\('ops_set_worker_state',\{/)
  assert.match(client,/p_expected_state:expectedState/)
  assert.match(client,/p_reason:reason/)
  assert.match(client,/rpc\('ops_get_worker_state_history',\{/)
  const manager=read('src/components/WorkerLifecycleManager.jsx').toString()
  assert.match(manager,/isWorkerStateReasonValid\(reason\)/)
  assert.match(manager,/expectedState:original,newState:next,reason:auditReason/)
  assert.match(manager,/lock\.current/)
  assert.match(manager,/refreshRequired/)
  assert.match(manager,/تأیید نهایی و ثبت وضعیت/)
  assert.doesNotMatch(manager,/\.from\(['"]student_workers['"]\)|service_role|createClient\(/)
  // Preserve historical QA-only placeholder with no accidental exposed actions.
  const placeholder=read('src/components/WorkerLifecycleReadOnlyPreview.jsx').toString()
  assert.match(placeholder,/disabled>\{workerTransitionAction\(next\)\}/)
  assert.doesNotMatch(placeholder,/onClick=|onSubmit=|\.rpc\(/)
})
test('management-only release has no modifications to public operational API and no synthetic QA entry in normal app',()=>{
  const entry=read('index.html').toString()
  const app=read('src/App.jsx').toString()
  const workspace=read('src/OperationsWorkspace.jsx').toString()
  assert.doesNotMatch(entry,/operations-qa|lifecycle-qa|\/src\/qa\//i)
  assert.doesNotMatch(app,/operations-qa|lifecycle-qa|\/src\/qa\//i)
  assert.doesNotMatch(workspace,/__operationsQaData|QA_OFFLINE_NO_MUTATIONS|createClient\s*\(/)
  assert.match(read('vite.config.js').toString(),/\/StudentWorkerTalentBank-Preview\//)
})
