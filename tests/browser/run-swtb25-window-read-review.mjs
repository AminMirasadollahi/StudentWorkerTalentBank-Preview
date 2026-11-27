import assert from 'node:assert/strict'
import {mkdir,writeFile} from 'node:fs/promises'
import {createRequire} from 'node:module'
import {resolve} from 'node:path'
import {createServer} from 'vite'
import ExcelJS from 'exceljs'
const tool=process.env.SWTB23_BROWSER_TOOL_DIR
if(!tool)throw Error('BROWSER_TOOL_DIR_REQUIRED')
const {chromium}=createRequire(resolve(tool,'package.json'))('playwright')
const out=resolve('test-results/swtb25-window-read')
await mkdir(out,{recursive:true})
let server,browser,ctx,page,blocked=0
const errors=[],results={}
try{
 server=await createServer({configFile:resolve('tests/browser/vite.swtb25-window-read.config.mjs')});await server.listen()
 browser=await chromium.launch({headless:true,channel:'chrome',args:['--no-sandbox','--disable-background-networking']})
 ctx=await browser.newContext({viewport:{width:1440,height:900},locale:'fa-IR',serviceWorkers:'block',acceptDownloads:true})
 await ctx.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin==='http://127.0.0.1:4181'||u.protocol==='blob:')return route.continue();blocked++;return route.abort('blockedbyclient')})
 page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message))
 await page.clock.setFixedTime(new Date('2026-11-27T10:00:00Z'))
 await page.goto('http://127.0.0.1:4181/tests/browser/swtb25-window-read-review.html',{waitUntil:'domcontentloaded'})
 const snap=async name=>{assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,name+' overflow');await page.screenshot({path:resolve(out,name+'.png'),fullPage:true})}
 await page.getByRole('heading',{name:'مدیریت کارها و سوابق'}).waitFor()
 const rows=page.locator('.wr-row')
 assert.equal(await rows.count(),4)
 assert.equal(await rows.filter({hasText:'کار دارای گزارش خارج از فهرست'}).count(),0)
 await rows.filter({hasText:'گزارش فعالیت پژوهشی'}).click()
 const detail=page.getByRole('region',{name:'جزئیات انتخاب‌شده'})
 assert.match(await detail.innerText(),/تاریخ واقعی فعالیت/)
 assert.match(await detail.innerText(),/بازه انجام/)
 await snap('01-manager-history')
 const download=page.waitForEvent('download',{timeout:30000})
 await page.getByRole('button',{name:'خروجی Excel آزمایشی'}).click()
 const path=resolve(out,'manager-window-history.xlsx');await (await download).saveAs(path)
 const wb=new ExcelJS.Workbook();await wb.xlsx.readFile(path)
 assert.equal(wb.worksheets.length,2)
 const sh=wb.getWorksheet('ریز سوابق');assert.equal(sh.rowCount,5)
 const headers=sh.getRow(1).values
 const col=label=>{const i=headers.indexOf(label);assert.ok(i>0,label);return i}
 const date=col('تاریخ واقعی فعالیت (ISO)'),start=col('آغاز بازه (ISO)'),plan=col('روز برنامه‌ریزی (ISO)'),approved=col('زمان تأییدشده (دقیقه)')
 assert.equal(sh.getRow(2).getCell(date).value,'2026-11-27')
 assert.equal(sh.getRow(2).getCell(start).value,'2026-11-26')
 assert.ok([null,''].includes(sh.getRow(2).getCell(plan).value))
 assert.equal(sh.getRow(2).getCell(approved).value,120)
 assert.equal(sh.getRow(2).getCell(approved).numFmt,'0')
 assert.equal(sh.getRow(3).getCell(approved).value,null)
 results.xlsx=true
 await page.getByLabel('وضعیت',{exact:true}).selectOption('without_report')
 assert.equal(await rows.count(),3)
 await page.getByRole('button',{name:'از تاریخ سوابق',exact:true}).click()
 const calendar=page.getByRole('dialog',{name:'انتخاب تاریخ از تقویم شمسی'})
 await calendar.waitFor();await snap('02-jalali-picker')
 const isoLabel=new Intl.DateTimeFormat('fa-IR-u-ca-persian',{year:'numeric',month:'2-digit',day:'2-digit',timeZone:'UTC'}).format(new Date('2026-11-27T00:00:00Z'))
 await calendar.getByRole('button',{name:isoLabel,exact:true}).click()
 await page.getByRole('button',{name:'پاک کردن تاریخ آغاز'}).click()
 assert.equal(await rows.count(),3)
 results.filters=true
 await page.getByRole('button',{name:'نمای دانشجوکار',exact:true}).click()
 await page.getByRole('heading',{name:'کارهای من'}).waitFor()
 assert.equal(await page.locator('.wr-task-head').count(),2)
 assert.match(await page.locator('.wr-task-head').first().innerText(),/مرتب‌سازی کتاب‌ها/)
 await page.setViewportSize({width:390,height:844});await snap('03-worker-mobile-action')
 await page.getByRole('button',{name:/^آینده/}).click()
 assert.equal(await page.locator('.wr-task-head').count(),1)
 assert.match(await page.locator('.wr-task-head').innerText(),/تنظیم فهرست کارگاه‌ها/)
 await snap('04-worker-mobile-upcoming')
 await page.getByRole('button',{name:'نمای مدیر',exact:true}).click()
 await page.getByRole('heading',{name:'مدیریت کارها و سوابق'}).waitFor()
 await snap('05-manager-mobile')
 assert.equal(blocked,0);assert.deepEqual(errors,[]);results.mobile=true
 console.log('PASS SWTB25_WINDOW_READ_CHROME_XLSX_NO_EXTERNAL_REQUESTS')
}finally{await writeFile(resolve(out,'observations.json'),JSON.stringify({results,blocked,errors},null,2));await ctx?.close().catch(()=>{});await browser?.close().catch(()=>{});await server?.close().catch(()=>{})}
