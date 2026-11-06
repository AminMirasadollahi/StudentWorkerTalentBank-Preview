import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {retireLegacyReportRoute} from '../src/lib/retireLegacyReportRoute.mjs'

function browserFor(href,storageOverrides={}) {
 const redirects=[]
 const erased=[]
 const browser={
  location:{
   href,
   replace(value){redirects.push(value)},
  },
  sessionStorage:{
   removeItem(key){erased.push(key)},
   ...storageOverrides,
  },
 }
 return {browser,redirects,erased}
}

test('retired ?page=report now opens manager login, not old code-report UI',()=>{
 const x=browserFor('https://example.invalid/StudentWorkerTalentBank-Preview/?page=report')
 assert.equal(retireLegacyReportRoute(x.browser),true)
 assert.deepEqual(x.redirects,[
   'https://example.invalid/StudentWorkerTalentBank-Preview/?page=operations',
 ])
 assert.deepEqual(x.erased,['student-worker-report:access:v1'])
})

test('retired route drops old code-like query data and hash before manager redirect',()=>{
 const x=browserFor('https://example.invalid/preview/?page=report&access_code=FAKE_CODE#access_token=FAKE_JWT')
 assert.equal(retireLegacyReportRoute(x.browser),true)
 assert.deepEqual(x.redirects,['https://example.invalid/preview/?page=operations'])
})

test('disabled sessionStorage does not reopen old report pathway',()=>{
 const x=browserFor('https://example.invalid/preview/?page=report',{
   removeItem(){throw new Error('SYNTHETIC_STORAGE_BLOCKED')},
 })
 assert.equal(retireLegacyReportRoute(x.browser),true)
 assert.deepEqual(x.redirects,['https://example.invalid/preview/?page=operations'])
})

test('admin, worker, and public applicant intake routes are unaffected',()=>{
 for(const href of [
  'https://example.invalid/preview/',
  'https://example.invalid/preview/?page=operations',
  'https://example.invalid/preview/?page=worker',
  'https://example.invalid/preview/?page=other',
 ]) {
  const x=browserFor(href)
  assert.equal(retireLegacyReportRoute(x.browser),false)
  assert.deepEqual(x.redirects,[])
  assert.deepEqual(x.erased,[])
 }
})

test('entrypoint cannot render unauthenticated ReportApp but keeps authenticated manager and intake',()=>{
 const src=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8')
 assert.match(src,/retireLegacyReportRoute\(window\)/)
 assert.match(src,/page === 'operations'/)
 assert.match(src,/<OpsApp mode="admin"/)
 assert.match(src,/page === 'worker'/)
 assert.match(src,/<OpsApp mode="worker"/)
 assert.match(src,/<AnalyticsBridge>/)
 assert.match(src,/<App \/>/)
 assert.doesNotMatch(src,/page === 'report'\s*\?\s*\(/)
 assert.doesNotMatch(src,/<ReportApp\s*\/>/)
})
