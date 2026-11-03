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
 await check('SWTB13 optional first-login welcome is accessible and skippable',async()=>{
  const welcome=page.locator('dialog.swtb-guide-welcome')
  await welcome.waitFor({state:'visible'})
  assert.equal(await welcome.evaluate(node=>node.matches(':modal')),true)
  assert.ok((await welcome.innerText()).includes('پنل دانشجوکار'))
  await page.screenshot({path:resolve(output,'07-guide-first-login-welcome.png')})
  await welcome.getByRole('button',{name:'فعلاً نه'}).click()
  assert.equal(await page.locator('dialog.swtb-guide-welcome').count(),0)
  const state=await page.evaluate(()=>localStorage.getItem('swtb-worker-guide:v1:SWTB_CHROMIUM_SYNTHETIC_WORKER'))
  assert.equal(state,'seen')
 })
 await check('SWTB9 settings live in B3 content column rather than above whole viewport',async()=>{
   await page.getByRole('button',{name:'تنظیمات حساب'}).click()
   const stage=page.locator('.ow-b3-stage')
   const panel=stage.locator('#ops-worker-account-settings')
   assert.equal(await panel.count(),1,'settings must remain inside the B3 content stage')
   assert.equal(await page.locator('.ow-self-profile #ops-worker-account-settings').count(),0,
     'B3 Account remains structurally untouched')
   assert.equal(await page.locator('.ow-self-profile').count(),0,
     'settings is an independent stage view, not injected into Tasks or Account')
   assert.equal((await page.locator('.ow-b3-breadcrumb strong').innerText()).trim(),'تنظیمات حساب',
     'Settings receives its own stage heading')
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
   assert.ok(await page.locator('.ow-worker-task-workspace').isVisible(),
     'closing settings returns to the original Tasks workspace')
   await page.getByRole('button',{name:'حساب من',exact:true}).click()
   assert.equal(await page.locator('.ow-self-profile').count(),1)
   assert.equal(await page.locator('.ow-self-profile .ops-account-settings-panel').count(),0)
   await page.getByRole('button',{name:'کارهای من',exact:true}).click()
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
  const taskDock=await page.locator('#ow-task-inspector').boundingBox()
  assert.ok(taskDock&&taskDock.y>=0&&taskDock.y<160,
    'task inspector immediately visible near top of viewport')
  assert.ok(taskDock.x>=0&&taskDock.x+taskDock.width<=1441)
  const taskArea=await page.locator('.ow-worker-task-workspace').boundingBox()
  assert.ok(taskArea && taskDock.x+taskDock.width+10<=taskArea.x,
    'task inspector has reserved lane without covering task panel')
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
  assert.equal(await panel.locator('.ow-unit-hours--combined').count(),1)
  assert.equal(await panel.locator('.ow-history-approved-total').count(),0,
    'no duplicate lifetime total card')
  assert.equal(await panel.locator('.ow-unit-hours__grid article').count(),3)
  assert.ok((await panel.locator('.ow-unit-hours--combined').innerText()).includes('مجموع تأییدشده'))
  assert.ok(!(await panel.innerText()).includes('سقف ساعت'),
    'internal quota configuration must not appear in worker view')
  assert.ok((await panel.innerText()).includes('در انتظار بررسی'))
  assert.equal(await panel.locator('.ow-history-filter button').count(),5)
  await panel.locator('select[aria-label="فیلتر واحد گزارش‌های من"]').selectOption('research')
  assert.equal(await panel.locator('.ow-history-entry').count(),2,'two genuine research reports should remain')
  assert.ok((await panel.locator('.ow-history-entry').first().innerText()).includes('پژوهش'))
  await panel.locator('select[aria-label="فیلتر واحد گزارش‌های من"]').selectOption('')
  assert.equal(await panel.locator('.ow-history-entry').count(),3,'all report rows are restored')
  await page.screenshot({path:resolve(output,'04b-synthetic-report-history.png')})
  await panel.locator('.ow-history-filter button').nth(1).click()
  assert.equal(await panel.locator('.ow-history-entry').count(),1)
  await panel.locator('select[aria-label="فیلتر واحد گزارش‌های من"]').selectOption('research')
  assert.equal(await panel.locator('.ow-history-entry').count(),0)
  const empty=panel.locator('.ow-history-empty')
  assert.ok((await empty.innerText()).includes('گزارشی با وضعیت انتخاب‌شده یافت نشد'))
  const widths=await page.evaluate(()=>{
    const list=document.querySelector('.ow-b3-ledger-list').getBoundingClientRect()
    const empty=document.querySelector('.ow-history-empty').getBoundingClientRect()
    return {list:list.width,empty:empty.width}
  })
  assert.ok(widths.empty>=widths.list-4,'empty state must span the whole ledger')
  await page.screenshot({path:resolve(output,'04ba-swtb10-empty-state.png')})
  await panel.locator('select[aria-label="فیلتر واحد گزارش‌های من"]').selectOption('')
  await panel.locator('.ow-history-filter button').nth(2).click()
  assert.equal(await panel.locator('.ow-history-entry').count(),1)
  await panel.locator('.ow-history-entry .ow-b3-inspect-trigger').click()
  assert.ok((await panel.locator('.ow-b3-inspector').innerText()).includes('نظر مدیر'))
  assert.equal(await panel.locator('.ow-b3-ledger-row.is-inspected').count(),1)
  const overflow=await panel.locator('#ow-report-inspector').evaluate(node=>({
    overflow:getComputedStyle(node).overflowY,maxHeight:getComputedStyle(node).maxHeight
  }))
  assert.ok(['auto','visible'].includes(overflow.overflow))
  const reportDock=await panel.locator('#ow-report-inspector').boundingBox()
  assert.ok(reportDock&&reportDock.y>=0&&reportDock.y<160,
    'report inspector immediately visible near top of viewport')
  assert.ok(reportDock.x>=0&&reportDock.x+reportDock.width<=1441)
  const reportArea=await panel.boundingBox()
  assert.ok(reportArea && reportDock.x+reportDock.width+10<=reportArea.x,
    'report inspector has reserved lane without covering hours and filters')
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
 await check('SWTB13 full guide follows all existing sections without stateful actions',async()=>{
  await page.locator('[data-swtb-guide="help-global"]').click()
  const tour=page.locator('dialog.swtb-guide-spotlight')
  await tour.waitFor({state:'visible'})
  assert.ok(await matchesModal('dialog.swtb-guide-spotlight'))
  assert.equal(await page.locator('dialog.ow-worker-report-dialog:modal').count(),0)
  const anchors=[
   'nav-tasks','tasks-status','tasks-list',
   'nav-availability','availability-week','availability-month',
   'nav-history','history-summary','history-controls',
   'nav-profile','profile-details','profile-correction',
  ]
  for(let i=0;i<anchors.length;i++){
   await page.waitForFunction(anchor=>{
    const popup=document.querySelector('.swtb-guide-popover')
    return popup?.offsetWidth>0 && popup.dataset.guideReady==='true'
      && !!document.querySelector('[data-swtb-guide="'+anchor+'"]')
      && !document.querySelector('.swtb-guide-error')
      && document.querySelector('dialog.swtb-guide-spotlight')?.matches(':modal')
   },anchors[i])
   const progress=(await tour.locator('.swtb-guide-progress').innerText()).trim()
   assert.ok(progress.includes('مرحله '+(i+1)+' از '+anchors.length),progress)
   assert.ok((await tour.locator('.swtb-guide-popover h2').innerText()).trim().length>2)
   const frame=await tour.locator('.swtb-guide-popover').boundingBox()
   assert.ok(frame&&frame.x>=0&&frame.y>=0&&frame.x+frame.width<=1441
    &&frame.y+frame.height<=901,'guide popover must fit viewport: '+JSON.stringify(frame))
   if(i===0||i===5||i===8||i===11)
    await page.screenshot({path:resolve(output,'07b-full-guide-'+String(i+1).padStart(2,'0')+'.png')})
   if(i===anchors.length-1)
    await tour.getByRole('button',{name:'شروع کار با سامانه'}).click()
   else await tour.getByRole('button',{name:'بعدی'}).click()
  }
  assert.equal(await tour.count(),0)
  assert.ok(await page.locator('.ow-worker-task-workspace').isVisible(),
   'closing the full tour restores the previous Tasks screen')
  assert.equal(await page.evaluate(()=>window.__qaWriteAttempts),0)
 })
 await check('SWTB13 local help can be replayed independently without a full tour',async()=>{
  const scopes=[
   ['tasks','کارهای من'],['availability','زمان حضور'],
   ['history','سوابق گزارش‌ها'],['profile','حساب من'],
  ]
  for(const [scope,caption] of scopes){
   await page.getByRole('button',{name:caption,exact:true}).click()
   await page.locator('[data-swtb-guide="help-'+scope+'"]').click()
   const tour=page.locator('dialog.swtb-guide-spotlight')
   await tour.waitFor({state:'visible'})
   await page.waitForFunction(()=>document.querySelector('.swtb-guide-popover')?.dataset.guideReady==='true')
   assert.ok((await tour.locator('.swtb-guide-progress').innerText()).includes('از 3'),
     'local scope '+scope+' must have exactly three guided steps')
   await tour.getByRole('button',{name:'بعدی'}).click()
   await page.waitForFunction(()=>document.querySelector('.swtb-guide-popover')?.dataset.guideReady==='true')
   assert.ok((await tour.locator('.swtb-guide-progress').innerText()).includes('مرحله 2 از 3'))
   await page.keyboard.press('Escape')
   assert.equal(await tour.count(),0)
   assert.ok(await page.locator('[data-swtb-guide="help-'+scope+'"]').isVisible())
  }
  await page.setViewportSize({width:1280,height:800})
  await page.getByRole('button',{name:'زمان حضور',exact:true}).click()
  await page.locator('[data-swtb-guide="help-availability"]').click()
  const mobileWidthTour=page.locator('dialog.swtb-guide-spotlight')
  await page.waitForFunction(()=>document.querySelector('.swtb-guide-popover')?.dataset.guideReady==='true')
  const narrowerFrame=await mobileWidthTour.locator('.swtb-guide-popover').boundingBox()
  assert.ok(narrowerFrame&&narrowerFrame.x>=0&&narrowerFrame.y>=0
    &&narrowerFrame.x+narrowerFrame.width<=1281&&narrowerFrame.y+narrowerFrame.height<=801)
  await page.screenshot({path:resolve(output,'07c-guide-contextual-1280.png')})
  for(let i=0;i<5;i++){
   await page.keyboard.press('Tab')
   const focused=await page.evaluate(()=>{
     const node=document.activeElement
     return {inside:!!(node?.matches?.('dialog.swtb-guide-spotlight')||
        node?.closest?.('dialog.swtb-guide-spotlight')),
        tag:node?.tagName,className:node?.className,
        text:node?.textContent?.trim()?.slice(0,45)}
   })
   assert.ok(focused.inside,'native guide modal focus target: '+JSON.stringify(focused))
  }
  await page.keyboard.press('Escape')
  await page.setViewportSize({width:1440,height:900})
  await page.reload({waitUntil:'domcontentloaded'})
  await page.locator('.ow-worker-task-workspace').waitFor({state:'visible'})
  assert.equal(await page.locator('.swtb-guide-welcome').count(),0,
   'skipped or finished intro must not prompt again in same account')
  assert.equal(await page.evaluate(()=>window.__qaWriteAttempts),0)
  assert.equal(blocked,0,'guide must remain usable with no external network')
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
