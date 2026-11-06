import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'

// Reversible, nonsecret production presentation release.
// The protected GitHub Pages workflow remains pinned byte-for-byte by
// releaseBoundary.test.mjs and is intentionally not edited.
test('SWTB22 production Vite file enables exactly the two reviewed manager UI features',()=>{
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
 })
 assert.equal(rows.length,2,'no other variables or credentials may be included')
})
test('both source feature switches remain explicitly overridable to false',()=>{
 const app=readFileSync(new URL('../src/OpsApp.jsx',import.meta.url),'utf8')
 const pool=readFileSync(new URL('../src/components/WorkPoolManagerPanel.jsx',import.meta.url),'utf8')
 assert.match(app,/VITE_SWTB22_MANAGER_SHELL_UI\s*===\s*'true'/)
 assert.match(pool,/VITE_SWTB22_WORK_POOL_FOCUS_UI\s*===\s*'true'/)
})
