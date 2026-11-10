import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {workerAgreementApprovalCandidate as candidate} from '../src/lib/workerAgreementApprovalCandidate.mjs'
const load=path=>readFileSync(new URL(path,import.meta.url),'utf8')

test('SWTB16 RC7 editorial polish preserves draft, sections, quota and no receipt',()=>{
 const review=load('../src/components/WorkerAgreementReview.jsx')
 const modal=load('../src/components/WorkerAgreementModalPreview.jsx')
 const application=load('../src/OperationsWorkspace.jsx')
 assert.equal(candidate.status,'draft')
 assert.equal(candidate.version,'1.0-rc7')
 assert.equal(candidate.intro.split(/\n\s*\n/).length,3)
 assert.equal(candidate.sections.length,7)
 assert.equal(candidate.sections.reduce((a,s)=>a+s.paragraphs.length,0),24)
 assert.deepEqual(candidate.quotaExample, {
  quota:400,totalApproved:500,individualApproved:50,
  proportionalPercent:10,payAllocation:40,
  preamble:candidate.quotaExample.preamble,note:candidate.quotaExample.note,
 })
 assert.match(review,/data-policy-status="draft"/)
 assert.match(review,/const compactSeven=isCurrentReading/)
 assert.match(modal,/نسخه ۱.۰ برای مطالعه/)
 assert.match(review,/ثبت موافقت معتبر/)
 assert.match(review,/مطالعه این متن در سامانه به‌عنوان تأیید یا پذیرش ثبت نمی‌شود/)
 assert.doesNotMatch(review+modal,/ops_accept_my_worker_agreement|acceptMyWorkerAgreement|localStorage|sessionStorage/)
 assert.doesNotMatch(application,/ops_accept_my_worker_agreement|ops_require_current_worker_agreement/)
})

test('SWTB15 natural-height cards are independently stacked with RTL pair-order',()=>{
 const review=load('../src/components/WorkerAgreementReview.jsx')
 const css=load('../src/components/worker-agreement-review.css')
 assert.match(review,/swtb-policy-seven-layout/)
 assert.match(review,/swtb-policy-masonry/)
 assert.match(review,/swtb-policy-stack/)
 assert.match(review,/policy.sections.slice\(0,6\).filter\(\(_,index\)=>index%2===column\)/)
 assert.match(review,/renderCard\(item,column\+2\*index\)/)
 assert.match(review,/renderCard\(policy.sections\[6\],6\)/)
 assert.match(review,/style=\{\{order:index\}\}/)
 assert.match(css,/\.swtb-policy-masonry\s*\{\s*display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/)
 assert.match(css,/\.swtb-policy-stack\{\s*display:flex;flex-direction:column/)
 assert.match(css,/\.swtb-policy-stack\{display:contents\}/)
 assert.match(css,/\.swtb-policy-finance-list/)
})

test('SWTB15 matching sidebar buttons and vector icons do not break guide action',()=>{
 const app=load('../src/OperationsWorkspace.jsx')
 const css=load('../src/operations-workspace.css')
 const start=app.indexOf('className="swtb-policy-sidebar-actions"')
 assert.ok(start>0)
 const actions=app.slice(start,start+2400)
 assert.equal((actions.match(/className="swtb-policy-sidebar-action"/g)||[]).length,1)
 assert.match(actions,/swtb-guide-launch swtb-policy-sidebar-action/)
 assert.match(actions,/aria-label="راهنمای سامانه"/)
 assert.match(actions,/aria-label="مطالعه چارچوب همکاری دانشجوکاران"/)
 assert.match(actions,/openWorkerGuide\('all'\)/)
 assert.match(actions,/setCharterInfoOpen\(true\)/)
 assert.equal((actions.match(/className="swtb-policy-action-icon"/g)||[]).length,2)
 assert.match(css,/\.swtb-policy-sidebar-actions\s*\{\s*display:grid/)
 assert.match(css,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/)
 assert.match(css,/\.swtb-policy-action-icon\{/)
})
