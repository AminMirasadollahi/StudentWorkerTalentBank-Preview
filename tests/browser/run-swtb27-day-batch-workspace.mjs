// Actual AdminOperations common launcher with explicit synthetic owner. No deployment.
import assert from 'node:assert/strict'
import {mkdir,writeFile} from 'node:fs/promises'
import {createRequire} from 'node:module'
import {resolve} from 'node:path'
import {createServer} from 'vite'
const tool=process.env.SWTB23_BROWSER_TOOL_DIR
if(!tool)throw Error('BROWSER_TOOL_DIR_REQUIRED')
const {chromium}=createRequire(resolve(tool,'package.json'))('playwright')
process.env.VITE_SWTB22_TASKS_FOCUS_UI='true'
process.env.VITE_SWTB19_UNIFIED_WORK_UI='true'
process.env.VITE_SWTB22_WORK_POOL_FOCUS_UI='true'
const out=resolve('test-results/swtb27-workspace-synthetic')
await mkdir(out,{recursive:true})
let server,browser,context,page,blocked=0
const errors=[],observations={}
try{
 server=await createServer({configFile:resolve('tests/browser/vite.swtb24-r5.config.mjs'),server:{hmr:false},optimizeDeps:{noDiscovery:true,include:['react','react-dom/client','react/jsx-runtime','react/jsx-dev-runtime']}})
 await server.listen()
 browser=await chromium.launch({headless:true,channel:'chrome',args:['--no-sandbox','--disable-background-networking']})
 context=await browser.newContext({viewport:{width:1440,height:900},locale:'fa-IR',serviceWorkers:'block'})
 await context.route('**/*',route=>new URL(route.request().url()).origin==='http://127.0.0.1:4179'?route.continue():(blocked++,route.abort('blockedbyclient')))
 page=await context.newPage();page.on('pageerror',e=>errors.push(e.stack||e.message))
 await page.goto('http://127.0.0.1:4179/tests/browser/swtb27-day-batch-workspace.html',{waitUntil:'domcontentloaded'})
 await page.bringToFront()
 const state=async name=>page.locator('[aria-label="مالک مشترک واگذاری"][data-state="'+name+'"]').waitFor({timeout:10000})
 const common=page.getByRole('button',{name:'+ تعریف کار',exact:true})
 const choice=name=>page.getByRole('group',{name:'روش تخصیص کار'}).getByRole('button',{name})
 const dialog=page.getByRole('dialog',{name:'واگذاری مجموعه‌ای کارها'})
 const batch=dialog.getByRole('region',{name:'پیش‌نمایش واگذاری مجموعه‌ای'})
 const button=name=>page.getByRole('button',{name,exact:true})
 const counts=()=>page.evaluate(()=>globalThis.__qaDayBatch.counts())
 const snap=async name=>{assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);await page.screenshot({path:resolve(out,name+'.png')})}
 const waitReady=async()=>{await state('idle');await common.waitFor();await page.waitForFunction(()=>!Array.from(document.querySelectorAll('button')).find(x=>x.textContent==='+ تعریف کار')?.disabled)}
 await waitReady();await common.click()
 assert.equal(await choice(/واگذاری مجموعه‌ای/).isDisabled(),true)
 assert.equal(await choice(/واگذاری مستقیم/).isEnabled(),true)
 assert.equal(await choice(/انتشار فرصت کاری/).isEnabled(),true)
 await snap('01-missing-term-blocks-only-batch')
 await button('انصراف').click()
 await page.evaluate(()=>globalThis.__qaWorkspace.termMode('valid'));await waitReady();await common.click()
 await choice(/واگذاری مجموعه‌ای/).click();await dialog.waitFor()
 assert.equal(await page.locator('dialog[open]').count(),1)
 assert.equal(await page.getByLabel('بازیابی مشترک واگذاری').count(),1)
 await batch.getByLabel('عنوان کار ۱',{exact:true}).fill('کار مصنوعی از پنل واقعی')
 await batch.getByLabel('دلیل اطلاع‌رسانی کوتاه (در صورت نیاز)').fill('هماهنگی از قبل برای آزمون مصنوعی')
 await batch.getByRole('checkbox',{name:'دانشجوکار الف',exact:true}).check()
 await button('بستن و حفظ پیش‌نویس').click();await dialog.waitFor({state:'hidden'})
 await common.click();await choice(/واگذاری مجموعه‌ای/).click();await dialog.waitFor()
 assert.equal(await batch.getByLabel('عنوان کار ۱',{exact:true}).inputValue(),'کار مصنوعی از پنل واقعی')
 await button('بررسی تخصیص').click();await batch.getByTestId('batch-standard-total').waitFor()
 await snap('02-actual-workspace-batch-dialog')
 await page.evaluate(()=>globalThis.__qaDayBatch.lose('commit'))
 await button('ثبت آزمایشی مجموعه').click();await state('unknown')
 await button('بررسی وضعیت درخواست').click();await state('committed')
 assert.match(await page.getByTestId('batch-receipt-summary').textContent(),/۱ تخصیص.*۶۰ دقیقه/)
 await snap('03-actual-workspace-recovered-receipt')
 await button('تأیید و بستن نتیجه').click();await state('idle')
 await batch.getByLabel('عنوان کار ۱',{exact:true}).waitFor()
 assert.equal(await batch.getByLabel('عنوان کار ۱',{exact:true}).inputValue(),'')
 await button('بستن و حفظ پیش‌نویس').click();await dialog.waitFor({state:'hidden'})
 // Start in workPool and explicitly navigate to the canonical tasks route.
 await button('فرصت‌های قابل انتخاب').click();await common.waitFor();await common.click()
 await choice(/واگذاری مجموعه‌ای/).click();await dialog.waitFor()
 assert.equal(await page.locator('dialog[open]').count(),1)
 await button('بستن و حفظ پیش‌نویس').click();await dialog.waitFor({state:'hidden'})
 await page.evaluate(()=>globalThis.__qaWorkspace.termMode('failed'));await waitReady();await common.click()
 assert.equal(await choice(/واگذاری مجموعه‌ای/).isDisabled(),true)
 assert.equal(await choice(/واگذاری مستقیم/).isEnabled(),true)
 await button('انصراف').click()
 await page.evaluate(()=>globalThis.__qaWorkspace.readFail(true))
 await page.getByText('اطلاعات مدیریتی در دسترس نیست.',{exact:false}).waitFor()
 assert.equal(await common.count(),0)
 await page.evaluate(()=>{globalThis.__qaWorkspace.termMode('valid');globalThis.__qaWorkspace.readFail(false)})
 await waitReady()
 await page.evaluate(()=>globalThis.__qaWorkspace.checking(true))
 await common.waitFor({state:'hidden'})
 await page.evaluate(()=>globalThis.__qaWorkspace.checking(false));await waitReady()
 const final=await counts()
 assert.equal(final.reserves,1);assert.equal(final.commits,1);assert.equal(final.acks,1);assert.equal(final.legacyFallback,0)
 assert.ok(final.admin>=2);assert.ok(await page.evaluate(()=>globalThis.__qaWorkspace.termReads())>=3)
 assert.equal(await page.evaluate(()=>localStorage.length+sessionStorage.length),0)
 observations.final=final;observations.workReadFailure=true;observations.termIndependent=true;observations.parentChecking=true
 // Open the real separate staging HTML with NO stage opt-in; it must refuse
 // before loading any real operations client (external network blocked).
 await page.goto('http://127.0.0.1:4179/tests/staging/swtb28-manager-review.html',{waitUntil:'domcontentloaded'})
 await page.getByText('تنظیمات محیط آزمایشی معتبر نیست؛ اتصال برقرار نشد.',{exact:true}).waitFor()
 observations.stagingEntryUnconfiguredBlocked=true
 assert.equal(blocked,0);assert.deepEqual(errors,[])
 console.log('PASS SWTB28_UNCONFIGURED_STAGING_ENTRY_BLOCKED_BEFORE_CLIENT')
 console.log('PASS SWTB27_ACTUAL_WORKSPACE_LAUNCHER_SCOPED_READ_TERM_RECEIPT_NO_NETWORK')
}catch(e){console.error('SWTB27_WORKSPACE_CHROME_DIAGNOSTIC',JSON.stringify({observations,blocked,errors,headings:await page?.locator('h1,h2,h3').allTextContents().catch(()=>[])}));throw e}
finally{await writeFile(resolve(out,'observations.json'),JSON.stringify({observations,blocked,errors},null,2));await context?.close().catch(()=>{});await browser?.close().catch(()=>{});await server?.close().catch(()=>{})}
