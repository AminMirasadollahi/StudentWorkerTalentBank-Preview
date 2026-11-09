import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {WORKER_GUIDE_VERSION,GUIDE_SECTIONS,SECTION_GUIDES,
 getWorkerGuideSteps,workerGuideStorageKey,workerGuideSessionStorageKey,
 shouldAutoOfferWorkerGuide,suppressWorkerGuideAutoOffers,
 WORKER_GUIDE_SUPPRESSED,WORKER_GUIDE_OFFERED_SESSION,isWorkerGuideSection
} from '../src/lib/workerGuide.mjs'
test('same contextual definitions power whole application and isolated sections',()=>{
 const full=getWorkerGuideSteps('all')
 assert.equal(WORKER_GUIDE_VERSION,1)
 const counts={tasks:3,workPool:2,availability:4,history:3,profile:4}
 assert.equal(full.length,16,'the V4 overlay, optional work pool and profile shortcuts have guide steps')
 assert.deepEqual(full,GUIDE_SECTIONS.flatMap(key=>getWorkerGuideSteps(key)))
 for(const section of GUIDE_SECTIONS){
  assert.equal(SECTION_GUIDES[section].length,counts[section])
  assert.equal(getWorkerGuideSteps(section).length,counts[section])
  assert.ok(getWorkerGuideSteps(section).every(item=>item.section===section))
 }
 assert.ok(full.some(item=>item.anchor==='availability-peers'))
 assert.ok(full.some(item=>item.anchor==='profile-shortcuts'))
 assert.ok(full.some(item=>item.anchor==='work-pool-list'))
 assert.equal(getWorkerGuideSteps('all',{includeWorkPool:false}).length,14)
 assert.ok(!getWorkerGuideSteps('all',{includeWorkPool:false}).some(item=>item.section==='workPool'))
})
test('every step has an explicit unique visible anchor and human instruction',()=>{
 const full=getWorkerGuideSteps()
 const seen=new Set()
 for(const step of full){
  assert.match(step.anchor,/^[a-z][a-zA-Z-]*$/)
  assert.ok(step.title.length>=4)
  assert.ok(step.description.length>=60)
  assert.ok(!seen.has(step.anchor),'each anchor unique: '+step.anchor)
  seen.add(step.anchor)
 }
 assert.ok(full.some(x=>x.description.includes('ساعت')))
 assert.ok(full.some(x=>x.description.includes('تأیید مدیر')))
})
test('invalid scope does not construct a tour or mix worker identities',()=>{
 assert.deepEqual(getWorkerGuideSteps('bogus'),[])
 assert.equal(workerGuideStorageKey(''),null)
 assert.equal(workerGuideStorageKey(null),null)
 assert.notEqual(workerGuideStorageKey('worker-a'),workerGuideStorageKey('worker-b'))
 assert.ok(workerGuideStorageKey('worker-a').includes('v'+WORKER_GUIDE_VERSION))
 assert.equal(isWorkerGuideSection('tasks'),true)
 assert.equal(isWorkerGuideSection('workPool'),true)
 assert.equal(isWorkerGuideSection('admin'),false)
})

test('auto-offer is user-scoped, once per browser tab session and persistently opt-out only',()=>{
 const worker='FAKE-WORKER-GUIDE-A'
 const other='FAKE-WORKER-GUIDE-B'
 assert.ok(workerGuideSessionStorageKey(worker).startsWith(workerGuideStorageKey(worker)))
 assert.notEqual(workerGuideSessionStorageKey(worker),workerGuideSessionStorageKey(other))
 assert.equal(workerGuideSessionStorageKey(''),null)
 assert.equal(shouldAutoOfferWorkerGuide('',null,null),false)
 assert.equal(shouldAutoOfferWorkerGuide(worker,null,null),true)
 assert.equal(shouldAutoOfferWorkerGuide(worker,null,WORKER_GUIDE_OFFERED_SESSION),false)
 assert.equal(shouldAutoOfferWorkerGuide(worker,WORKER_GUIDE_SUPPRESSED,null),false)
 assert.equal(shouldAutoOfferWorkerGuide(worker,'seen',null),false,
  'legacy seen preference remains quiet, without requiring migration')
 assert.equal(shouldAutoOfferWorkerGuide(other,null,null),true,
  'another worker account cannot inherit this account browser-tab marker')
})

test('explicit suppression is verified after storage write and failures are not misreported',()=>{
 const values=new Map()
 const storage={
  setItem:(k,v)=>values.set(k,v),
  getItem:k=>values.get(k),
 }
 assert.equal(suppressWorkerGuideAutoOffers('FAKE-WORKER-GUIDE-A',storage),true)
 assert.equal(values.get(workerGuideStorageKey('FAKE-WORKER-GUIDE-A')),
  WORKER_GUIDE_SUPPRESSED)
 assert.equal(suppressWorkerGuideAutoOffers('',storage),false)
 assert.equal(suppressWorkerGuideAutoOffers('FAKE-WORKER-GUIDE-A',null),false)
 assert.equal(suppressWorkerGuideAutoOffers('FAKE-WORKER-GUIDE-A',{
  setItem(){throw Error('storage_denied')},getItem(){return null},
 }),false)
 assert.equal(suppressWorkerGuideAutoOffers('FAKE-WORKER-GUIDE-A',{
  setItem(){},getItem(){return null},
 }),false,'silent storage write failures are not successful opt-outs')
})

test('welcome checkbox is optional and cannot submit business data or close after failed persistence',()=>{
 const source=readFileSync(new URL('../src/WorkerGuide.jsx',import.meta.url),'utf8')
 const operations=readFileSync(new URL('../src/OperationsWorkspace.jsx',import.meta.url),'utf8')
 const intro=source.slice(source.indexOf('export function WorkerGuideWelcome('),
  source.indexOf('export function WorkerGuideSpotlight('))
 assert.match(intro,/type="checkbox" checked=\{disableAutomaticOffers\}/)
 assert.match(intro,/دیگر به‌صورت خودکار نمایش نده/)
 assert.match(intro,/onClick=\{\(\)=>choose\(onBegin\)\}/)
 assert.match(intro,/onClick=\{\(\)=>choose\(onSkip\)\}/)
 assert.match(intro,/preferenceError&&<p role="alert"/)
 assert.match(operations,/suppressWorkerGuideAutoOffers\(profile.worker_id,window.localStorage\)/)
 assert.doesNotMatch(intro,/\.rpc\(|setWeeklyDay\(|submitMyTime\(/)
})

test('first-login welcome explains 3 genuine actions without replacing the optional tour',()=>{
 const source=readFileSync(new URL('../src/WorkerGuide.jsx',import.meta.url),'utf8')
 const css=readFileSync(new URL('../src/worker-guide.css',import.meta.url),'utf8')
 const welcome=source.slice(source.indexOf('export function WorkerGuideWelcome('),
  source.indexOf('export function WorkerGuideSpotlight('))
 assert.ok(welcome.startsWith('export function WorkerGuideWelcome('))
 assert.match(welcome,/<ol className="swtb-guide-welcome__quickstart">/)
 assert.equal((welcome.match(/<li>/g)||[]).length,3)
 for(const word of ['ورود را بررسی کنید','برنامه حضور را تنظیم کنید',
  'کارها را دنبال کنید','هر روز را جداگانه ذخیره',
  'بعد از انجام فعالیت واقعی','تأیید مدیر']){
  assert.ok(welcome.includes(word),'missing first-run guidance: '+word)
 }
 assert.match(welcome,/برنامه حضور صرفاً زمان‌های قابل همکاری/)
 assert.match(welcome,/onClick=\{\(\)=>choose\(onBegin\)\}/,'optional tour remains available')
 assert.match(welcome,/onClick=\{\(\)=>choose\(onSkip\)\}/,'temporary dismissal remains available')
 assert.doesNotMatch(welcome,/setWeeklyDay|submitMyTime|assignWorkerTask|\.rpc\(/,
  'welcome must not auto-write a schedule or a report')
 assert.match(css,/\.swtb-guide-welcome__quickstart\s*\{/)
 assert.match(css,/max-height:calc\(100dvh - 2rem\);overflow-y:auto/,
  'quickstart must not overflow a short laptop viewport')
})
