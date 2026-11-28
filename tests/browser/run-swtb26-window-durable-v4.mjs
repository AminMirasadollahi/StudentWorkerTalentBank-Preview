import assert from 'node:assert/strict'
import {mkdir,writeFile} from 'node:fs/promises'
import {createRequire} from 'node:module'
import {resolve} from 'node:path'
import {createServer} from 'vite'
import {createDurableV4BrowserFixture} from './windowDurableV4BrowserFixture.mjs'
const tool=process.env.SWTB23_BROWSER_TOOL_DIR
if(!tool)throw Error('BROWSER_TOOL_DIR_REQUIRED')
const {chromium}=createRequire(resolve(tool,'package.json'))('playwright')
const out=resolve('test-results/swtb26-window-durable-v4');await mkdir(out,{recursive:true})
const origin='http://127.0.0.1:4186',fixture=createDurableV4BrowserFixture()
let server,browser,ctx,page,blocked=0;const errors=[],fixtureErrors=[]
const open=async(role,width=390)=>{
 await ctx?.close();ctx=await browser.newContext({viewport:{width,height:900},locale:'fa-IR',serviceWorkers:'block'})
 await ctx.route('**/*',async r=>{
  const u=new URL(r.request().url())
  if(u.origin!==origin){blocked++;return r.abort()}
  if(u.pathname!=='/__swtb26_fixture')return r.continue()
  try{assert.equal(r.request().method(),'POST');const data=JSON.parse(r.request().postData());assert.equal(data.role,role);const v=fixture.call(data);return r.fulfill({json:v})}
  catch(e){if(!['QA_REPLY_LOST_AFTER_COMMIT','QA_READ_LOST'].includes(e.message))fixtureErrors.push(e.message);return r.fulfill({status:503,body:'synthetic unavailable'})}
 })
 page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(origin+'/tests/browser/swtb26-window-durable-v4-shell.html?role='+role)
}
const btn=n=>page.getByRole('button',{name:n,exact:true})
const rec=()=>page.getByRole('region',{name:'بازیابی پایدار عملیات'})
const refresh=async()=>{await btn('بازخوانی وضعیت عملیات').click();await page.getByText('وضعیت جاری بازخوانی شد.',{exact:true}).waitFor()}
const exec=async()=>{await btn('اجرای درخواست رزروشده').click()}
const ack=async()=>{await refresh();await btn('تأیید دریافت نتیجه عملیات').click();await page.getByText('پاسخ معتبر عملیات دریافت شد؛ وضعیت فعلی را بازخوانی کنید.',{exact:true}).waitFor();await refresh()}
const snap=async name=>{assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,name);await page.screenshot({path:resolve(out,name+'.png'),fullPage:true})}
try{
 server=await createServer({configFile:resolve('tests/browser/vite.swtb26-window-durable-v4.config.mjs')});await server.listen()
 browser=await chromium.launch({headless:true,channel:'chrome',args:['--no-sandbox','--disable-background-networking']})
 await open('worker')
 await page.getByLabel('شرح فعالیت').waitFor()
 await page.getByLabel('شرح فعالیت').fill('گزارش محفوظ بین بخش‌ها')
 await btn('سوابق گزارش‌ها').click();await page.getByRole('heading',{name:'سوابق گزارش‌های بارگذاری‌شده'}).waitFor()
 await btn('کارهای من').click();await page.getByLabel('شرح فعالیت').waitFor();assert.equal(await page.getByLabel('شرح فعالیت').inputValue(),'گزارش محفوظ بین بخش‌ها')
 await btn('شروع کار آزمایشی').click();await btn('اجرای درخواست رزروشده').waitFor();assert.equal(fixture.mutations.start,0)
 await exec();await rec().getByText(/رسید تاریخی معتبر دریافت شد/).waitFor();assert.equal(fixture.mutations.start,1)
 await ack();await page.getByLabel('شرح فعالیت').waitFor();assert.equal(await page.getByLabel('شرح فعالیت').inputValue(),'گزارش محفوظ بین بخش‌ها')
 await btn('ارسال گزارش آزمایشی').click();await btn('اجرای درخواست رزروشده').waitFor();assert.equal(fixture.mutations.submit,0)
 fixture.loseNext('qa_window_durable_submit_v4','execute');await exec();await rec().getByText('نتیجه نامشخص؛ عملیات جدید متوقف است.').waitFor();assert.equal(fixture.mutations.submit,1)
 const submitCalls=fixture.calls.filter(x=>x.name==='qa_window_durable_submit_v4');assert.equal(submitCalls.length,2);assert.equal(submitCalls[0].args.p_operation_id,null);assert.ok(submitCalls[1].args.p_operation_id);assert.equal(Object.hasOwn(submitCalls[1].args,'p_client_submission_id'),false)
 // Entire browser context replaced; Node fixture server persists, no browser storage.
 await open('worker');await rec().getByText(/رسید تاریخی معتبر دریافت شد/).waitFor();assert.equal(await btn('اجرای درخواست رزروشده').count(),0)
 assert.equal(await page.getByText(/ثبت گزارش به معنی تأیید ساعت نیست/).count(),1);await snap('01-worker-recovered')
 await btn('سوابق گزارش‌ها').click();await btn('تأیید دریافت نتیجه عملیات').waitFor()
 await btn('تأیید دریافت نتیجه عملیات').click();await page.getByText('پاسخ معتبر عملیات دریافت شد؛ وضعیت فعلی را بازخوانی کنید.',{exact:true}).waitFor();await refresh()
 assert.equal(fixture.calls.filter(x=>x.name==='qa_window_durable_submit_v4').length,2)
 await btn('کارهای من').click();await page.getByLabel('وظیفه برای ثبت گزارش').selectOption({label:'کار بازه‌ای دوم'})
 await page.getByLabel('شرح فعالیت').fill('رزرو بدون اجرای گزارش')
 await btn('ارسال گزارش آزمایشی').click();await btn('اجرای درخواست رزروشده').waitFor()
 await open('worker');await btn('مسدودسازی درخواست رزروشده').waitFor();assert.equal(await btn('اجرای درخواست رزروشده').count(),0)
 await btn('مسدودسازی درخواست رزروشده').click();await rec().getByText(/درخواست مسدود شده/).waitFor();await ack();assert.equal(fixture.mutations.submit,1);assert.equal(fixture.mutations.seal,1)
 await btn('بررسی مجوز نمونه').click();await page.getByText('مجوز نمای آزمایشی تأیید نشده است.').waitFor();assert.equal(await page.getByLabel('شرح فعالیت').count(),0)
 await btn('مجوز معتبر نمونه').click();await page.getByLabel('شرح فعالیت').waitFor()
 assert.equal(await page.evaluate(()=>globalThis.__qaLegacyReads),0);assert.equal(await page.evaluate(()=>globalThis.__qaWriteAttempts),0)
 await open('manager',1440);await btn('کارتابل و رسیدگی').click();await btn('تأیید گزارش آزمایشی').waitFor()
 await btn('تأیید گزارش آزمایشی').click();await btn('اجرای درخواست رزروشده').waitFor();fixture.loseNext('qa_window_durable_review_v4','execute');await exec();await rec().getByText('نتیجه نامشخص؛ عملیات جدید متوقف است.').waitFor()
 await open('manager',1440);await rec().getByText(/رسید تاریخی معتبر دریافت شد/).waitFor()
 fixture.setReadFailure(true);await btn('بازخوانی وضعیت عملیات').click();await page.getByText('بازخوانی کامل نشد؛ عملیات تازه متوقف است.',{exact:true}).waitFor();assert.equal(await btn('تأیید دریافت نتیجه عملیات').count(),0)
 fixture.setReadFailure(false);await refresh();await btn('تأیید دریافت نتیجه عملیات').click();await page.getByText('پاسخ معتبر عملیات دریافت شد؛ وضعیت فعلی را بازخوانی کنید.',{exact:true}).waitFor();await refresh()
 assert.equal(fixture.mutations.approve,1)
 fixture.seedAssignment();await refresh();await btn('آماده‌سازی لغو واگذاری').click();await btn('اجرای درخواست رزروشده').waitFor();await exec();await rec().getByText(/رسید تاریخی معتبر دریافت شد/).waitFor();await ack();await btn('آماده‌سازی تأیید رسید واگذاری').click();await btn('اجرای درخواست رزروشده').waitFor();await exec();await rec().getByText(/رسید تاریخی معتبر دریافت شد/).waitFor();await ack()
 assert.equal(fixture.mutations.cancel,1);assert.equal(fixture.mutations.acknowledge,1)
 await btn('مدیریت کارها').click();await btn('رزرو درخواست واگذاری').waitFor()
 const fillAssignment=async title=>{await page.getByLabel('دانشجوکار واگذاری').selectOption({label:'دانشجوکار نمونه'});await page.getByLabel('عنوان کار',{exact:true}).fill(title);await page.getByLabel('دلیل واگذاری نزدیک به موعد').fill('ضرورت نمونه')}
 await fillAssignment('واگذاری دقیق V4')
 await btn('گزارش‌ها و تحلیل').click();await btn('مدیریت کارها').click();assert.equal(await page.getByLabel('عنوان کار',{exact:true}).inputValue(),'واگذاری دقیق V4')
 fixture.loseNext('qa_window_api_assignment_v1','reserve');await btn('رزرو درخواست واگذاری').click();await rec().getByText('نتیجه نامشخص؛ عملیات جدید متوقف است.').waitFor();await refresh()
 assert.equal(await btn('ثبت نهایی واگذاری').count(),0);await btn('بازیابی همان درخواست واگذاری').click();await refresh();await btn('ثبت نهایی واگذاری').waitFor()
 fixture.loseNext('qa_window_api_assignment_v1','commit');await btn('ثبت نهایی واگذاری').click();await rec().getByText('نتیجه نامشخص؛ عملیات جدید متوقف است.').waitFor()
 assert.equal(fixture.mutations.assignmentCommit,1);await open('manager',1440);await page.getByText('واگذاری ثبت شده است.',{exact:true}).waitFor();assert.equal(await btn('ثبت نهایی واگذاری').count(),0)
 await btn('آماده‌سازی تأیید رسید واگذاری').click();await btn('اجرای درخواست رزروشده').waitFor();await exec();await ack()
 await btn('رزرو درخواست واگذاری').waitFor();await fillAssignment('رزرو بدون پیش نویس')
 await btn('رزرو درخواست واگذاری').click();await refresh();await btn('ثبت نهایی واگذاری').waitFor()
 await open('manager',1440);await page.getByText('پیش‌نویس دقیق در این نشست موجود نیست؛ ثبت نهایی مجاز نیست.',{exact:true}).waitFor();assert.equal(await btn('ثبت نهایی واگذاری').count(),0)
 await btn('آماده‌سازی لغو واگذاری').click();await btn('اجرای درخواست رزروشده').waitFor();await exec();await ack()
 await btn('آماده‌سازی تأیید رسید واگذاری').click();await btn('اجرای درخواست رزروشده').waitFor();await exec();await ack()
 assert.equal(fixture.mutations.assignmentReserve,2);assert.equal(fixture.mutations.assignmentCommit,1);assert.equal(fixture.db.tasks.filter(t=>t.title==='واگذاری دقیق V4').length,1);assert.equal(fixture.db.tasks.filter(t=>t.title==='رزرو بدون پیش نویس').length,0)
 const aw=fixture.calls.filter(x=>x.name==='qa_window_api_assignment_v1');assert.equal(aw.length,4);assert.deepEqual(aw[0].args,aw[1].args);assert.deepEqual({...aw[0].args,p_action:'commit'},aw[2].args)
 console.log('PASS SWTB26_V4_ASSIGNMENT_SHARED_CURSOR_FRESH_CONTEXT')
 await btn('نیمسال و سهمیه‌ها').click();await page.getByRole('heading',{name:'سهمیه مشترک نمونه',exact:true}).waitFor();await snap('02-manager-term')
 assert.equal(await page.evaluate(()=>globalThis.__qaLegacyReads),0);assert.equal(await page.evaluate(()=>globalThis.__qaWriteAttempts),0)
 assert.equal(fixture.calls.some(x=>/capabilities_v[123]$|submit_v1$|start_v[123]$|review_v[123]$/.test(x.name)),false)
 assert.equal(blocked,0);assert.deepEqual(errors,[]);assert.deepEqual(fixtureErrors,[])
 console.log('PASS SWTB26_V4_FRESH_CONTEXT_RECOVERY_ALL_FIVE_OPERATIONS')
}catch(e){if(page){await page.screenshot({path:resolve(out,'failure.png'),fullPage:true}).catch(()=>{});const body=await page.locator('body').innerText().catch(()=>'<unavailable>');console.error('V4_BROWSER_FAILURE',body.slice(0,6000),JSON.stringify(errors),JSON.stringify(fixtureErrors));await writeFile(resolve(out,'failure.txt'),body)}throw e}
finally{await writeFile(resolve(out,'observations.json'),JSON.stringify({blocked,errors,fixtureErrors,mutations:fixture.mutations},null,2));await ctx?.close().catch(()=>{});await browser?.close().catch(()=>{});await server?.close().catch(()=>{})}
