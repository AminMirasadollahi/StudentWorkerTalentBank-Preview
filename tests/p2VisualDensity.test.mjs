import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'

const ops=readFileSync('src/ops.css','utf8')
const workspace=readFileSync('src/operations-workspace.css','utf8')
const app=readFileSync('src/OpsApp.jsx','utf8')

test('P2: compact header targets authorized dashboards, never shared login or verification curtain',()=>{
 assert.match(ops,/\.ops-root\.report-shell--dashboard \.report-header \{/)
 assert.match(ops,/\.ops-root\.report-shell--dashboard \.report-header h1 \{/)
 assert.match(ops,/\.ops-root\.report-shell--dashboard \.report-header-actions \.report-btn \{/)
 assert.match(ops,/@media \(max-width: 700px\) \{/)
 assert.match(ops,/dialog\.ops-recheck-curtain \{/,
  'security freeze cannot be removed by presentation refactor')
 assert.doesNotMatch(ops,/\.ops-recheck-frozen\s*\{\s*display\s*:\s*block\s*;?/,
  'privileged frozen elements must not be forced visible')
})

test('P2: worker task card no longer fixed to 53rem and reports retain a usable reading measure',()=>{
 assert.match(workspace,/\.ow-workspace \.ow-worker-tasks > \.ow-item \{ width:min\(100%,75rem\); \}/)
 assert.doesNotMatch(workspace,/\.ow-workspace \.ow-worker-tasks > \.ow-item \{ width:min\(100%,53rem\); \}/)
 assert.match(workspace,/\.ow-worker-action-detail form \{\s*max-width:66rem;/)
 assert.match(workspace,/\.ow-worker-action-detail \.report-field textarea \{/)
 assert.match(workspace,/\.ow-worker-action-detail \.report-field textarea:focus-visible \{/)
 assert.match(workspace,/@media \(max-width: 700px\) \{\s*\.ow-worker-workspace \.ow-worker-tasks > \.ow-item \{ width:100%; \}/)
})

test('P2: full student login email remains accessible even if long and visually truncated',()=>{
 assert.match(ops,/\.ops-root\.report-shell--dashboard \.ops-worker-login-email \{/)
 assert.match(ops,/text-overflow: ellipsis;/)
 assert.match(app,/<p className="ops-worker-login-email" title=\{loginEmail\}>/)
 assert.match(app,/<bdi dir="ltr">\{loginEmail\}<\/bdi>/)
})
