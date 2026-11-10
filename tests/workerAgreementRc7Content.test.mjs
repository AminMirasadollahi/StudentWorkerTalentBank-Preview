// SWTB16 — review-only content and presentation contract. No network or live workers.
import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {workerAgreementApprovalCandidate as draft} from '../src/lib/workerAgreementApprovalCandidate.mjs'

const read=path=>readFileSync(new URL(path,import.meta.url),'utf8')

test('RC7 remains unpublished, seven-part, with the approved three-paragraph introduction',()=>{
 assert.equal(draft.version,'1.0-rc7')
 assert.equal(draft.status,'draft')
 assert.deepEqual(draft.sections.map(s=>s.id),[
  'learning','choice','presence','library-routine','continuity','privacy','finance'])
 assert.equal(draft.intro.split(/\n\s*\n/).length,3)
 assert.match(draft.intro,/یادگیری در محیط واقعی کار/)
 assert.match(draft.intro,/حق انتخاب/)
 assert.match(draft.intro,/شرایط شخصی و تحصیلی/)
 assert.match(draft.intro,/پیگیری حق‌الزحمه/)
 assert.match(draft.readingEstimate,/۵ تا ۶ دقیقه/)
 assert.equal(draft.showTimeConcepts,false)
 assert.equal(Array.isArray(draft.timeline),false)
})

test('only a knowingly accepted specific task creates a commitment, not weekly availability',()=>{
 const choice=draft.sections.find(s=>s.id==='choice').paragraphs.join(' ')
 const presence=draft.sections.find(s=>s.id==='presence').paragraphs.join(' ')
 assert.match(choice,/آگاهانه پذیرفتید/)
 assert.match(choice,/نپذیرید/)
 assert.match(presence,/قرار نیست همه این ساعت‌ها/)
 assert.match(presence,/۴۸ ساعت/)
 assert.match(presence,/تأیید می‌شوند/)
})

test('flexible hours on the assigned date never claim flexible dates',()=>{
 const clause=draft.sections.find(s=>s.id==='presence').paragraphs[2]
 assert.match(clause,/نوبت‌های زمان‌دار/)
 assert.match(clause,/روز و ساعت مشخص/)
 assert.match(clause,/روز انجام از قبل تعیین می‌شود/)
 assert.match(clause,/ساعت مناسب همان روز/)
 assert.doesNotMatch(clause,/انتخاب آزادانه روز|تاریخ دلخواه/)
})

test('library, private use, dialogue, access and privacy persist without discipline timers',()=>{
 const all=draft.sections.map(s=>s.paragraphs.join(' ')).join(' ')
 assert.match(all,/حداکثر \*\*دو نفر\*\*/)
 assert.match(all,/حضور یا مطالعه شخصی ساعت کارکرد نیست/)
 assert.match(all,/مستقیم با مسئول واحد مربوطه/)
 assert.match(all,/متعهدیم که به حریم شخصی/)
 assert.match(all,/موضوع با اطلاع شما پیگیری می‌شود/)
 assert.doesNotMatch(all,/پایان روز هفتم|روز بیست‌ویکم|اخطار سه‌روزه/)
})

test('finance is illustrative, requires competent approval, and never erases actual hours',()=>{
 const finance=draft.sections.find(s=>s.id==='finance').paragraphs.join(' ')
 const q=draft.quotaExample
 assert.match(finance,/پس از تأیید مراجع ذی‌صلاح/)
 assert.match(finance,/بدون کاهش/)
 assert.deepEqual([q.quota,q.totalApproved,q.individualApproved,q.proportionalPercent,q.payAllocation],[400,500,50,10,40])
 assert.equal(q.quota*q.individualApproved/q.totalApproved,q.payAllocation)
 assert.match(q.note,/۵۰ ساعت کار واقعی همچنان در سوابق شما باقی می‌ماند/)
})

test('read-only modal keeps one title, three paragraphs and no fake acceptance',()=>{
 const modal=read('../src/components/WorkerAgreementModalPreview.jsx')
 const view=read('../src/components/WorkerAgreementReview.jsx')
 const css=read('../src/components/worker-agreement-review.css')
 assert.match(modal,/isReadingEdition=workerAgreementApprovalCandidate.version==='1.0-rc7'/)
 assert.match(modal,/workerAgreementApprovalCandidate.readingEstimate/)
 assert.match(view,/policy\.intro\.split/)
 assert.match(view,/swtb-policy-lead/)
 assert.match(view,/data-policy-status="draft"/)
 assert.match(css,/swtb-policy-intro-paragraph\+\.swtb-policy-intro-paragraph/)
 assert.doesNotMatch(modal,/ops_accept_worker_agreement|localStorage|sessionStorage/)
 assert.doesNotMatch(view,/ops_accept_worker_agreement|ops_publish_worker_agreement/)
})
