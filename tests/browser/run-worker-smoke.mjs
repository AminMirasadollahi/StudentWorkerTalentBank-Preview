/* Headless Chromium, zero real credentials, zero Supabase connections.
   Uses ONLY tests/browser/vite.smoke.config.mjs with mock imported RPCs. */
import assert from 'node:assert/strict'
import {mkdir} from 'node:fs/promises'
import {resolve} from 'node:path'
import {createServer} from 'vite'
import {chromium} from 'playwright'

const output=resolve('test-results/swtb7-desktop-browser')
await mkdir(output,{recursive:true})
let server, browser, page
let blocked=0
const check=async(label,fn)=>{
 await fn()
 process.stdout.write(`PASS browser: ${label}\n`)
}
const matchesModal=async selector=>page.locator(selector).evaluate(node=>node.matches(':modal'))
const waitFocus=selector=>page.waitForFunction(sel=>document.activeElement?.matches(sel),selector)
const bound=async selector=>{
 const rect=await page.locator(selector).boundingBox()
 assert.ok(rect,'dialog must have rendered bounding box')
 assert.ok(rect.x>=-1 && rect.y>=-1 &&
   rect.x+rect.width <=1441 && rect.y+rect.height<=901,
   `dialog must fit 1440×900 viewport, got ${JSON.stringify(rect)}`)
}
try{
 server=await createServer({configFile:resolve('tests/browser/vite.smoke.config.mjs')})
 await server.listen()
 browser=await chromium.launch({headless:true,channel:'chrome',args:['--no-sandbox']})
 page=await browser.newPage({viewport:{width:1440,height:900},locale:'fa-IR'})
 page.on('pageerror',err=>{process.stderr.write('Browser page error: '+err.message+'\n')})
 await page.route('**/*',route=>{
  const target=new URL(route.request().url())
  if(target.hostname==='127.0.0.1'||target.hostname==='localhost')return route.continue()
  blocked++
  return route.abort('blockedbyclient')
 })
 await page.goto('http://127.0.0.1:4177/tests/browser/worker-smoke.html',{waitUntil:'domcontentloaded'})
 await page.locator('.ow-worker-report-trigger').first().waitFor({state:'visible'})
 await check('SWTB9 settings live in B3 content column rather than above whole viewport',async()=>{
   await page.getByRole('button',{name:'تنظیمات حساب'}).click()
   const stage=page.locator('.ow-b3-stage')
   const panel=stage.locator('#ops-worker-account-settings')
   assert.equal(await panel.count(),1,'settings must be a direct descendant of content stage')
   const rects=await page.evaluate(()=>{
     const stage=document.querySelector('.ow-b3-stage').getBoundingClientRect()
     const aside=document.querySelector('.ow-b3-sidebar').getBoundingClientRect()
     const toolbar=document.querySelector('.ow-b3-toolbar').getBoundingClientRect()
     const panel=document.querySelector('#ops-worker-account-settings').getBoundingClientRect()
     return {stage,aside,toolbar,panel,viewport:innerWidth}
   })
   assert.ok(rects.panel.right<=rects.aside.left+2,'settings must not overlay sidebar')
   assert.ok(rects.panel.top>=rects.toolbar.bottom-1,'settings must sit below workspace toolbar')
   assert.ok(rects.panel.left>=rects.stage.left-2,'settings must remain in stage')
   await page.screenshot({path:resolve(output,'00-swtb9-settings-content-column.png')})
   await panel.getByRole('button',{name:'بستن'}).click()
   assert.equal(await stage.locator('#ops-worker-account-settings').count(),0)
   assert.equal(await page.evaluate(()=>window.__qaWriteAttempts),0)
 })
 await check('action-first desktop task surface and preserved future drilldown',async()=>{
  const hub=page.locator('.ow-worker-focus-switch')
  assert.equal(await hub.locator('button').count(),4)
  assert.ok((await hub.innerText()).includes('نیازمند اقدام'))
  assert.ok((await page.locator('.ow-worker-tasks').innerText()).includes('کار نمونهٔ امروز'))
  await page.screenshot({path:resolve(output,'00-synthetic-action-first-workspace.png')})
  await hub.locator('button').nth(2).click()
  assert.ok((await page.locator('.ow-worker-tasks').innerText()).includes('سال آینده'))
  await hub.locator('button').first().click()
  assert.ok((await page.locator('.ow-worker-tasks').innerText()).includes('کار نمونهٔ امروز'))
 })
 await check('B3 contextual task inspector opens on demand and Escape restores keyboard focus',async()=>{
  assert.equal(await page.locator('.ow-b3-inspector').count(),0)
  const trigger=page.locator('.ow-worker-task-workspace .ow-b3-inspect-trigger').first()
  await trigger.click()
  await page.locator('.ow-b3-inspector').waitFor({state:'visible'})
  assert.ok((await page.locator('.ow-b3-inspector').innerText()).includes('جزئیات کار'))
  await page.screenshot({path:resolve(output,'00b-synthetic-task-inspector.png')})
  await page.keyboard.press('Escape')
  assert.equal(await page.locator('.ow-b3-inspector').count(),0)
  assert.ok(await trigger.evaluate(node=>document.activeElement===node),'row trigger recovers focus')
 })
 await check('B3 1280 desktop list does not overflow with contextual inspector',async()=>{
  await page.setViewportSize({width:1280,height:900})
  await page.locator('.ow-worker-task-workspace .ow-b3-inspect-trigger').first().click()
  const width=await page.evaluate(()=>({
   scroll:document.documentElement.scrollWidth,client:document.documentElement.clientWidth
  }))
  assert.ok(width.scroll<=width.client+2,'desktop content must not horizontally overflow: '+JSON.stringify(width))
  await page.screenshot({path:resolve(output,'00c-synthetic-task-inspector-1280.png')})
  await page.keyboard.press('Escape')
  await page.setViewportSize({width:1440,height:900})
 })
 await check('task native top-layer, initial focus and desktop viewport',async()=>{
  await page.locator('.ow-worker-report-trigger').first().click()
  assert.ok(await matchesModal('.ow-worker-report-dialog'))
  await waitFocus('[data-task-dialog-heading]')
  await bound('.ow-worker-report-dialog')
  await page.screenshot({path:resolve(output,'01-synthetic-task-dialog.png')})
 })
 await check('task draft survives closing/reopening; Escape restores focus',async()=>{
  await page.locator('.ow-worker-report-dialog textarea[maxlength="2000"]')
   .fill('یادداشت کاملاً آزمایشی و ثبت‌نشده')
  await page.getByRole('button',{name:'بستن پنجره ثبت کار'}).click()
  assert.equal(await matchesModal('.ow-worker-report-dialog'),false)
  await page.locator('.ow-worker-report-trigger').first().click()
  assert.equal(await page.locator('.ow-worker-report-dialog textarea[maxlength="2000"]').inputValue(),
   'یادداشت کاملاً آزمایشی و ثبت‌نشده')
  for(let i=0;i<9;i++){
   await page.keyboard.press('Tab')
   const focus=await page.evaluate(()=>{
    const node=document.activeElement
    return {tag:node?.tagName,id:node?.id,role:node?.getAttribute('role'),
      className:typeof node?.className==='string'?node.className.slice(0,100):'',
      text:node?.textContent?.trim().slice(0,80)||'',
      inside:!!node?.closest('dialog.ow-worker-report-dialog'),
      modal:document.querySelector('dialog.ow-worker-report-dialog')?.matches(':modal'),
      otherInteractive:document.querySelector('.ow-profile-change-trigger')?.matches(':enabled')}
   })
   assert.ok(focus.inside,
    'native modal focus after Tab #'+i+': '+JSON.stringify(focus))
  }
  await page.keyboard.press('Escape')
  await page.waitForFunction(()=>!document.querySelector('dialog.ow-worker-report-dialog')?.open)
  await waitFocus('.ow-worker-report-trigger')
 })
 await check('profile correction dialog, retained draft and no submission',async()=>{
  await page.getByRole('button',{name:'حساب من'}).click()
  await page.locator('.ow-profile-change-trigger').click()
  assert.ok(await matchesModal('.ow-profile-action-dialog'))
  await waitFocus('[data-profile-dialog-heading]')
  await bound('.ow-profile-action-dialog')
  await page.locator('.ow-profile-change-form input').fill('پیشنهاد اصلاح آزمایشی')
  await page.getByRole('button',{name:'بستن پنجره اصلاح مشخصات'}).click()
  await page.locator('.ow-profile-change-trigger').click()
  assert.equal(await page.locator('.ow-profile-change-form input').inputValue(),
   'پیشنهاد اصلاح آزمایشی')
  await page.screenshot({path:resolve(output,'02-synthetic-profile-dialog.png')})
 })
 await check('protected role-recheck curtain hides even top-layer privileged dialog',async()=>{
  await page.evaluate(()=>window.__qaSetFrozen(true))
  await page.locator('dialog.ops-recheck-curtain').waitFor({state:'visible'})
  assert.ok(await matchesModal('dialog.ops-recheck-curtain'))
  assert.equal(await page.locator('.ow-profile-action-dialog').evaluate(n=>getComputedStyle(n).display),'none')
  await page.screenshot({path:resolve(output,'03-synthetic-privacy-curtain.png')})
  await page.evaluate(()=>window.__qaSetFrozen(false))
  await page.waitForFunction(()=>!document.querySelector('dialog.ops-recheck-curtain')?.open)
  assert.ok(await matchesModal('.ow-profile-action-dialog'),
   'same protected dialog should remain in session after safe recheck')
  await page.getByRole('button',{name:'بستن پنجره اصلاح مشخصات'}).click()
 })
 await check('unified profile correction and history modal preserves server status without writes',async()=>{
  await page.locator('.ow-profile-change-trigger').click()
  assert.ok(await matchesModal('.ow-profile-action-dialog'))
  await page.locator('.ow-b3-profile-tabs button').nth(1).click()
  assert.ok((await page.locator('.ow-profile-action-dialog').innerText()).includes('رشتهٔ آزمایشی'))
  assert.equal(await page.locator('.ow-profile-request-item').count(),3)
  for(const state of ['pending','approved','rejected']){
   const badge=page.locator('.ow-profile-request-status--'+state)
   assert.equal(await badge.count(),1,'manager review state: '+state)
  }
  assert.equal(await page.locator('.ow-profile-request-item__note').count(),3)
  await page.locator('.ow-profile-request-item__note summary').first().click()
  await bound('.ow-profile-action-dialog')
  await page.screenshot({path:resolve(output,'04-synthetic-request-history.png')})
  await page.locator('.ow-b3-profile-tabs button').first().click()
  assert.equal(await page.locator('.ow-profile-change-form input').inputValue(),
   'پیشنهاد اصلاح آزمایشی','unsent draft persists across tabs')
  await page.getByRole('button',{name:'بستن پنجره اصلاح مشخصات'}).click()
  assert.equal(await page.locator('.ow-profile-activity-links').count(),0,
   'profile must not repeat canonical sidebar sections')
 })
 await check('dedicated activity history shows actual status, credit and review feedback',async()=>{
  await page.getByRole('button',{name:'سوابق گزارش‌ها'}).click()
  const panel=page.locator('.ow-worker-history-panel')
  await panel.waitFor({state:'visible'})
  assert.equal(await panel.locator('.ow-history-entry').count(),3)
  assert.ok((await panel.innerText()).includes('مجموع زمان تأییدشده'))
  assert.ok((await panel.innerText()).includes('در انتظار بررسی'))
  assert.equal(await panel.locator('.ow-history-filter button').count(),5)
  await panel.locator('select[aria-label="فیلتر واحد گزارش‌های من"]').selectOption('research')
  assert.equal(await panel.locator('.ow-history-entry').count(),2,'two genuine research reports should remain')
  assert.ok((await panel.locator('.ow-history-entry').first().innerText()).includes('پژوهش'))
  await panel.locator('select[aria-label="فیلتر واحد گزارش‌های من"]').selectOption('')
  assert.equal(await panel.locator('.ow-history-entry').count(),3,'all report rows are restored')
  await page.screenshot({path:resolve(output,'04b-synthetic-report-history.png')})
  await panel.locator('.ow-history-filter button').nth(2).click()
  assert.equal(await panel.locator('.ow-history-entry').count(),1)
  await panel.locator('.ow-history-entry .ow-b3-inspect-trigger').click()
  assert.ok((await panel.locator('.ow-b3-inspector').innerText()).includes('نظر مدیر'))
  await page.screenshot({path:resolve(output,'04c-synthetic-report-inspector.png')})
  await panel.locator('.ow-history-next-step button').click()
  assert.ok(await page.locator('.ow-worker-task-workspace').isVisible())
 })
 await check('calendar date dialog visible, historical dates read-only',async()=>{
  await page.getByRole('button',{name:'زمان حضور'}).click()
  await page.locator('.ow-month-day.is-today').click()
  assert.ok(await matchesModal('.ow-presence-date-dialog'))
  await bound('.ow-presence-date-dialog')
  assert.equal(await page.locator('.ow-presence-date-dialog button[type="submit"]').count(),1)
  await page.screenshot({path:resolve(output,'05-synthetic-calendar-day.png')})
  await page.keyboard.press('Escape')
  await page.waitForFunction(()=>!document.querySelector('.ow-presence-date-dialog')?.open)
  await page.getByRole('button',{name:'ماه پیشین'}).click()
  await page.locator('.ow-month-grid .ow-month-day').first().click()
  assert.ok(await matchesModal('.ow-presence-date-dialog'))
  assert.ok((await page.locator('.ow-presence-date-dialog').innerText()).includes('فقط قابل مشاهده‌اند'))
  assert.equal(await page.locator('.ow-presence-date-dialog button[type="submit"]').count(),0)
  await page.screenshot({path:resolve(output,'06-synthetic-historical-day.png')})
  await page.keyboard.press('Escape')
 })
 await check('future tasks are findable and write/network counters remain zero',async()=>{
  await page.getByRole('button',{name:'کارهای من'}).click()
  await page.getByRole('button',{name:'آینده'}).click()
  assert.ok((await page.locator('.ow-worker-tasks').innerText()).includes('سال آینده'))
  assert.equal(await page.evaluate(()=>window.__qaWriteAttempts),0,
    'browser fixture must never issue a write, even to mock storage')
  assert.equal(blocked,0,'browser fixture must never attempt external network requests')
 })
 console.log('PASS: SWTB7 Chromium native-desktop smoke, isolated fake data, no backend/network writes')
}catch(error){
 if(page)try{await page.screenshot({path:resolve(output,'failure-synthetic.png')})}catch{}
 console.error('FAIL: SWTB7 native-desktop smoke',error)
 process.exitCode=1
}finally{
 await browser?.close()
 await server?.close()
}
