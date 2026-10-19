import test from 'node:test'
import assert from 'node:assert/strict'
import {documentTitleForRoute} from '../src/lib/routeTitles.mjs'

test('P0: route titles are distinct for privileged worker, manager, report and public intake',()=>{
 const expected={
  worker:'پنل اختصاصی دانشجوکار | SWTB',
  operations:'مدیریت دانشجوکارها | SWTB',
  report:'گزارش همکاری دانشجویی | SWTB',
  intake:'درخواست همکاری دانشجویی | SWTB',
 }
 for(const [route,title] of Object.entries(expected))
  assert.equal(documentTitleForRoute(route),title)
 assert.equal(new Set(Object.values(expected)).size,4)
 assert.equal(documentTitleForRoute(null),expected.intake)
})
