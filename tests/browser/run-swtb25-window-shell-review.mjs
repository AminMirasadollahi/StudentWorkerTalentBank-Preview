import assert from 'node:assert/strict'
import {mkdir,writeFile} from 'node:fs/promises'
import {createRequire} from 'node:module'
import {resolve} from 'node:path'
import {createServer} from 'vite'
const tool=process.env.SWTB23_BROWSER_TOOL_DIR
if(!tool)throw Error('BROWSER_TOOL_DIR_REQUIRED')
const {chromium}=createRequire(resolve(tool,'package.json'))('playwright')
const out=resolve('test-results/swtb25-window-shell')
await mkdir(out,{recursive:true})
let server,browser,ctx,page,blocked=0
const errors=[]
try{
 server=await createServer({configFile:resolve('tests/browser/vite.swtb25-window-shell.config.mjs')});await server.listen()
 browser=await chromium.launch({headless:true,channel:'chrome',args:['--no-sandbox','--disable-background-networking']})
 ctx=await browser.newContext({viewport:{width:1440,height:900},locale:'fa-IR',serviceWorkers:'block'})
 await ctx.route('**/*',r=>new URL(r.request().url()).origin==='http://127.0.0.1:4182'?r.continue():(blocked++,r.abort()))
 page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message))
 await page.goto('http://127.0.0.1:4182/tests/browser/swtb25-window-shell-review.html')
 await page.getByRole('heading',{name:'مدیریت کارها و سوابق'}).waitFor()
 const snap=async n=>{assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,n);await page.screenshot({path:resolve(out,n+'.png'),fullPage:true})}
 await snap('01-manager')
 await page.getByRole('button',{name:'بررسی مجدد مجوز نمونه'}).click()
 await page.getByText('مجوز نمای آزمایشی تأیید نشده است.').waitFor()
 assert.equal(await page.locator('.wr-row').count(),0)
 await page.getByRole('button',{name:'مجوز نمونه معتبر'}).click()
 await page.getByRole('heading',{name:'مدیریت کارها و سوابق'}).waitFor()
 await page.getByRole('button',{name:'خطای خواندن نمونه'}).click()
 await page.getByText('دریافت قرارداد معتبر ممکن نشد؛ اطلاعات قبلی نمایش داده نمی‌شود.').waitFor()
 assert.equal(await page.locator('.wr-row').count(),0)
 await page.getByRole('button',{name:'خواندن مجدد نمونه'}).click()
 await page.getByRole('heading',{name:'مدیریت کارها و سوابق'}).waitFor()
 await page.getByRole('button',{name:'نمای دانشجوکار نمونه'}).click()
 await page.getByRole('heading',{name:'کارهای من',exact:true}).waitFor()
 assert.equal(await page.locator('.wr-task-head').count(),2)
 assert.equal(await page.getByRole('heading',{name:'سوابق گزارش‌های بارگذاری‌شده'}).count(),0)
 await page.setViewportSize({width:390,height:844});await snap('02-worker-tasks')
 await page.getByRole('button',{name:'سوابق گزارش‌ها',exact:true}).click()
 await page.getByRole('heading',{name:'سوابق گزارش‌های بارگذاری‌شده'}).waitFor()
 assert.equal(await page.locator('.wr-task-head').count(),0)
 await snap('03-worker-history')
 assert.equal(await page.evaluate(()=>globalThis.__qaLegacyReads),0)
 assert.equal(await page.evaluate(()=>globalThis.__qaWriteAttempts),0)
 assert.equal(blocked,0);assert.deepEqual(errors,[])
 console.log('PASS SWTB25_WINDOW_SHELL_READ_ONLY_AUTH_SCOPE')
}finally{await writeFile(resolve(out,'observations.json'),JSON.stringify({blocked,errors},null,2));await ctx?.close().catch(()=>{});await browser?.close().catch(()=>{});await server?.close().catch(()=>{})}
