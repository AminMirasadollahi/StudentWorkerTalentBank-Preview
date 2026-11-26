/* Worker-first synthetic native acceptance. Actual WorkerOperations, real calendar, no writes. */
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {resolve} from 'node:path'
import {createServer} from 'vite'
const tool=process.env.SWTB23_BROWSER_TOOL_DIR
if(!tool)throw Error('BROWSER_TOOL_DIR_REQUIRED')
const {chromium}=createRequire(resolve(tool,'package.json'))('playwright')
Object.assign(process.env,{VITE_SWTB21_WORK_POOL_UI:'true',VITE_SWTB19_UNIFIED_WORK_UI:'true',VITE_SWTB21_DESK_POOL_UI:'true'})
const id='SWTB_CHROMIUM_SYNTHETIC_WORKER'
let server,browser,context,page
const errors=[],external=[]
try{
 server=await createServer({configFile:resolve('tests/browser/vite.smoke.config.mjs')})
 await server.listen()
 browser=await chromium.launch({headless:true,channel:'chrome',args:['--no-sandbox','--disable-background-networking']})
 context=await browser.newContext({viewport:{width:1440,height:900},locale:'fa-IR',serviceWorkers:'block'})
 await context.addInitScript(id=>localStorage.setItem('swtb-worker-guide:v1:'+id,'suppressed'),id)
 await context.route('**/*',route=>{
  const u=new URL(route.request().url())
  if(u.origin==='http://127.0.0.1:4177')return route.continue()
  external.push(u.origin);return route.abort('blockedbyclient')
 })
 page=await context.newPage();page.on('pageerror',e=>errors.push(e.message))
 await page.goto('http://127.0.0.1:4177/tests/browser/worker-smoke.html')
 const list=page.locator('.ow-worker-tasks')
 await list.locator('.ow-item').first().waitFor()
 await page.evaluate(()=>{
  const d=globalThis.__qaWorkerData,t=d.tasks[0],today=t.planned_date
  const shift=n=>{const x=new Date(today+'T12:00:00Z');x.setUTCDate(x.getUTCDate()+n);return x.toISOString().slice(0,10)}
  const old=shift(-1),lo=shift(-3)
  d.report_contract_version=1;d.server_today=today
  d.tasks=[{...t,id:'QA-CORRECTION',title:'اصلاح ساختگی خارج از تاریخچه',state:'needs_changes',planned_date:old,report_contract:{date_min:lo,date_max:old,window_empty:false,standard_minutes:60,minimum_minutes:1,maximum_minutes:1440,extra_reason_above_minutes:60},latest_report:{id:'QA-OLD-REPORT',work_date:old,review_state:'changes_requested',reported_minutes:30,worker_note:'متن قبلی ساختگی',review_note:'نظر مدیر ساختگی',extra_time_reason_code:null,extra_time_reason_text:null}},
  {...t,id:'QA-CANCELLED',title:'کار لغوشده ساختگی',state:'cancelled',report_contract:null,latest_report:null,desk_slot:{state:'cancelled',cancellation_reason:'دلیل لغو ساختگی'}}]
  // Complete strict V3 fixture; legacy review accepts the same shape.
  d.tasks=d.tasks.map(t=>({...t,prerequisites:{total:0,unresolved:0},latest_report:t.latest_report??null,desk_slot:t.desk_slot?{date:old,...t.desk_slot}:null}))
  d.tasks.push({...d.tasks[0],id:'QA-BLOCKED',title:'وظیفه وابسته ساختگی',state:'assigned',latest_report:null,prerequisites:{total:2,unresolved:1}})
  d.time_entries=[];d.approved_minutes_total=0
  globalThis.__qaRefresh()
 })
 await list.getByText('اصلاح ساختگی خارج از تاریخچه',{exact:true}).waitFor()
 assert.equal(await page.locator('.ow-b3-sidebar .ow-tabs button').count(),4)
 assert.equal(await page.locator('.ow-worker-date-disclosure').evaluate(el=>el.open),false)
 const card=list.locator('.ow-item').filter({hasText:'اصلاح ساختگی خارج از تاریخچه'})
 await card.locator('.ow-worker-report-trigger').click()
 const dialog=card.locator('dialog')
 await dialog.waitFor({state:'visible'})
 assert.match(await dialog.innerText(),/نظر مدیر ساختگی/)
 assert.equal(await dialog.locator('textarea').first().inputValue(),'متن قبلی ساختگی')
 assert.equal(await dialog.locator('input[type=number]').inputValue(),'30')
 assert.equal(await dialog.locator('select').count(),0,'lower pool credit does not require extra reason')
 assert.equal(await dialog.locator('button[type=submit]').isEnabled(),true)
 await dialog.getByRole('button',{name:'تاریخ انجام کار',exact:true}).click()
 const calendar=dialog.locator('.jd-popup')
 await calendar.waitFor({state:'visible'})
 assert.ok(await calendar.locator('.jd-today').isDisabled(),'server max date excludes today')
 assert.ok(await calendar.locator('.jd-selected').isEnabled(),'actual prior date preserved')
 await page.keyboard.press('Escape')
 assert.equal(await calendar.count(),0)
 assert.ok(await dialog.isVisible())
 await dialog.getByRole('button',{name:'بستن پنجره ثبت کار'}).click()
 const blocked=list.locator('.ow-item').filter({hasText:'وظیفه وابسته ساختگی'})
 assert.match(await blocked.innerText(),/در انتظار تکمیل ۲ پیش‌نیاز/)
 assert.equal(await blocked.locator('.ow-worker-report-trigger').isDisabled(),true)
 await page.locator('.ow-worker-focus-switch button').filter({hasText:'پایان‌یافته'}).click()
 const cancelled=list.locator('.ow-item').filter({hasText:'کار لغوشده ساختگی'})
 await cancelled.waitFor()
 assert.match(await cancelled.innerText(),/لغوشده/)
 assert.equal(await cancelled.locator('.ow-worker-report-trigger').count(),0)
 await cancelled.locator('.ow-b3-inspect-trigger').click()
 assert.match(await page.locator('#ow-task-inspector').innerText(),/دلیل لغو ساختگی/)
 console.log('PASS R3_NATIVE_CORRECTION_DATE_AND_CANCELLED')
 const sidebar=page.locator('.ow-b3-sidebar')
 await sidebar.getByRole('button',{name:'سوابق گزارش‌ها',exact:true}).click()
 const history=page.locator('.ow-worker-history-panel')
 await history.waitFor({state:'visible'})
 assert.equal(await history.locator('.ow-history-advanced').evaluate(el=>el.open),false)
 assert.equal(await history.locator('.ow-history-analysis').evaluate(el=>el.open),false)
 assert.equal(await history.locator('.ow-history-filter button').count(),5)
 await history.locator('.ow-history-advanced summary').click()
 const unit=history.locator('select[aria-label="فیلتر واحد گزارش‌های من"]')
 await unit.selectOption('library');await unit.selectOption('')
 assert.equal(await history.locator('.ow-history-advanced').evaluate(el=>el.open),true)
 await history.locator('.ow-history-analysis > summary').click()
 assert.ok(await history.locator('.ow-worker-performance').isVisible())
 assert.match(await history.locator('.ow-unit-hours__total').innerText(),/۰ دقیقه/)
 await sidebar.getByRole('button',{name:'حساب من',exact:true}).click()
 const account=page.locator('.ow-self-profile')
 await account.getByText('synthetic@example.invalid',{exact:true}).waitFor()
 assert.equal(await sidebar.getByText('synthetic@example.invalid',{exact:true}).count(),0)
 await sidebar.getByRole('button',{name:'زمان حضور',exact:true}).click()
 const presence=page.locator('.ow-worker-availability-panel')
 await presence.locator('.ow-month-day.is-today').waitFor()
 assert.equal(await presence.locator('.ow-worker-unified-toggle input').isChecked(),false)
 if(process.env.VITE_SWTB23_WORKER_POLICY_RELEASE==='true'){
  assert.ok(await page.evaluate(()=>globalThis.__qaV3Reads>0))
  assert.equal(await page.evaluate(()=>globalThis.__qaV2Reads||0),0)
  await sidebar.getByRole('button',{name:'کارهای من',exact:true}).click()
  await page.evaluate(()=>{delete globalThis.__qaWorkerData.tasks[0].prerequisites;globalThis.__qaRefresh()})
  await page.getByText('دریافت اطلاعات معتبر کارها کامل نشد.',{exact:false}).waitFor()
  assert.equal(await list.locator('.ow-item').count(),0)
  assert.equal(await page.evaluate(()=>globalThis.__qaV2Reads||0),0)
  console.log('PASS R3_STRICT_V3_NO_DOWNGRADE')
 }
 assert.equal(await page.evaluate(()=>globalThis.__qaWriteAttempts),0)
 assert.deepEqual(errors,[]);assert.deepEqual(external,[])
 console.log('PASS R3_NATIVE_HISTORY_ACCOUNT_PRESENCE')
 console.log('SWTB23_R3_WORKER_NATIVE_CHROME_PASS')
}finally{await context?.close().catch(()=>{});await browser?.close().catch(()=>{});await server?.close().catch(()=>{})}
