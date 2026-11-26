import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync,readdirSync} from 'node:fs'
import {createHash} from 'node:crypto'
const read=p=>readFileSync(p,'utf8')
function blob(p){const b=readFileSync(p);return createHash('sha1').update('blob '+b.length+'\0').update(b).digest('hex')}
test('legacy account controls exactly match previously released production source',()=>{
 assert.equal(blob('src/components/WorkerSecureLinkReissue.jsx'),'4ff5a9602a1a63a5af722bc3f2cf2891881a75e9')
 assert.equal(blob('src/lib/workerOnboardingRecovery.mjs'),'f9f59a76477377db615f41dec51a3922c82aa3af')
 const app=read('src/OpsApp.jsx')
 assert.match(app,/'ops-complete-worker-onboarding',\s*\{ body: \{ password \} \}/)
 assert.match(app,/'ops-issue-worker-link',\s*\{\s*body: \{ worker_id: workerId \}/)
 assert.match(app,/opsClient\.auth\.updateUser\(\{ password \}\)/)
 assert.match(app,/onReissue=\{onReissue\}/)
})
test('no S01 support, proof mode or reservation cancellation in runtime source',()=>{
 for(const ent of readdirSync('src',{recursive:true,withFileTypes:true})){
  if(!ent.isFile()||!/\.(jsx?|mjs|tsx?)$/.test(ent.name))continue
  const s=read((ent.parentPath??ent.path)+'/'+ent.name)
  assert.doesNotMatch(s,/ops_s01_|confirm_existing_password|worker_onboarding_attempts/,ent.name)
 }
})
test('strict V3 protected release remains explicit with legacy Auth scope',()=>{
 const w=read('.github/workflows/pages.yml')
 assert.match(w,/R2\/R3 policy and atomic assignment backend gates \(legacy Auth unchanged\)/)
 assert.match(w,/VITE_SWTB23_WORKER_POLICY_RELEASE: 'true'/)
 assert.match(w,/c\.mode!=="release"\|\|c\.version!==3/)
})
