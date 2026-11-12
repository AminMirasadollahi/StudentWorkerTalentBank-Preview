// SWTB17 #48 identity consistency. Synthetic manager-authorized RPC rows ONLY.
// No Supabase / auth session / real person / production data.
import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {
 candidateDisplayName,candidateDisplayMajor,selectManagerCandidates
} from '../src/lib/managerCandidateView.mjs'

const historical={
 id:'SYNTHETIC_APP_1',
 full_name:'نام زمان ثبت‌نام ساختگی',
 major:'رشته زمان ثبت‌نام ساختگی',
 phone:'09000000000',
 worker_id:'SYNTHETIC_WORKER_1',
 worker_state:'active',
 worker_effective_full_name:'نام تأییدشده ساختگی',
 worker_effective_major:'رشته تأییدشده ساختگی',
}
test('linked worker uses only approved effective identity fields when available',()=>{
 assert.equal(candidateDisplayName(historical),'نام تأییدشده ساختگی')
 assert.equal(candidateDisplayMajor(historical),'رشته تأییدشده ساختگی')
 assert.equal(candidateDisplayName({...historical,worker_effective_full_name:'  نام تازه  '}),'نام تازه')
})
test('old RPC, missing, empty or malformed optional fields fail safely to historic intake',()=>{
 for(const v of [null,undefined,'', '  ',{},false]){
  const row={...historical,worker_effective_full_name:v,worker_effective_major:v}
  assert.equal(candidateDisplayName(row),historical.full_name)
  assert.equal(candidateDisplayMajor(row),historical.major)
 }
 const {worker_effective_full_name,worker_effective_major,...legacy}=historical
 assert.equal(candidateDisplayName(legacy),historical.full_name)
 assert.equal(candidateDisplayMajor(legacy),historical.major)
})
test('no linked worker means no effective override, even with malformed server data',()=>{
 const applicant={...historical,worker_id:null}
 assert.equal(candidateDisplayName(applicant),historical.full_name)
 assert.equal(candidateDisplayMajor(applicant),historical.major)
})
test('manager can search current and historic name/major in already-scoped rows',()=>{
 const rows=[historical,{id:'SYNTHETIC_APP_2',full_name:'نام دیگر',major:'رشته دیگر'}]
 for(const query of ['نام تأییدشده','نام زمان ثبت‌نام','رشته تأییدشده','رشته زمان ثبت‌نام']){
  assert.deepEqual(selectManagerCandidates(rows,'all',query).map(x=>x.id),['SYNTHETIC_APP_1'])
 }
 assert.deepEqual(selectManagerCandidates(rows,'active','نام تأییدشده').map(x=>x.id),['SYNTHETIC_APP_1'])
 assert.deepEqual(selectManagerCandidates(rows,'pending','نام تأییدشده'),[])
 assert.deepEqual(selectManagerCandidates(rows,'all','نام غیرموجود'),[])
})
test('presentation changes do not add account, personal data or direct override reads',()=>{
 const card=readFileSync(new URL('../src/OpsApp.jsx',import.meta.url),'utf8')
 const list=readFileSync(new URL('../src/components/ManagerCandidatesWorkspace.jsx',import.meta.url),'utf8')
 const api=readFileSync(new URL('../src/lib/operations.js',import.meta.url),'utf8')
 assert.match(card,/candidateDisplayName\(candidate\)/)
 assert.match(card,/candidateDisplayMajor\(candidate\)/)
 assert.match(card,/نام هنگام ثبت‌نام/)
 assert.match(list,/candidateDisplayName\(row\)/)
 assert.match(list,/candidateDisplayMajor\(row\)/)
 assert.match(list,/candidateDisplayName\(selected\)/)
 assert.match(api,/rpc\('ops_list_candidates'\)/)
 assert.doesNotMatch(list,/worker_profile_overrides|\.from\(|functions\.invoke|resetPasswordForEmail/)
})
