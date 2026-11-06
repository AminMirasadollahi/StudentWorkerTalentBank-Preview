import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {
  canonicalWorkerReportPayload,sameWorkerReportPayload,
  isDefinitiveWorkerReportRejection,WORKER_REPORT_CHANGED_RETRY_NOTICE,
} from '../src/lib/workerReportRetry.mjs'

const fake={
 taskId:'SYNTHETIC-TASK',
 date:'2026-11-06',
 minutes:75,
 note:'synthetic report summary',
 extraReasonCode:'unexpected_complexity',
 extraReasonText:'  synthetic extra-time reason  ',
}

test('retry contract: canonical data for ONE original submission is immutable by comparison',()=>{
 const original=canonicalWorkerReportPayload(fake)
 assert.deepEqual(original,{
   ...fake,extraReasonText:'synthetic extra-time reason',
 })
 assert.equal(sameWorkerReportPayload(original,canonicalWorkerReportPayload({...fake})),true)
 assert.equal(sameWorkerReportPayload(null,original),false)
 assert.equal(sameWorkerReportPayload(original,null),false)
 assert.notEqual(original,fake,'pure normalization must not edit the input')
 assert.equal(fake.extraReasonText,'  synthetic extra-time reason  ')
})

test('retry contract: changed date/time/summary/reason/task cannot masquerade as same keyed report',()=>{
 const original=canonicalWorkerReportPayload(fake)
 for(const mutation of [
  {taskId:'ANOTHER-TASK'},{date:'2026-11-05'},{minutes:80},
  {note:'edited after timeout'},{extraReasonCode:'other'},
  {extraReasonText:'modified description of reason'},
 ]){
  const changed=canonicalWorkerReportPayload({...fake,...mutation})
  assert.equal(sameWorkerReportPayload(original,changed),false,
    'mutation '+JSON.stringify(mutation)+' must be different')
 }
})

test('retry contract: accepted canonical equivalents do not accidentally consume a new key',()=>{
 const normal=canonicalWorkerReportPayload({
  taskId:'SYNTHETIC-TASK',date:'2026-11-06',minutes:'75',
  note:'synthetic report summary',extraReasonCode:'unexpected_complexity',
  extraReasonText:'synthetic extra-time reason',
 })
 assert.equal(sameWorkerReportPayload(normal,canonicalWorkerReportPayload(fake)),true)
 assert.deepEqual(canonicalWorkerReportPayload({
  taskId:'x',date:'2026-11-06',minutes:60,note:'',extraReasonCode:null,
  extraReasonText:'  ',
 }),{taskId:'x',date:'2026-11-06',minutes:60,note:'',
  extraReasonCode:null,extraReasonText:null})
})

test('retry contract: SQLSTATE proves explicit database rejection, unknown transport does not',()=>{
 for(const code of ['22023','23514','42501','23505','P0002','XX000'])
  assert.equal(isDefinitiveWorkerReportRejection({code}),true,code)
 for(const error of [null,new Error('Failed to fetch'),{code:''},
   {code:'PGRST116'},{code:'ETIMEDOUT'},{status:503},{code:null}]){
  assert.equal(isDefinitiveWorkerReportRejection(error),false,
    'must retain payload on unknown outcome')
 }
})

test('retry contract: unknown outcomes must never be described as a failed submission',()=>{
 assert.match(WORKER_REPORT_CHANGED_RETRY_NOTICE,/نتیجه ارسال قبلی هنوز قطعی نیست/)
 assert.match(WORKER_REPORT_CHANGED_RETRY_NOTICE,/همان اطلاعات قبلی/)
 assert.match(WORKER_REPORT_CHANGED_RETRY_NOTICE,/سوابق گزارش‌ها/)
 assert.doesNotMatch(WORKER_REPORT_CHANGED_RETRY_NOTICE,/گزارش شما ثبت نشد/)
})

test('actual worker component pins payload and idempotency key BEFORE any RPC call',()=>{
 const src=readFileSync(new URL('../src/OperationsWorkspace.jsx',import.meta.url),'utf8')
 const part=src.slice(src.indexOf('function WorkerTaskCard('),src.indexOf('function WorkerReportHistory('))
 assert.ok(part.includes('canonicalWorkerReportPayload({'))
 assert.ok(part.includes('if(previousPayload&&!sameWorkerReportPayload(previousPayload,nextPayload))'))
 assert.ok(part.includes('setError(WORKER_REPORT_CHANGED_RETRY_NOTICE)'))
 assert.ok(part.includes('submissionPayload:savedPayload'))
 assert.ok(part.includes('()=>submitMyTime({...savedPayload,clientSubmissionId:keyRef.current})'))
 assert.ok(part.indexOf('submissionPayload:savedPayload')<part.indexOf('()=>submitMyTime({...savedPayload'))
 assert.ok(part.includes('const initialAttempt=sameReviewCycle?acknowledged?.submissionPayload:null'))
 assert.ok(part.includes('setDate]=useState(initialAttempt?.date||today())'))
})

test('actual worker component retains uncertain result but clears keys after explicit DB rejection',()=>{
 const src=readFileSync(new URL('../src/OperationsWorkspace.jsx',import.meta.url),'utf8')
 const part=src.slice(src.indexOf('function WorkerTaskCard('),src.indexOf('function WorkerReportHistory('))
 assert.match(part,/if\(kind==='report'&&isDefinitiveWorkerReportRejection\(e\)\)/)
 assert.match(part,/clientSubmissionId:null,submissionPayload:null/)
 assert.match(part,/keyRef\.current=crypto\.randomUUID\(\)/)
 assert.match(part,/priorReviewCycle\.current!==reviewCycle/)
 assert.match(part,/setReportCommitted\(false\)/)
})
