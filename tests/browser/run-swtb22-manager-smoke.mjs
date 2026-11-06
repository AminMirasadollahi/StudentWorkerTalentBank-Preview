/* SWTB22 visual QA: feature-on Chrome, synthetic only, strict no external network. */
import assert from 'node:assert/strict'
import {mkdir} from 'node:fs/promises'
import {resolve} from 'node:path'
import {createServer} from 'vite'
import {chromium} from 'playwright'

process.env.VITE_SWTB22_WORK_POOL_FOCUS_UI='true'
process.env.VITE_SWTB22_TASKS_FOCUS_UI='true'
process.env.VITE_SWTB22_PRESENCE_FOCUS_UI='true'
process.env.VITE_SWTB22_REVIEW_FOCUS_UI='true'
process.env.VITE_SWTB22_HISTORY_FOCUS_UI='true'
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
 // D4: real manager presence component, week/month + day/person inspector.
 await page.locator('[data-swtb22-route="availability"]').click()
 await page.locator('.swtb22-manager-teamcal .ow-teamcal-week-row').first().waitFor()
 assert.equal(await page.locator('.swtb22-manager-teamcal .ow-teamcal-week-row').count(),7)
 assert.ok(await page.locator('.swtb22-manager-teamcal .ow-teamcal-day').count()>=29)
 assert.equal(await page.locator('.swtb22-manager-teamcal dialog').count(),0,
  'manager group day inspector must be inline, unlike legacy worker popup')
 assert.equal(await page.locator('.swtb22-presence-day-inspector').count(),1)
 assert.equal(await page.locator('.ow-teamcal-day[aria-pressed="true"]').count(),1)
 assert.equal(await page.locator('.ow-teamcal-week-row[aria-pressed="true"]').count(),1)
 const presenceLayout=await page.locator('.swtb22-manager-teamcal').evaluate(root=>{
  const week=root.querySelector('.ow-teamcal-week').getBoundingClientRect()
  const aside=root.querySelector('.swtb22-presence-day-inspector').getBoundingClientRect()
  return {weekWidth:week.width,inspectorWidth:aside.width,
   sideBySide:week.right<=aside.left+4||aside.right<=week.left+4,
   overflow:document.documentElement.scrollWidth>window.innerWidth+1}
 })
 assert.ok(presenceLayout.weekWidth>430,'calendar needs a usable week/month column: '+JSON.stringify(presenceLayout))
 assert.ok(presenceLayout.inspectorWidth>260,'inspector must not be a collapsed sliver: '+JSON.stringify(presenceLayout))
 assert.equal(presenceLayout.sideBySide,true,'desktop day inspector sits beside the calendar')
 assert.equal(presenceLayout.overflow,false)
 await page.screenshot({path:resolve(output,'12-integrated-manager-week-month-day-1440.png'),fullPage:true})
 await page.getByRole('button',{name:'هفته بعد'}).click()
 assert.equal(await page.locator('.ow-teamcal-day[aria-pressed="true"]').count(),1)
 assert.equal(await page.locator('.ow-teamcal-week-row[aria-pressed="true"]').count(),1)
 await page.screenshot({path:resolve(output,'13-selected-future-day-inspector-1440.png'),fullPage:true})
 const currentInspectorLabel=await page.locator('.swtb22-presence-day-inspector h3').textContent()
 await page.locator('.swtb22-presence-person-actions button:not([disabled])').first().click()
 await page.locator('dialog.ow-presence-date-dialog[open]').waitFor()
 assert.equal(await page.locator('.swtb22-manager-teamcal').count(),0,
  'person/date editor is shown only after an explicit user selection')
 assert.equal(await page.locator('dialog.ow-presence-date-dialog[open]').count(),1)
 assert.match(await page.locator('#ow-presence-day-dialog-title').textContent(),/برنامه و تغییرات روز/)
 await page.screenshot({path:resolve(output,'14-existing-date-edit-dialog-opened-from-person.png')})
 await page.locator('dialog.ow-presence-date-dialog[open]').getByRole('button',{name:'بستن'}).click()
 await page.getByRole('button',{name:'بازگشت به برنامه همه دانشجوکارها'}).click()
 assert.equal(await page.locator('.swtb22-manager-teamcal').count(),1)
 assert.equal(await page.locator('.ow-teamcal-day[aria-pressed="true"]').count(),1)
 assert.equal(await page.locator('.swtb22-presence-day-inspector h3').textContent(),currentInspectorLabel,
  'return to group restores exact selected day and context')
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1),false)
 await page.setViewportSize({width:1920,height:1080})
 assert.ok(await page.locator('.swtb22-presence-day-inspector').evaluate(
  el=>el.getBoundingClientRect().width>340))
 await page.screenshot({path:resolve(output,'15-integrated-manager-presence-1920.png'),fullPage:true})
 await page.setViewportSize({width:1440,height:900})
 // D5: real manager approvals / inbox / selected worker review / term roster.
 // Every entry is fake; getAdminWorkV2 and the term RPC are replaced by Vite
 // before module resolution. Network outside localhost remains blocked.
 await page.locator('[data-swtb22-route="approvals"]').click()
 await page.locator('.swtb22-review-workspace .swtb22-review-row').first().waitFor()
 assert.equal(await page.locator('.swtb22-review-workspace .swtb22-review-row').count(),2)
 assert.equal(await page.locator('.swtb22-review-inspector .ow-item').count(),0)
 const approvalWidths=await page.locator('.swtb22-review-workspace').evaluate(node=>{
  const directory=node.querySelector('.swtb22-review-directory').getBoundingClientRect()
  const inspector=node.querySelector('.swtb22-review-inspector').getBoundingClientRect()
  return {directory:directory.width,inspector:inspector.width,
   overflow:document.documentElement.scrollWidth>window.innerWidth+1}
 })
 assert.ok(approvalWidths.directory>190,'review directory must be scannable')
 assert.ok(approvalWidths.inspector>420,'one active review form must be comfortable at 1440px')
 assert.equal(approvalWidths.overflow,false)
 await page.screenshot({path:resolve(output,'16-manager-approval-queue-empty-inspector.png'),fullPage:true})
 await page.locator('.swtb22-review-row').first().click()
 assert.equal(await page.locator('.swtb22-review-inspector .ow-item').count(),1)
 assert.equal(await page.locator('.swtb22-review-row[aria-pressed="true"]').count(),1)
 assert.ok(await page.locator('.swtb22-review-inspector-head h3').evaluate(
  el=>document.activeElement===el),'focus must follow only chosen review')
 assert.equal(await page.locator('.ow-approval-detail>summary').count(),0)
 await page.screenshot({path:resolve(output,'17-manager-selected-time-approval.png'),fullPage:true})
 await page.locator('[aria-label="فیلتر نوع درخواست زمان"]').selectOption('extra')
 assert.equal(await page.locator('.swtb22-review-row').count(),1)
 await page.locator('[data-swtb22-route="inbox"]').click()
 await page.locator('.swtb22-review-workspace .swtb22-review-row').first().waitFor()
 assert.equal(await page.locator('.swtb22-review-row').count(),3)
 assert.equal(await page.locator('.ow-profile-request').count(),0,
  'unselected candidate corrections must not mount sensitive decision forms')
 await page.locator('.swtb22-review-row').first().click()
 assert.equal(await page.locator('.swtb22-review-inspector .ow-profile-request').count(),1)
 await page.screenshot({path:resolve(output,'18-manager-inbox-selected-profile-correction.png'),fullPage:true})
 await page.locator('[data-swtb22-route="profiles"]').click()
 await page.locator('.ow-people-directory button').first().click()
 await page.locator('.swtb22-profile-review .swtb22-review-row').first().waitFor()
 assert.equal(await page.locator('.swtb22-profile-review .swtb22-review-row').count(),2)
 assert.equal(await page.locator('.swtb22-profile-review .ow-profile-request').count(),0)
 await page.screenshot({path:resolve(output,'19-manager-worker-profile-review-directory.png'),fullPage:true})
 await page.locator('[data-swtb22-route="termMemberships"]').click()
 await page.locator('.swtb22-membership-roster-tools').waitFor()
 assert.equal(await page.locator('.ow-membership-table tbody tr').count(),2)
 await page.locator('[aria-label="فیلتر مجوز همکاری نیمسال"]').selectOption('unknown')
 assert.equal(await page.locator('.ow-membership-table tbody tr').count(),1)
 assert.equal(await page.locator('dialog[open]').count(),0)
 assert.equal(await page.evaluate(()=>globalThis.__qaWriteAttempts),0)
 await page.screenshot({path:resolve(output,'20-manager-term-access-unknown-filter.png'),fullPage:true})
 await page.setViewportSize({width:1920,height:1080})
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1),false)
 await page.screenshot({path:resolve(output,'21-manager-term-access-1920.png'),fullPage:true})
 await page.setViewportSize({width:1440,height:900})
 // D6A: the genuine manager history component, source-aligned time aggregates
 // and a real ExcelJS workbook generated by the browser from fake-only records.
 await page.locator('[data-swtb22-route="history"]').click()
 await page.locator('.swtb22-history-browser .swtb22-history-row').first().waitFor()
 assert.equal(await page.locator('.swtb22-history-row').count(),4)
 assert.equal(await page.locator('.swtb22-history-inspector .swtb22-history-detail').count(),0)
 assert.equal(await page.locator('.swtb22-history-scope-metrics>div').count(),4)
 assert.match(await page.locator('.swtb22-history-scope-metrics').textContent(),/۱ ساعت و ۱۰ دقیقه|۷۰ دقیقه/)
 assert.equal(await page.locator('.swtb22-history-unreported').count(),1)
 assert.equal(await page.locator('.swtb22-history-lifetime[open]').count(),0,
  'independent lifetime server metric starts behind disclosure')
 const reportWidths=await page.locator('.swtb22-history-browser').evaluate(root=>{
  const list=root.querySelector('.swtb22-history-directory').getBoundingClientRect()
  const inspector=root.querySelector('.swtb22-history-inspector').getBoundingClientRect()
  return {list:list.width,inspector:inspector.width,
   overflows:document.documentElement.scrollWidth>window.innerWidth+1}
 })
 assert.ok(reportWidths.list>180,'read-only history directory must remain usable')
 assert.ok(reportWidths.inspector>460,'focused report inspector must remain readable at desktop width')
 assert.equal(reportWidths.overflows,false)
 await page.screenshot({path:resolve(output,'22-d6a-history-unselected-1440.png'),fullPage:true})
 await page.locator('.swtb22-history-row').first().click()
 assert.equal(await page.locator('.swtb22-history-row[aria-pressed="true"]').count(),1)
 assert.equal(await page.locator('.swtb22-history-detail').count(),1)
 assert.ok(await page.locator('.swtb22-history-inspector-head h3').evaluate(
  el=>document.activeElement===el))
 assert.match(await page.locator('.swtb22-history-detail').textContent(),/زمان تأییدشده/)
 await page.screenshot({path:resolve(output,'23-d6a-history-selected-1440.png'),fullPage:true})
 await page.getByRole('button',{name:'بستن جزئیات'}).click()
 assert.equal(await page.locator('.swtb22-history-detail').count(),0)
 const downloadEvent=page.waitForEvent('download')
 await page.getByRole('button',{name:'خروجی Excel سوابق بارگذاری‌شده'}).click()
 const downloaded=await downloadEvent
 assert.match(downloaded.suggestedFilename(),/^swtb-manager-history-loaded\.xlsx$/)
 const ExcelJS=(await import('exceljs'))
 const book=new ExcelJS.Workbook()
 await book.xlsx.readFile(await downloaded.path())
 assert.deepEqual(book.worksheets.map(sh=>sh.name),['دامنه و جمع‌بندی','ریز سوابق'])
 const exported=book.getWorksheet('ریز سوابق')
 assert.equal(exported.rowCount,6,'four reports and one report-free task, plus header')
 const rows=[...exported._rows].slice(1).filter(Boolean)
 assert.equal(rows.filter(row=>typeof row.getCell(8).value==='number')
  .reduce((sum,row)=>sum+row.getCell(8).value,0),70)
 assert.equal(rows.some(row=>row.getCell(1).value==='گزارش با کار نامشخص'),true)
 assert.equal(rows.some(row=>row.getCell(1).value==='کار بدون گزارش'),true)
 assert.equal(rows.some(row=>String(row.getCell(13).value).startsWith("'=HYPERLINK")),true,
  'notes starting with spreadsheet formula marker must stay inert text')
 await page.locator('.swtb22-history-filter-disclosure>summary').click()
 await page.locator('.swtb22-history-filter-disclosure .ow-history-extra select').first().selectOption('library')
 assert.equal(await page.locator('.swtb22-history-row').count(),2)
 assert.equal(await page.locator('.swtb22-history-scope-metrics').textContent()
  .then(s=>s.includes('۴۵ دقیقه')),true)
 await page.screenshot({path:resolve(output,'24-d6a-history-filtered-1440.png'),fullPage:true})
 await page.getByRole('button',{name:'پاک‌کردن همه فیلترها'}).click()
 assert.equal(await page.locator('.swtb22-history-row').count(),4)
 await page.setViewportSize({width:1920,height:1080})
 const wideReport=await page.locator('.swtb22-history-browser').evaluate(root=>({
  inspector:root.querySelector('.swtb22-history-inspector').getBoundingClientRect().width,
  overflow:document.documentElement.scrollWidth>window.innerWidth+1,
 }))
 assert.ok(wideReport.inspector>600,'read-only detail should grow at 1920px')
 assert.equal(wideReport.overflow,false)
 await page.screenshot({path:resolve(output,'25-d6a-history-1920.png'),fullPage:true})
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
