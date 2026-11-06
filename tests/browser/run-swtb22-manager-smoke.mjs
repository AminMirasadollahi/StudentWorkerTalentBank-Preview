/* SWTB22 visual QA: feature-on Chrome, synthetic only, strict no external network. */
import assert from 'node:assert/strict'
import {mkdir} from 'node:fs/promises'
import {resolve} from 'node:path'
import {createServer} from 'vite'
import {chromium} from 'playwright'

process.env.VITE_SWTB22_WORK_POOL_FOCUS_UI='true'
process.env.VITE_SWTB22_TASKS_FOCUS_UI='true'
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
 // Candidate case-management visual QA uses only the fake in-memory records
 // from swtb22-work-pool-smoke.jsx; never the real candidate API.
 await page.locator('[data-swtb22-route="applicants"]').click()
 await page.locator('.swtb22-candidate-grid').waitFor()
 assert.equal(await page.locator('.swtb22-candidate-row').count(),3)
 assert.equal(await page.locator('[data-testid="swtb22-fake-candidate-detail"]').count(),0)
 const widths=await page.locator('.swtb22-candidate-grid').evaluate(grid=>{
  const list=grid.querySelector('.swtb22-candidate-directory').getBoundingClientRect()
  const detail=grid.querySelector('.swtb22-candidate-inspector').getBoundingClientRect()
  return {listWidth:list.width,detailWidth:detail.width,
   viewport:window.innerWidth,overflow:document.documentElement.scrollWidth>window.innerWidth+1}
 })
 assert.ok(widths.listWidth>=220,'candidate browser should remain scannable: '+JSON.stringify(widths))
 assert.ok(widths.detailWidth>=450,'candidate inspector must have room for review forms: '+JSON.stringify(widths))
 assert.equal(widths.overflow,false,'case-management browse must not overflow viewport')
 await page.screenshot({path:resolve(output,'06-candidate-directory-empty-inspector-1440.png'),fullPage:true})
 await page.locator('.swtb22-candidate-row').first().click()
 assert.equal(await page.locator('[data-testid="swtb22-fake-candidate-detail"]').count(),1)
 assert.equal(await page.locator('.swtb22-candidate-row[aria-pressed="true"]').count(),1)
 assert.ok(await page.locator('.swtb22-candidate-inspector-head h3').evaluate(
  el=>document.activeElement===el),'focused record title is reachable immediately')
 await page.screenshot({path:resolve(output,'07-candidate-inspector-selected-1440.png'),fullPage:true})
 await page.locator('.swtb22-candidate-toolbar input[type="search"]').fill('۱۴۰۳')
 assert.equal(await page.locator('.swtb22-candidate-row').count(),1)
 await page.getByRole('button',{name:'پاک‌کردن فیلترها'}).click()
 assert.equal(await page.locator('.swtb22-candidate-row').count(),3)
 await page.setViewportSize({width:1920,height:1080})
 const wide=await page.locator('.swtb22-candidate-grid').evaluate(grid=>{
  const i=grid.querySelector('.swtb22-candidate-inspector').getBoundingClientRect()
  return {detailWidth:i.width,horizontalOverflow:document.documentElement.scrollWidth>window.innerWidth+1}
 })
 assert.ok(wide.detailWidth>=640,'inspector should benefit from 1920px desktop space')
 assert.equal(wide.horizontalOverflow,false)
 await page.screenshot({path:resolve(output,'08-candidate-directory-1920.png'),fullPage:true})
 await page.setViewportSize({width:1440,height:900})
 // D3: load the actual manager task workspace (not a visual mock), all data
 // and RPCs replaced with the local, no-network Vite fake provider.
 await page.locator('[data-swtb22-route="tasks"]').click()
 await page.locator('.swtb22-task-directory .ow-task-results .ow-item').first().waitFor()
 assert.equal(await page.locator('.swtb22-task-directory .ow-task-results .ow-item').count(),3)
 assert.equal(await page.locator('#swtb22-task-assign-dialog[open]').count(),0)
 assert.equal(await page.locator('.swtb22-task-directory .ow-list-filters').count(),1)
 const taskWidth=await page.locator('.swtb22-task-directory .ow-task-results .ow-item').first().evaluate(node=>({
  card:node.getBoundingClientRect().width,
  parent:node.parentElement.getBoundingClientRect().width,
  horizontalOverflow:document.documentElement.scrollWidth>window.innerWidth+1,
 }))
 assert.ok(taskWidth.card>600,'task list should use main canvas: '+JSON.stringify(taskWidth))
 assert.ok(taskWidth.card>=taskWidth.parent*.9,'task card must not retain narrow width cap')
 assert.equal(taskWidth.horizontalOverflow,false)
 await page.screenshot({path:resolve(output,'09-task-list-1440.png'),fullPage:true})
 await page.getByRole('button',{name:'واگذاری کار جدید'}).click()
 await page.locator('#swtb22-task-assign-dialog[open]').waitFor()
 const dialogState=await page.locator('#swtb22-task-assign-dialog').evaluate(d=>({
  top:d.getBoundingClientRect().top,height:d.getBoundingClientRect().height,
  width:d.getBoundingClientRect().width,screen:window.innerHeight,
  focused:document.activeElement?.id==='swtb22-task-editor-heading',
 }))
 assert.ok(dialogState.width>650&&dialogState.height<dialogState.screen,
  'focused task editor must fit viewport and scroll internally: '+JSON.stringify(dialogState))
 assert.equal(dialogState.focused,true,'keyboard focus follows the active editor')
 await page.screenshot({path:resolve(output,'10-focused-task-assignment-1440.png')})
 await page.locator('#swtb22-task-assign-dialog input[maxlength="160"]').fill('پیش‌نویس ساختگی بدون ثبت')
 await page.getByRole('button',{name:'بستن و حفظ پیش‌نویس'}).click()
 assert.equal(await page.locator('#swtb22-task-assign-dialog[open]').count(),0)
 await page.getByRole('button',{name:'واگذاری کار جدید'}).click()
 assert.equal(await page.locator('#swtb22-task-assign-dialog input[maxlength="160"]').inputValue(),
  'پیش‌نویس ساختگی بدون ثبت')
 await page.getByRole('button',{name:'بستن و حفظ پیش‌نویس'}).click()
 await page.setViewportSize({width:1920,height:1080})
 assert.equal(await page.locator('.swtb22-task-directory .ow-task-results .ow-item').count(),3)
 assert.ok(await page.locator('.swtb22-task-directory .ow-task-results .ow-item').first().evaluate(
  node=>node.getBoundingClientRect().width>800),'task rows should use 1920px canvas')
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1),false)
 await page.screenshot({path:resolve(output,'11-task-list-1920.png'),fullPage:true})
 await page.setViewportSize({width:1440,height:900})
 const result=await page.evaluate(()=>({writes:globalThis.__qaWriteAttempts,
  overflow:document.documentElement.scrollWidth>window.innerWidth+1}))
 assert.equal(result.writes,0,'rendering and switching must not call any mutation')
 assert.equal(result.overflow,false,'no horizontal viewport overflow at 1440px')
 // Simulate the owner's long applicant list and actually scroll the Chrome window.
 await page.evaluate(()=>{
  const filler=document.createElement('div')
  filler.id='swtb22-long-page-fixture'
  filler.style.height='3500px'
  filler.setAttribute('aria-hidden','true')
  document.querySelector('.swtb22-manager-main').append(filler)
 })
 await page.evaluate(()=>window.scrollTo(0,1800))
 await page.waitForFunction(()=>window.scrollY>1000)
 const sticky=await page.locator('.swtb22-manager-sidebar').evaluate(el=>{
  const rect=el.getBoundingClientRect()
  return {
   top:rect.top,bottom:rect.bottom,scrollY:window.scrollY,
   viewport:window.innerHeight,
   overflowHtml:getComputedStyle(document.documentElement).overflowX,
   overflowBody:getComputedStyle(document.body).overflowX,
   overflowRoot:getComputedStyle(document.getElementById('root')).overflowX,
  }
 })
 assert.ok(Math.abs(sticky.top)<=2,'sidebar must remain at viewport top after scroll: '+JSON.stringify(sticky))
 assert.ok(sticky.bottom>=sticky.viewport-4,'sidebar must fill viewport: '+JSON.stringify(sticky))
 for(const key of ['overflowHtml','overflowBody','overflowRoot'])
  assert.equal(sticky[key],'clip','sticky ancestor overflow: '+key)
 await page.screenshot({path:resolve(output,'05-sticky-sidebar-after-scroll.png')})
 await page.getByRole('button',{name:'جمع‌کردن فهرست مدیریت'}).click()
 const collapsed=await page.locator('.swtb22-manager-sidebar').evaluate(el=>({
  top:el.getBoundingClientRect().top,collapsed:el.classList.contains('is-collapsed'),
 }))
 assert.ok(collapsed.collapsed,'sidebar collapse must work after scrolling')
 assert.ok(Math.abs(collapsed.top)<=2,'collapsed sidebar must remain pinned')
 assert.equal(blocked,0,'no external requests should occur')
 assert.deepEqual(errors,[],'no browser JavaScript errors')
 process.stdout.write('PASS SWTB22 synthetic Chrome: one grouped nav, full-width list, focused D1/D2 editors, no external calls/writes or viewport overflow\n')
}finally{
 await page?.close().catch(()=>{})
 await browser?.close().catch(()=>{})
 await server?.close().catch(()=>{})
}
