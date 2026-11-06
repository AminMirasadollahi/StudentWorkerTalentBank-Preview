/* SWTB22 visual QA: feature-on Chrome, synthetic only, strict no external network. */
import assert from 'node:assert/strict'
import {mkdir} from 'node:fs/promises'
import {resolve} from 'node:path'
import {createServer} from 'vite'
import {chromium} from 'playwright'

process.env.VITE_SWTB22_WORK_POOL_FOCUS_UI='true'
const output=resolve('test-results/swtb22-manager-synthetic')
await mkdir(output,{recursive:true})
let server,browser,page
const errors=[]
let blocked=0
try{
 server=await createServer({configFile:resolve('tests/browser/vite.swtb22.config.mjs')})
 await server.listen()
 browser=await chromium.launch({headless:true,channel:'chrome',args:['--no-sandbox']})
 page=await browser.newPage({viewport:{width:1440,height:900},locale:'fa-IR'})
 page.on('pageerror',e=>errors.push(e.message))
 await page.route('**/*',route=>{
  const host=new URL(route.request().url()).hostname
  if(host==='127.0.0.1'||host==='localhost')return route.continue()
  blocked++
  return route.abort('blockedbyclient')
 })
 await page.goto('http://127.0.0.1:4179/tests/browser/swtb22-work-pool-smoke.html',
  {waitUntil:'domcontentloaded'})
 await page.locator('.swtb22-work-pool-commands').first().waitFor()
 assert.equal(await page.locator('nav[aria-label="بخش‌های فضای مدیریت"]').count(),1)
 assert.equal(await page.locator('.swtb22-kind-switch').count(),1)
 assert.equal(await page.locator('.ow-work-pool-editor[open]').count(),0)
 const initial=await page.locator('.ow-work-pool-columns').first().evaluate(node=>{
  const list=node.querySelector('.ow-work-pool-list')
  const parent=node.getBoundingClientRect(),rect=list.getBoundingClientRect()
  return {w:rect.width,parent:parent.width,rank:[...node.children].indexOf(list)}
 })
 assert.ok(initial.w>480,'list must not shrink into a narrow right-side form')
 assert.ok(initial.w>=initial.parent*0.75,'list should occupy most available width')
 assert.equal(initial.rank,1,'commands then list before the hidden editor')
 await page.screenshot({path:resolve(output,'01-empty-general-list-first.png'),fullPage:true})
 await page.getByRole('button',{name:'تعریف الگوی کار'}).first().click()
 await page.locator('.ow-work-pool-editor[open]').waitFor()
 assert.equal(await page.locator('.ow-work-pool-editor[open]').count(),1)
 assert.ok(await page.locator('.ow-work-pool-columns').first().evaluate(
  node=>[...node.children].indexOf(node.querySelector('.ow-work-pool-compose'))===1))
 await page.screenshot({path:resolve(output,'02-focused-general-editor.png'),fullPage:true})
 await page.getByRole('button',{name:'نوبت‌های زمان‌دار کتابخانه'}).click()
 await page.getByRole('heading',{name:'نوبت‌های میز کتابخانه'}).waitFor()
 assert.equal(await page.locator('.swtb22-kind-switch button[aria-pressed="true"]').count(),1)
 await page.screenshot({path:resolve(output,'03-empty-library-desk.png'),fullPage:true})
 await page.getByRole('button',{name:'تعریف الگوی نوبت'}).first().click()
 assert.equal(await page.locator('.ow-desk-pool-block details[open]').count(),1)
 await page.screenshot({path:resolve(output,'04-focused-library-editor.png'),fullPage:true})
 const result=await page.evaluate(()=>({writes:globalThis.__qaWriteAttempts,
  overflow:document.documentElement.scrollWidth>window.innerWidth+1}))
 assert.equal(result.writes,0,'rendering and switching must not call any mutation')
 assert.equal(result.overflow,false,'no horizontal viewport overflow at 1440px')
 assert.equal(blocked,0,'no external requests should occur')
 assert.deepEqual(errors,[],'no browser JavaScript errors')
 process.stdout.write('PASS SWTB22 synthetic Chrome: one grouped nav, full-width list, focused D1/D2 editors, no external calls/writes or viewport overflow\n')
}finally{
 await page?.close().catch(()=>{})
 await browser?.close().catch(()=>{})
 await server?.close().catch(()=>{})
}
