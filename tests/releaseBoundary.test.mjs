import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'

const read=path=>readFileSync(path)
function gitBlobSha(path){
  const b=read(path)
  return createHash('sha1').update(`blob ${b.length}\0`).update(b).digest('hex')
}

// Locked public baseline: fail if any release-review edit touches real intake,
// Ops Auth/API, the disabled lifecycle placeholder, or the deployment workflow.
const critical=Object.freeze({
  'src/App.jsx':'c3c34f11e7a992015b1ea281828a39386ffce3e9',
  'src/report.css':'88330e1f6469d1763430353a23863f2dd61cf8bb',
  'src/lib/operations.js':'d192d0b5a4dcaee820ddffb6b822625018c35990',
  'src/components/WorkerLifecycleReadOnlyPreview.jsx':'c9125b5627bb509248a300cc023b83b779092946',
  'vite.config.js':'971c9b048f726bc27199078d41b5a45a263a8595',
  '.github/workflows/pages.yml':'88452575162ef82aea7351c5b915b8c60d8936b8',
})
test('production applicant intake, API/auth, disabled lifecycle and deploy pipeline are byte-identical',()=>{
  for(const [path,sha] of Object.entries(critical))
    assert.equal(gitBlobSha(path),sha,`BLOCK RELEASE: modified protected public asset ${path}`)
})
test('public operations imports read-only lifecycle preview; no mutating component/flag',()=>{
  const workspace=read('src/OperationsWorkspace.jsx').toString()
  assert.match(workspace,/import WorkerLifecycleReadOnlyPreview from ['"]\.\/components\/WorkerLifecycleReadOnlyPreview['"]/)
  assert.match(workspace,/<WorkerLifecycleReadOnlyPreview worker=\{selectedHistoryWorker\}\s*\/>/)
  for(const fragment of ['WorkerLifecycleControls','VITE_WORKER_LIFECYCLE_ADMIN_ENABLED',
    'setWorkerState','getWorkerStateHistory','ops_set_worker_state',
    'lifecycleEnabled','import.meta.glob'])
    assert.equal(workspace.includes(fragment),false,`BLOCK RELEASE: ${fragment} in public workspace`)
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
