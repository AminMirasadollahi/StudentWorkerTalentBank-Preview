import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {workerAgreementDraft,workerTimeConcepts} from '../src/lib/workerAgreementDraft.mjs'

const read=path=>readFileSync(new URL(path,import.meta.url),'utf8')

test('SWTB worker agreement is an explicit non-enforceable v0.3 snapshot',()=>{
 assert.equal(workerAgreementDraft.version,'0.3')
 assert.equal(workerAgreementDraft.status,'draft')
 assert.equal(workerAgreementDraft.sections.length,7)
 assert.equal(new Set(workerAgreementDraft.sections.map(s=>s.id)).size,7)
 assert.equal(new Set(workerAgreementDraft.sections.map(s=>s.icon)).size,7)
 for(const section of workerAgreementDraft.sections){
  assert.ok(section.title.length>3)
  assert.ok(section.body.length>50&&section.body.length<600)
 }
 assert.match(workerAgreementDraft.intro,/یادگیری/)
 assert.match(workerAgreementDraft.sections.find(s=>s.id==='learning').body,/تمرین واقعی/)
 assert.match(workerAgreementDraft.sections.find(s=>s.id==='choice').body,/می‌توانید کار نامناسب را نپذیرید/)
 assert.match(workerAgreementDraft.sections.find(s=>s.id==='library-routine').body,/حداکثر دو دانشجوکار/)
 assert.match(workerAgreementDraft.sections.find(s=>s.id==='library-routine').body,/حضور صرف، کارکرد محسوب نمی‌شود/)
 assert.match(workerAgreementDraft.sections.find(s=>s.id==='finance').body,/پرداخت نهایی تابع/)
})

test('three important concepts remain independent, unambiguous and in the agreed order',()=>{
 assert.deepEqual(workerTimeConcepts.map(x=>x.id),['availability','reported','approved'])
 assert.match(workerTimeConcepts[0].detail,/نه ساعت کارکرد/)
 assert.match(workerTimeConcepts[1].detail,/واقعاً انجام/)
 assert.match(workerTimeConcepts[2].detail,/تأیید/)
 const terms=workerAgreementDraft.sections.find(s=>s.id==='presence').body
 assert.match(terms,/برنامه حضور به معنی کارکرد نیست/)
 assert.match(terms,/ساعت‌ها پس از بررسی و تأیید/)
})

test('policy UI is honest about preview-only acknowledgement and is keyboard readable',()=>{
 const jsx=read('../src/components/WorkerAgreementReview.jsx')
 const css=read('../src/components/worker-agreement-review.css')
 assert.match(jsx,/data-policy-status="draft"/)
 assert.match(jsx,/policy.sections.map/)
 assert.match(jsx,/workerTimeConcepts.map/)
 assert.match(jsx,/<ol className="swtb-policy-sections"/)
 assert.match(jsx,/aria-labelledby="swtb-policy-title"/)
 assert.match(jsx,/type="checkbox" disabled/)
 assert.match(jsx,/type="button" className="report-btn report-btn--primary" disabled/)
 assert.match(jsx,/هیچ موافقتی ثبت نمی‌شود/)
 assert.doesNotMatch(jsx,/\.rpc\(|opsClient|localStorage|sessionStorage|onAccept\s*=|fetch\(/)
 assert.match(css,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/)
 assert.match(css,/@media\(max-width:1040px\)/)
})

test('public deployment never enables policy gating without an explicit build flag',()=>{
 const app=read('../src/OperationsWorkspace.jsx')
 assert.match(app,/VITE_SWTB_WORKER_AGREEMENT_REVIEW==='true'/)
 assert.match(app,/agreementReviewUIEnabled\?\['agreementReview'\]:\[\]/)
 assert.match(app,/agreementReviewUIEnabled&&section==='agreementReview'/)
 assert.match(app,/lazy\(\(\)=>import\('\.\/components\/WorkerAgreementReview\.jsx'\)\)/)
 assert.doesNotMatch(app,/ops_accept_worker_policy|ops_require_current_worker_policy/)
})
