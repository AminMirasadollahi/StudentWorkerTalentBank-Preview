import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {workerAgreementApprovalCandidate as policy} from '../src/lib/workerAgreementApprovalCandidate.mjs'

const read=relative=>readFileSync(new URL(relative,import.meta.url),'utf8')
const norm=value=>String(value).replace(/\*\*/g,'').replace(/<\/?strong>/g,'')
 .replace(/[\u200c\u200f\u200e]/g,'').replace(/\s+/g,' ').normalize('NFKC').trim()

test('SWTB15 student-reading copy is exactly draft RC6, not enforceable v1.0',()=>{
 assert.equal(policy.version,'1.0-rc6')
 assert.equal(policy.status,'draft')
 assert.equal(policy.sections.length,7)
 assert.equal(new Set(policy.sections.map(x=>x.id)).size,7)
 assert.equal(policy.sections.reduce((n,s)=>n+s.paragraphs.length,0),24)
 assert.equal(policy.timeline,undefined)
 assert.match(policy.notice,/تصویب|منتشر/)
 assert.match(policy.studyNote,/۴ تا ۵ دقیقه/)
 const all=policy.sections.flatMap(s=>s.paragraphs).join(' ')
 assert.doesNotMatch(all,/روز سوم تقویمی|تعلیق ۱۴روزه|روزهای ۰، ۳، ۷/)
})

test('SWTB15 math example must NOT decrease recorded approved hours',()=>{
 const q=policy.quotaExample
 assert.deepEqual([q.individualApproved,q.totalApproved,q.quota,q.proportionalPercent,q.payAllocation],
  [50,500,400,10,40])
 assert.equal(q.individualApproved/q.totalApproved*100,q.proportionalPercent)
 assert.equal(q.quota*q.proportionalPercent/100,q.payAllocation)
 assert.match(q.note,/۵۰ ساعت کار واقعی همچنان در سوابق شما باقی می‌ماند/)
})

test('SWTB15 current seven-card offline review mirrors every student-facing RC6 paragraph',()=>{
 const html=read('../design/previews/SWTB14_RC6_Worker_Charter_Proportion_REVIEW_ONLY.html')
 assert.match(html,/<html lang="fa" dir="rtl">/)
 for(const section of policy.sections){
  const block=html.match(new RegExp('<article class="card" data-section="'+section.id+'">([\\s\\S]*?)<\\/article>'))
  assert.ok(block,'missing HTML card '+section.id)
  const normalized=norm(block[1])
  for(const para of section.paragraphs)
   assert.ok(normalized.includes(norm(para)),'RC6 paragraph drift in '+section.id)
 }
 assert.equal((html.match(/class="card" data-section=/g)||[]).length,7)
 assert.match(html,/type="checkbox" disabled/)
 assert.doesNotMatch(html,/fetch\(|XMLHttpRequest|supabase|\.rpc\(|<script\s+src=|<link\s+href=/i)
})

test('SWTB15 worker UI shows a reading-only link and cannot gate login, task/report writes',()=>{
 const app=read('../src/OperationsWorkspace.jsx')
 const baseCss=read('../src/operations-workspace.css')
 assert.match(app,/VITE_SWTB15_READONLY_CHARTER_UI!=='false'/)
 assert.match(app,/const WorkerAgreementModalPreview = lazy/)
 assert.match(app,/aria-label="مطالعه چارچوب همکاری دانشجوکاران"/)
 assert.match(app,/workerCharterInfoEnabled&&charterInfoOpen&&<Suspense/)
 assert.match(app,/useEffect\(\(\)=>setCharterInfoOpen\(false\),\[profile.worker_id\]\)/)
 assert.match(app,/charterInfoTriggerRef.current\?\.focus/)
 assert.match(baseCss,/\.ow-b3-sidebar__footer \.swtb-policy-sidebar-actions\{/)
 assert.doesNotMatch(app,/ops_accept_worker_agreement|ops_require_current_worker_agreement/)
})

test('SWTB15 native dialog and charter are non-submitting, safe to close/reopen',()=>{
 const modal=read('../src/components/WorkerAgreementModalPreview.jsx')
 const card=read('../src/components/WorkerAgreementReview.jsx')
 const modalCss=read('../src/components/worker-agreement-modal.css')
 assert.match(modal,/<dialog ref=\{dialogRef\}/)
 assert.match(modal,/showModal/)
 assert.match(modal,/onKeyDown=\{trapModalTab\}/)
 assert.match(modal,/role="region" tabIndex=\{0\}/)
 assert.match(modal,/WorkerAgreementReview policy=\{workerAgreementApprovalCandidate\} embedded/)
 assert.match(modal,/if\(dialogRef.current\?\.open\)return/)
 assert.doesNotMatch(card,/type="checkbox"|تأیید و شروع همکاری/)
 assert.match(card,/مطالعه این متن در سامانه به‌عنوان تأیید یا پذیرش ثبت نمی‌شود/)
 assert.match(card,/استفاده از پنل را محدود نمی‌کند/)
 assert.match(card,/role="img"/)
 assert.match(modalCss,/overscroll-behavior:contain/)
 assert.doesNotMatch(modal+card,/supabase|OpsClient|\.rpc\(|fetch\(|localStorage|sessionStorage|onAccept\s*=/)
})

test('SWTB15 preview route does not import the live authenticated application',()=>{
 const isolated=read('../src/charterPreviewEntry.jsx')
 const page=read('../charter-preview.html')
 assert.match(page,/src="\.\/src\/charterPreviewEntry\.jsx"/)
 assert.match(isolated,/WorkerAgreementModalPreview/)
 assert.match(isolated,/import '\.\/typography\.css'/)
 assert.doesNotMatch(isolated,/import.*OpsApp|import.*OpsClient|supabase|signInWith|\.rpc\(/)
})
