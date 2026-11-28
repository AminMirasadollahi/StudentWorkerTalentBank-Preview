// Actual OpsApp, fake identity and RPCs, no real Supabase imports or external requests.
import assert from 'node:assert/strict'
import {mkdir,writeFile} from 'node:fs/promises'
import {createRequire} from 'node:module'
import {resolve} from 'node:path'
import {createServer} from 'vite'
const tool=process.env.SWTB23_BROWSER_TOOL_DIR
if(!tool)throw Error('BROWSER_TOOL_DIR_REQUIRED')
const {chromium}=createRequire(resolve(tool,'package.json'))('playwright')
for(const n of ['MANAGER_SHELL_UI','TASKS_FOCUS_UI','WORK_POOL_FOCUS_UI'])process.env['VITE_SWTB22_'+n]='true'
process.env.VITE_SWTB19_UNIFIED_WORK_UI='true'
const out=resolve('test-results/swtb27-opsapp-synthetic')
await mkdir(out,{recursive:true})
let server,browser,context,page,blocked=0
const errors=[],observations={}
try{
 server=await createServer({configFile:resolve('tests/browser/vite.swtb27-opsapp.config.mjs')})
 await server.listen()
 browser=await chromium.launch({headless:true,channel:'chrome',args:['--no-sandbox','--disable-background-networking']})
 context=await browser.newContext({viewport:{width:1440,height:900},locale:'fa-IR',serviceWorkers:'block'})
 await context.route('**/*',r=>new URL(r.request().url()).origin==='http://127.0.0.1:4179'?r.continue():(blocked++,r.abort('blockedbyclient')))
 page=await context.newPage();page.on('pageerror',e=>errors.push(e.message))
 await page.goto('http://127.0.0.1:4179/tests/browser/swtb27-day-batch-opsapp.html',{waitUntil:'domcontentloaded'})
 await page.bringToFront()
 const state=async name=>page.locator('[aria-label="مالک مشترک واگذاری"][data-state="'+name+'"]').waitFor({timeout:10000})
 const button=name=>page.getByRole('button',{name,exact:true})
 const route=id=>page.locator('[data-swtb22-route="'+id+'"]')
 const common=button('+ تعریف کار')
 const dialog=page.getByRole('dialog',{name:'واگذاری مجموعه‌ای کارها'})
 const batch=dialog.getByRole('region',{name:'پیش‌نمایش واگذاری مجموعه‌ای'})
 const counts=()=>page.evaluate(()=>globalThis.__qaDayBatch.counts())
 const open=async()=>{await common.click();await page.getByRole('group',{name:'روش تخصیص کار'}).getByRole('button',{name:/واگذاری مجموعه‌ای/}).click();await dialog.waitFor()}
 const snap=async n=>{assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);await page.screenshot({path:resolve(out,n+'.png')})}
 await state('idle');await route('tasks').click();await common.waitFor();await open()
 await batch.getByLabel('عنوان کار ۱',{exact:true}).fill('پیش‌نویس در OpsApp واقعی')
 await batch.getByLabel('دلیل اطلاع‌رسانی کوتاه (در صورت نیاز)').fill('آزمون مصنوعی هماهنگی قبلی')
 await batch.getByRole('checkbox',{name:'دانشجوکار الف',exact:true}).check()
 await button('بستن و حفظ پیش‌نویس').click();await dialog.waitFor({state:'hidden'})
 await route('applicants').click()
 await page.getByText('داوطلب کاملاً مصنوعی',{exact:true}).waitFor();await state('idle')
 assert.equal(await common.count(),0);assert.equal((await counts()).commits,0)
 await route('tasks').click();await state('idle');await common.waitFor();await open()
 assert.equal(await batch.getByLabel('عنوان کار ۱',{exact:true}).inputValue(),'پیش‌نویس در OpsApp واقعی')
 await button('بررسی تخصیص').click();await batch.getByTestId('batch-standard-total').waitFor()
 await page.evaluate(()=>globalThis.__qaDayBatch.lose('commit'))
 await button('ثبت آزمایشی مجموعه').click();await state('unknown')
 await button('بستن و حفظ پیش‌نویس').click();await dialog.waitFor({state:'hidden'})
 await route('applicants').click();await state('committed')
 assert.match(await page.getByTestId('batch-receipt-summary').textContent(),/۱ تخصیص.*۶۰ دقیقه/)
 await snap('01-opsapp-candidate-recovery')
 await route('history').click();await state('committed')
 await button('آمار و خروجی پذیرش').click();await state('committed')
 await button('تأیید و بستن نتیجه').click();await state('idle')
 await route('tasks').click();await state('idle');await open()
 assert.equal(await batch.getByLabel('عنوان کار ۱',{exact:true}).inputValue(),'')
 await batch.getByLabel('عنوان کار ۱',{exact:true}).fill('پیش‌نویس احراز مجدد')
 await button('بستن و حفظ پیش‌نویس').click();await dialog.waitFor({state:'hidden'})
 // Trigger the actual OpsApp resume handler; defer server identity proof deterministically.
 await page.evaluate(()=>{globalThis.__qaReleaseIdentity=globalThis.__qaOpsApp.holdIdentity();window.dispatchEvent(new Event('blur'));window.dispatchEvent(new Event('focus'))})
 await page.getByLabel('در حال تأیید مجدد مجوز؛ تعاملات موقتاً متوقف است.').waitFor()
 assert.equal(await common.isVisible(),false)
 await page.evaluate(()=>{globalThis.__qaReleaseIdentity();delete globalThis.__qaReleaseIdentity})
 await state('idle');await common.waitFor();await open()
 assert.equal(await batch.getByLabel('عنوان کار ۱',{exact:true}).inputValue(),'پیش‌نویس احراز مجدد')
 await snap('02-opsapp-retained-after-identity-proof')
 await button('بستن و حفظ پیش‌نویس').click();await dialog.waitFor({state:'hidden'})
 const final=await counts();assert.equal(final.reserves,1);assert.equal(final.commits,1);assert.equal(final.acks,1);assert.equal(final.legacyFallback,0)
 const reads=await page.evaluate(()=>globalThis.__qaOpsApp.counts());assert.ok(reads.identityReads>=2);assert.ok(reads.candidateReads>=2);assert.ok(reads.reportReads>=1)
 await button('خروج').click();await common.waitFor({state:'hidden'})
 assert.equal(await page.getByTestId('batch-receipt-summary').count(),0)
 assert.equal(await page.evaluate(()=>localStorage.length+sessionStorage.length),0)
 observations.final=final;observations.reads=reads
 assert.equal(blocked,0);assert.deepEqual(errors,[])
 console.log('PASS SWTB27_ACTUAL_OPSAPP_IDENTITY_CANDIDATE_REPORT_RECOVERY_NO_NETWORK')
}catch(e){console.error('SWTB27_OPSAPP_CHROME_DIAGNOSTIC',JSON.stringify({observations,blocked,errors,headings:await page?.locator('h1,h2,h3').allTextContents().catch(()=>[])}));throw e}
finally{await writeFile(resolve(out,'observations.json'),JSON.stringify({observations,blocked,errors},null,2));await context?.close().catch(()=>{});await browser?.close().catch(()=>{});await server?.close().catch(()=>{})}
