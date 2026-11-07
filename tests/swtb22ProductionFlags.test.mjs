import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'

// Reversible, nonsecret production presentation release.
// The protected GitHub Pages workflow remains pinned byte-for-byte by
// releaseBoundary.test.mjs and is intentionally not edited.
test('SWTB22 production Vite file enables exactly the seven reviewed manager UI features plus guarded email invite',()=>{
 const raw=readFileSync(new URL('../.env.production',import.meta.url),'utf8')
 const rows=raw.split(/\r?\n/).map(x=>x.trim()).filter(x=>x&&!x.startsWith('#'))
 const values=Object.fromEntries(rows.map(row=>{
  const match=/^([A-Z][A-Z0-9_]*)=(.*)$/.exec(row)
  assert.ok(match,'only explicit KEY=VALUE declarations are permitted')
  return [match[1],match[2]]
 }))
 assert.deepEqual(values,{
  VITE_SWTB22_MANAGER_SHELL_UI:'true',
  VITE_SWTB22_WORK_POOL_FOCUS_UI:'true',
  VITE_SWTB22_TASKS_FOCUS_UI:'true',
  VITE_SWTB22_PRESENCE_FOCUS_UI:'true',
  VITE_SWTB22_REVIEW_FOCUS_UI:'true',
  VITE_SWTB22_HISTORY_FOCUS_UI:'true',
  VITE_SWTB22_TERM_FOCUS_UI:'true',
  // Staff-only presentation control added by SWTB12/PR #58; independent
  // Supabase Edge OPS_EMAIL_INVITES_ENABLED secret remains mandatory.
  VITE_OPS_EMAIL_INVITES_AVAILABLE:'true',
 })
 assert.equal(rows.length,8,'no other variables or credentials may be included')
})
test('all source feature switches remain explicitly overridable to false',()=>{
 const app=readFileSync(new URL('../src/OpsApp.jsx',import.meta.url),'utf8')
 const pool=readFileSync(new URL('../src/components/WorkPoolManagerPanel.jsx',import.meta.url),'utf8')
 const tasks=readFileSync(new URL('../src/OperationsWorkspace.jsx',import.meta.url),'utf8')
 assert.match(app,/VITE_SWTB22_MANAGER_SHELL_UI\s*===\s*'true'/)
 assert.match(pool,/VITE_SWTB22_WORK_POOL_FOCUS_UI\s*===\s*'true'/)
 assert.match(tasks,/VITE_SWTB22_TASKS_FOCUS_UI\s*===\s*'true'/)
 assert.match(tasks,/VITE_SWTB22_PRESENCE_FOCUS_UI\s*===\s*'true'/)
 assert.match(tasks,/VITE_SWTB22_REVIEW_FOCUS_UI\s*===\s*'true'/)
 assert.match(tasks,/VITE_SWTB22_HISTORY_FOCUS_UI\s*===\s*'true'/)
 assert.match(tasks,/VITE_SWTB22_TERM_FOCUS_UI\s*===\s*'true'/)
 assert.match(app,/VITE_OPS_EMAIL_INVITES_AVAILABLE\s*===\s*'true'/)
})
