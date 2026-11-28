// Native Chrome, loopback-only, actual mounted React review; no live backend.
import assert from 'node:assert/strict'
import {mkdir,writeFile} from 'node:fs/promises'
import {createRequire} from 'node:module'
import {resolve} from 'node:path'
import {createServer} from 'vite'
const tool=process.env.SWTB23_BROWSER_TOOL_DIR
if(!tool)throw Error('BROWSER_TOOL_DIR_REQUIRED')
const {chromium}=createRequire(resolve(tool,'package.json'))('playwright')
const out=resolve('test-results/swtb27-day-batch-synthetic')
await mkdir(out,{recursive:true})
let server,browser,context,page,blocked=0
const errors=[],observations={}
try{
 server=await createServer({configFile:resolve('tests/browser/vite.swtb24-r5.config.mjs'),server:{hmr:false},optimizeDeps:{noDiscovery:true,include:['react','react-dom/client','react/jsx-runtime','react/jsx-dev-runtime']}})
 await server.listen()
 browser=await chromium.launch({headless:true,channel:'chrome',args:['--no-sandbox','--disable-background-networking']})
 context=await browser.newContext({viewport:{width:1440,height:900},locale:'fa-IR',serviceWorkers:'block'})
 await context.route('**/*',route=>new URL(route.request().url()).origin==='http://127.0.0.1:4179'?route.continue():(blocked++,route.abort('blockedbyclient')))
 page=await context.newPage();page.on('pageerror',e=>errors.push(e.message))
 await page.goto('http://127.0.0.1:4179/tests/browser/swtb27-day-batch-review.html',{waitUntil:'domcontentloaded'})
 await page.bringToFront()
 const state=async name=>page.locator('[aria-label="مالک مشترک واگذاری"][data-state="'+name+'"]').waitFor({timeout:10000})
 const button=name=>page.getByRole('button',{name,exact:true})
 const batch=page.getByRole('region',{name:'پیش‌نمایش واگذاری مجموعه‌ای'})
 const counts=()=>page.evaluate(()=>globalThis.__qaDayBatch.counts())
 const snap=async name=>{
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,name+' overflow')
  await page.screenshot({path:resolve(out,name+'.png'),fullPage:true})
 }
 const preview=async()=>{await button('بررسی تخصیص').click();await batch.getByTestId('batch-standard-total').waitFor()}
 const ack=async()=>{await button('بررسی وضعیت درخواست').click();await button('تأیید و بستن نتیجه').click();await state('idle')}
 await state('idle')
 await batch.getByLabel('عنوان کار ۱',{exact:true}).fill('ساماندهی منابع مصنوعی')
 await batch.getByRole('checkbox',{name:'دانشجوکار الف',exact:true}).check()
 await button('+ افزودن کار دیگر').click()
 await batch.getByLabel('عنوان کار ۲',{exact:true}).fill('ثبت داده‌های مصنوعی')
 await batch.getByRole('checkbox',{name:'کار ۱ — دانشجوکار ب',exact:true}).check()
 await batch.getByRole('checkbox',{name:'کار ۲ — دانشجوکار ب',exact:true}).check()
 await preview()
 assert.equal(await batch.getByTestId('batch-standard-total').textContent(),'۱۸۰ دقیقه')
 await snap('01-explicit-matrix-preview')
 await button('واگذاری مستقیم').click()
 const directTitle=page.locator('.ow-assignment-form input[maxlength="160"]')
 await directTitle.fill('پیش‌نویس مستقل مصنوعی')
 await button('واگذاری مجموعه‌ای').click()
 assert.equal(await batch.getByLabel('عنوان کار ۱',{exact:true}).inputValue(),'ساماندهی منابع مصنوعی')
 assert.equal(await batch.getByTestId('batch-standard-total').count(),0)
 await preview()
 // Lost commit response must not trigger another write.
 await page.evaluate(()=>globalThis.__qaDayBatch.lose('commit'))
 await button('ثبت آزمایشی مجموعه').click();await state('unknown')
 assert.equal((await counts()).commits,1)
 await button('واگذاری مستقیم').click()
 assert.equal(await directTitle.inputValue(),'پیش‌نویس مستقل مصنوعی')
 assert.equal(await page.locator('.ow-assignment-form button[type="submit"]').isDisabled(),true)
 await snap('02-unknown-blocks-direct')
 await button('گزارش‌ها').click();await state('committed')
 assert.match(await page.getByTestId('batch-receipt-summary').textContent(),/۳ تخصیص.*۱۸۰ دقیقه/)
 await snap('03-recovered-receipt-report')
 await ack()
 await button('واگذاری مستقیم').click();await state('idle')
 assert.equal(await directTitle.inputValue(),'پیش‌نویس مستقل مصنوعی')
 await button('واگذاری مجموعه‌ای').click()
 assert.equal(await batch.getByLabel('عنوان کار ۱',{exact:true}).inputValue(),'')
 assert.equal((await counts()).commits,1)
 observations.lostCommitRecoveredOnce=true
 observations.independentDraftRetained=true
 // Same-actor auth refresh hides the draft until fresh admin proof and read.
 await batch.getByLabel('عنوان کار ۱',{exact:true}).fill('پیش‌نویس برای بازبینی هویت')
 await batch.getByRole('checkbox',{name:'دانشجوکار الف',exact:true}).check()
 await preview()
 await page.evaluate(()=>{globalThis.__qaReleaseAdmin=globalThis.__qaDayBatch.holdAdmin();globalThis.__qaDayBatch.refresh()})
 await batch.waitFor({state:'hidden'})
 await page.evaluate(()=>{globalThis.__qaReleaseAdmin();delete globalThis.__qaReleaseAdmin})
 await state('idle')
 assert.equal(await batch.getByLabel('عنوان کار ۱',{exact:true}).inputValue(),'پیش‌نویس برای بازبینی هویت')
 assert.equal(await batch.getByTestId('batch-standard-total').count(),0)
 await preview()
 await page.setViewportSize({width:900,height:900});await snap('04-retained-draft-narrow')
 await page.evaluate(()=>globalThis.__qaDayBatch.lose('acknowledge'))
 await button('ثبت آزمایشی مجموعه').click();await state('committed')
 await button('بررسی وضعیت درخواست').click();await button('تأیید و بستن نتیجه').click();await state('unknown')
 await button('بررسی وضعیت درخواست').click();await state('idle')
 assert.equal(await batch.getByLabel('عنوان کار ۱',{exact:true}).inputValue(),'')
 observations.lostAckRecovered=true
 const final=await counts();assert.equal(final.commits,2);assert.equal(final.reserves,2);assert.equal(final.acks,2);assert.equal(final.legacyFallback,0);assert.ok(final.admin>=2)
 assert.equal(await page.evaluate(()=>localStorage.length+sessionStorage.length),0)
 await page.evaluate(()=>globalThis.__qaDayBatch.logout())
 await batch.waitFor({state:'hidden'});assert.equal(await button('ثبت آزمایشی مجموعه').count(),0)
 observations.final=final
 assert.equal(blocked,0);assert.deepEqual(errors,[])
 console.log('PASS SWTB27_CHROME_EXPLICIT_MATRIX_RECEIPT_RECOVERY_DRAFT_AUTH_NO_NETWORK')
}catch(e){console.error('SWTB27_CHROME_DIAGNOSTIC',JSON.stringify({observations,blocked,errors,headings:await page?.locator('h1,h2,h3').allTextContents().catch(()=>[])}));throw e}
finally{await writeFile(resolve(out,'observations.json'),JSON.stringify({observations,blocked,errors},null,2));await context?.close().catch(()=>{});await browser?.close().catch(()=>{});await server?.close().catch(()=>{})}
