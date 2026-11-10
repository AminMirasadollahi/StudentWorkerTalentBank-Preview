import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {parseWorkerAgreementStatus,acceptanceCoordinates,
 verifyWorkerAcceptanceReceipt,isSameAgreement}
 from '../src/lib/workerAgreementAcceptanceContract.mjs'

const uuid='00000000-0000-4000-8000-000000000001'
const receiptId='00000000-0000-4000-8000-000000000002'
const hash='a'.repeat(64)
const document=()=>({
 status:'approved',version:'1.0.0',title:'چارچوب همکاری تصویب‌شده آزمایشی',
 intro:'فقط محتوای ساختگی؛ هیچ ابلاغ حقیقی وجود ندارد.',
 acceptance:'من همین نسخه مصوب آزمایشی را خواندم و می‌پذیرم.',
 institution:'واحد آزمایشی',readingEstimate:'۴ دقیقه',
 approval:{reference:'SYNTHETIC-ONLY-01',authority:'مرجع ساختگی آزمایش',
  approved_on:'2026-11-10T07:00:00Z'},
 sections:['learning','choice','presence','library-routine','continuity','privacy','finance']
  .map((id,i)=>({id,title:'اصل آزمایشی '+(i+1),
   paragraphs:['متن غیرواقعی آزمایش بند '+(i+1)]})),
 quotaExample:{quota:400,totalApproved:500,individualApproved:50,
  proportionalPercent:10,payAllocation:40,
  preamble:'یک محاسبه ساختگی و صرفاً توضیحی.',
  note:'۵۰ ساعت واقعی باقی می‌ماند؛ ۴۰ ساعت فقط سهم محاسبه‌ای است.'},
 showTimeConcepts:false,
 notice:'این سند فقط در آزمون ساختگی، مصوب فرض شده است.',
})
const payload=()=>({
 status:'published',version_id:uuid,version_label:'1.0.0',digest:hash,
 document:document(),required:true,accepted:false,accepted_at:null,
 published_at:'2026-11-10T08:00:00Z',change_summary:'تغییر نسخه آزمایشی',
})
const rejects=(obj,pattern)=>assert.throws(()=>parseWorkerAgreementStatus(obj),pattern)

test('No installed/published version means no requested acknowledgement',()=>{
 assert.deepEqual(parseWorkerAgreementStatus({
  status:'unpublished',required:false,accepted:false
 }),{kind:'unpublished',required:false,accepted:false})
 rejects({status:'unpublished',required:true,accepted:false},/unpublished_contradiction/)
})

test('Official version comes exclusively from the server and preserves its digest',()=>{
 const actual=parseWorkerAgreementStatus(payload())
 assert.equal(actual.kind,'published')
 assert.equal(actual.versionId,uuid)
 assert.equal(actual.digest,hash)
 assert.equal(actual.document.sections.length,7)
 assert.equal(actual.document.quotaExample.individualApproved,50)
 assert.equal(actual.required,true)
 assert.equal(actual.accepted,false)
 assert.deepEqual(acceptanceCoordinates(actual),{versionId:uuid,digest:hash})
 assert.equal(Object.isFrozen(acceptanceCoordinates(actual)),true)
})

test('Draft RC6 cannot be signed even if a buggy API labels the row published',()=>{
 const p=payload();p.document.status='draft'
 rejects(p,/not_approved_matching_version/)
 p.document.status='approved';p.document.version='1.0-rc6'
 rejects(p,/not_approved_matching_version/)
 p.document.version='1.0.0';p.document.notice='این متن هنوز نامزد تصویب است'
 rejects(p,/historical_draft_disclaimer/)
})

test('Incomplete/opaque JSON is rejected instead of partially showing legal content',()=>{
 const p=payload();p.document.sections.pop()
 rejects(p,/seven_sections/)
 p.document=document();p.document.sections[4].secret='پنهان از کاربر'
 rejects(p,/section_fields_4/)
 p.document=document();p.document.unknown_legal_clause='نامرئی'
 rejects(p,/unknown_root_content/)
 p.document=document();p.document.sections[1].paragraphs=['']
 rejects(p,/section_paragraphs/)
})

test('Ratio example cannot misrepresent retained approved work time',()=>{
 const p=payload();p.document.quotaExample.payAllocation=50
 rejects(p,/quota_example_math/)
 p.document=document();p.document.quotaExample.totalApproved=0
 rejects(p,/quota_example_math/)
})

test('Invalid digest, UUID, status, accepted date or roles fail closed',()=>{
 let p=payload();p.digest='g'.repeat(64)
 rejects(p,/identity_or_digest/)
 p=payload();p.version_id='not-a-uuid';rejects(p,/identity_or_digest/)
 p=payload();p.status='weird';rejects(p,/unknown_status/)
 p=payload();p.accepted=true;p.accepted_at=null;rejects(p,/accepted_at/)
 p=payload();p.accepted=false;p.accepted_at='2026-11-10T08:00:00Z'
 rejects(p,/unexpected_accepted_at/)
 p=payload();p.required='yes';rejects(p,/flags/)
})

test('Only authoritative exact-version receipt may be considered successful',()=>{
 const status=parseWorkerAgreementStatus(payload()),coordinates=acceptanceCoordinates(status)
 const confirmed=verifyWorkerAcceptanceReceipt({
  ok:true,version_id:uuid,digest:hash,receipt_id:receiptId,
  accepted_at:'2026-11-10T08:01:00Z',
 },coordinates)
 assert.equal(confirmed.receiptId,receiptId)
 assert.ok(confirmed.acceptedAt)
 assert.throws(()=>verifyWorkerAcceptanceReceipt({
  ok:true,version_id:uuid,digest:'b'.repeat(64),receipt_id:receiptId,
  accepted_at:'2026-11-10T08:01:00Z',
 },coordinates),/receipt_not_authoritative/)
 assert.throws(()=>verifyWorkerAcceptanceReceipt({
  ok:true,version_id:uuid,digest:hash,receipt_id:null,
  accepted_at:'2026-11-10T08:01:00Z',
 },coordinates),/receipt_not_authoritative/)
})

test('A new current version is NOT satisfied by a prior receipt',()=>{
 const a=parseWorkerAgreementStatus(payload())
 const b=payload();b.digest='b'.repeat(64)
 const next=parseWorkerAgreementStatus(b)
 assert.equal(isSameAgreement(a,next),false)
 assert.equal(isSameAgreement(a,a),true)
 assert.throws(()=>acceptanceCoordinates({
  ...a,accepted:true
 }),/cannot_accept_status/)
})

test('Production main stays read-only unless exact explicit build flag is true',()=>{
 const read=p=>readFileSync(new URL(p,import.meta.url),'utf8')
 const app=read('../src/OperationsWorkspace.jsx')
 const api=read('../src/lib/operationsV2.js')
 const ui=read('../src/components/WorkerAgreementOfficialConsent.jsx')
 assert.match(app,/VITE_SWTB15_OFFICIAL_CONSENT_UI==='true'/)
 assert.match(app,/workerAgreementOfficialUIEnabled&&<Suspense/)
 assert.match(app,/WorkerAgreementOfficialConsent key=\{profile.worker_id\}/)
 assert.doesNotMatch(app,/VITE_SWTB15_OFFICIAL_CONSENT_UI!=='false'/)
 assert.match(api,/rpc\('ops_get_my_worker_agreement'\)/)
 assert.match(api,/rpc\('ops_accept_my_worker_agreement'/)
 assert.match(api,/p_version_id:versionId,p_displayed_digest:digest/)
 assert.doesNotMatch(ui,/workerAgreementApprovalCandidate|workerAgreementDraft/)
 assert.match(ui,/verifyWorkerAcceptanceReceipt/)
 assert.match(ui,/parseWorkerAgreementStatus\(await getMyWorkerAgreement\(\)\)/)
 assert.match(ui,/NEVER resubmit automatically/)
 assert.match(ui,/onKeyDown=\{trapModalTab\}/)
 assert.match(ui,/onChange=\{event=>setChecked\(event.target.checked\)\}/)
 assert.match(ui,/checked\|\|status.phase!=='ready'/)
})
