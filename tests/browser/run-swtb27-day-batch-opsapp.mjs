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
// Explicit fictional non-production config; fake transport remains mandatory.
Object.assign(process.env,{VITE_SWTB28_STAGING_REVIEW_UI:'true',VITE_SWTB28_STAGING_PROJECT_REF:'abcdefghijklmnopqrst',VITE_SWTB22_RECOVERY_REVIEW_UI:'true',VITE_SWTB22_RECOVERY_REVIEW_PROJECT_REF:'abcdefghijklmnopqrst',VITE_SWTB22_RECOVERY_RELEASE_UI:'false',VITE_SWTB23_WORKER_POLICY_RELEASE:'true',VITE_SWTB24_R5_MANAGER_IA_UI:'true',VITE_SUPABASE_URL:'https://abcdefghijklmnopqrst.supabase.co',VITE_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture'})
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
 page=await context.newPage();page.on('pageerror',e=>errors.push(e.stack||e.message))
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
 const receiptVisible=async()=>{const panel=page.locator('.swtb30-recovery-content[data-recovery-state="committed"]');await panel.waitFor();const ack=panel.getByRole('button',{name:'تأیید و بستن نتیجه',exact:true});await ack.waitFor();assert.equal(await ack.evaluate(el=>{const r=el.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth}),true,'RECOVERY_ACK_MUST_BE_IN_VIEWPORT');return panel}
 const snap=async n=>{assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);await page.screenshot({path:resolve(out,n+'.png')})}
 await state('idle');await page.getByText('محیط آزمایشی مستقل؛ این نسخه برای انتشار عمومی نیست.',{exact:true}).waitFor();await route('tasks').click();await common.waitFor();await open()
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
 const batchReceipt=await receiptVisible();await snap('01-opsapp-candidate-recovery');await batchReceipt.screenshot({path:resolve(out,'01a-batch-receipt.png')})
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
 const beforeDesk=await counts();assert.equal(beforeDesk.reserves,1);assert.equal(beforeDesk.commits,1);assert.equal(beforeDesk.acks,1);assert.equal(beforeDesk.legacyFallback,0)
 // Same actual OpsApp owner, explicit direct dialog and scoped day read.
 const direct=page.getByRole('dialog',{name:'واگذاری مستقیم کار جدید'})
 await common.click();await page.getByRole('group',{name:'روش تخصیص کار'}).getByRole('button',{name:/واگذاری مستقیم/}).click();await direct.waitFor()
 await direct.getByLabel('واحد انجام کار',{exact:true}).selectOption('library')
 await direct.getByRole('button',{name:'استفاده از شرح وظیفه آماده',exact:true}).click()
 await direct.getByText('دریافت نوبت‌ها ممکن نیست.',{exact:false}).waitFor()
 assert.equal(await direct.getByRole('button',{name:'لغو نوبت',exact:true}).count(),0)
 await page.evaluate(()=>globalThis.__qaDayBatch.deskReadMode('wrong_task'))
 await direct.getByRole('button',{name:'تلاش مجدد',exact:true}).click()
 const cancel=direct.getByRole('button',{name:'لغو نوبت',exact:true})
 await cancel.waitFor();assert.equal(await cancel.isDisabled(),true)
 assert.equal((await counts()).deskReserves,0)
 await page.evaluate(()=>globalThis.__qaDayBatch.deskReadMode('valid'))
 await direct.getByRole('button',{name:'بازخوانی ظرفیت نوبت‌ها',exact:true}).click()
 await page.waitForFunction(()=>Array.from(document.querySelectorAll('.ow-desk-cancel-trigger')).some(x=>!x.disabled))
 await cancel.click();await direct.getByLabel('علت لغو نوبت',{exact:true}).fill('لغو نوبت مصنوعی')
 await snap('03-opsapp-desk-cancel-confirmation')
 await page.evaluate(()=>globalThis.__qaDayBatch.lose('commit'))
 await direct.getByRole('button',{name:'تأیید لغو نوبت',exact:true}).click();await state('unknown')
 await button('بستن و حفظ پیش‌نویس').click();await direct.waitFor({state:'hidden'})
 await route('applicants').click();await state('committed')
 await page.getByText('لغو نوبت و وظیفه مرتبط تأیید شد؛ این رسید تأیید ساعت نیست.',{exact:true}).waitFor()
 const deskReceipt=await receiptVisible();await snap('04-opsapp-desk-cancel-recovered');await deskReceipt.screenshot({path:resolve(out,'04a-desk-receipt.png')})
 await route('history').click();await state('committed')
 await button('آمار و خروجی پذیرش').click();await state('committed')
 await button('تأیید و بستن نتیجه').click();await state('idle')
 await route('tasks').click();await state('idle')
 await common.click();await page.getByRole('group',{name:'روش تخصیص کار'}).getByRole('button',{name:/واگذاری مستقیم/}).click();await direct.waitFor()
 // Preserve the independent assignment draft; a fresh read must follow the
 // current work proof, not the transient checking projection.
 assert.equal(await direct.getByLabel('واحد انجام کار',{exact:true}).inputValue(),'library')
 await direct.getByRole('button',{name:'بازنشانی شرح وظیفه ثابت',exact:true}).waitFor()
 await direct.getByText('هنوز نوبتی برای این روز ثبت نشده است.',{exact:true}).waitFor()
 assert.equal(await direct.getByRole('button',{name:'لغو نوبت',exact:true}).count(),0)
 await button('بستن و حفظ پیش‌نویس').click();await direct.waitFor({state:'hidden'})
 const final=await counts();assert.equal(final.reserves,2);assert.equal(final.commits,2);assert.equal(final.acks,2);assert.equal(final.deskReserves,1);assert.equal(final.deskCommits,1);assert.equal(final.deskAcks,1);assert.ok(final.deskReads>=4);assert.equal(final.shiftCancelled,true);assert.equal(final.legacyFallback,0)
 const reads=await page.evaluate(()=>globalThis.__qaOpsApp.counts());assert.ok(reads.identityReads>=2);assert.ok(reads.candidateReads>=2);assert.ok(reads.reportReads>=1);assert.deepEqual([...reads.stagedReadRoutes].sort(),['ops_get_library_desk_shifts','ops_get_operations_term_dashboard','ops_get_operations_v3','ops_list_candidates'].sort())
 await button('خروج').click();await common.waitFor({state:'hidden'})
 assert.equal(await page.getByTestId('batch-receipt-summary').count(),0)
 assert.equal(await page.evaluate(()=>localStorage.length+sessionStorage.length),0)
 observations.final=final;observations.reads=reads
 assert.equal(blocked,0);assert.deepEqual(errors,[])
 console.log('PASS SWTB27_ACTUAL_OPSAPP_IDENTITY_CANDIDATE_REPORT_RECOVERY_NO_NETWORK')
 console.log('PASS SWTB28_ACTUAL_OPSAPP_DURABLE_DESK_CANCEL_LOST_COMMIT_WRONG_DAY_TASK_NO_FALLBACK')
 console.log('PASS SWTB28_ACTUAL_OPSAPP_STAGING_ADAPTER_FOUR_SCOPED_READS_FAKE_ONLY')
 console.log('PASS SWTB31_VISIBLE_RECOVERY_ACK_AND_TARGETED_RECEIPTS')
}catch(e){console.error('SWTB27_OPSAPP_CHROME_DIAGNOSTIC',JSON.stringify({observations,blocked,errors,headings:await page?.locator('h1,h2,h3').allTextContents().catch(()=>[]),status:await page?.locator('[role=status],[role=alert]').allTextContents().catch(()=>[]),deskCoverage:await page?.locator('.ow-desk-coverage').allTextContents().catch(()=>[]),counters:await page?.evaluate(()=>globalThis.__qaDayBatch?.counts()).catch(()=>null)}));throw e}
finally{await writeFile(resolve(out,'observations.json'),JSON.stringify({observations,blocked,errors},null,2));await context?.close().catch(()=>{});await browser?.close().catch(()=>{});await server?.close().catch(()=>{})}
