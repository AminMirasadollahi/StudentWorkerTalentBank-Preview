/* SWTB15 — native Chrome, isolated RC6 informational charter preview.
 * No OpsApp, Auth, Supabase client, live RPC, real identities or deploy. */
import assert from 'node:assert/strict'
import {mkdir} from 'node:fs/promises'
import {resolve} from 'node:path'
import {createServer} from 'vite'
import {chromium} from 'playwright'

const output=resolve('test-results/swtb15-charter-readonly')
await mkdir(output,{recursive:true})
let server,browser,page
const browserErrors=[],externalAttempts=[],writeAttempts=[]
const url='http://127.0.0.1:4186/StudentWorkerTalentBank-Preview/charter-preview.html'
const expectModal=async()=>{
 await page.waitForFunction(()=>{
  const d=document.querySelector('dialog.swtb-policy-modal')
  return d?.open && d.matches(':modal')
 })
 assert.equal(await page.locator('dialog.swtb-policy-modal').count(),1)
}
const fit=async(label)=>{
 const rect=await page.locator('dialog.swtb-policy-modal').boundingBox()
 const v=page.viewportSize()
 assert.ok(rect&&v,label+': missing dialog/viewport')
 assert.ok(rect.x>=-1 && rect.y>=-1 &&
  rect.x+rect.width<=v.width+1 && rect.y+rect.height<=v.height+1,
  label+': dialog clipped by viewport '+JSON.stringify({rect,v}))
}
const log=label=>process.stdout.write('SWTB15_CHROME_PASS='+label+'\n')
try{
 server=await createServer({
  configFile:resolve('vite.config.js'),
  server:{host:'127.0.0.1',port:4186,strictPort:true},
  logLevel:'error',
 })
 await server.listen()
 browser=await chromium.launch({headless:true,channel:'chrome',args:['--no-sandbox']})
 page=await browser.newPage({viewport:{width:1440,height:900},locale:'fa-IR'})
 page.on('pageerror',error=>{
  browserErrors.push(error.message)
  process.stderr.write('SWTB15_CHROME_PAGEERROR='+error.message+'\n')
 })
 page.on('request',request=>{
  if(!['GET','HEAD','OPTIONS'].includes(request.method()))writeAttempts.push(request.url())
 })
 await page.route('**/*',route=>{
  const u=new URL(route.request().url())
  if(['127.0.0.1','localhost'].includes(u.hostname))return route.continue()
  externalAttempts.push(u.origin)
  return route.abort('blockedbyclient')
 })
 await page.goto(url,{waitUntil:'domcontentloaded'})
 await expectModal()
 await fit('1440x900 initial')
 const dialog=page.locator('dialog.swtb-policy-modal')
 assert.match(await dialog.innerText(),/نسخه ۱.۰/)
 assert.doesNotMatch(await dialog.innerText(),/پیش‌نمایش محتوایی/)
 assert.equal(await dialog.locator('li.swtb-policy-card').count(),7)
 assert.equal(await dialog.locator('[data-policy-section="finance"]').count(),1)
 assert.ok((await dialog.locator('.swtb-policy-quota-math').getAttribute('aria-label')).includes('50'))
 assert.equal(await dialog.locator('input[type="checkbox"]').count(),0)
 assert.equal(await dialog.getByRole('button',{name:'تأیید و شروع همکاری'}).count(),0)
 assert.match(await dialog.innerText(),/مطالعه این متن در سامانه به‌عنوان تأیید یا پذیرش ثبت نمی‌شود/)
 // Natural-height desktop pairings: no empty strip below a short card.
 const desktop=await dialog.evaluate(node=>{
  const ids=['learning','choice','presence','library-routine',
   'continuity','privacy','finance']
  const rectangles=Object.fromEntries(ids.map(id=>{
   const r=node.querySelector('[data-policy-section="'+id+'"]').getBoundingClientRect()
   return [id,{x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom}]
  }))
  return {columns:getComputedStyle(node.querySelector('.swtb-policy-masonry')).display,
   rectangles}
 })
 assert.equal(desktop.columns,'grid')
 assert.ok(desktop.rectangles.learning.x>desktop.rectangles.choice.x,
  'RTL first column should appear on the right')
 for(const [before,after] of [['learning','presence'],['presence','continuity'],
   ['choice','library-routine'],['library-routine','privacy']]){
  const gap=desktop.rectangles[after].y-desktop.rectangles[before].bottom
  assert.ok(gap>=5&&gap<=24,before+' -> '+after+' unwanted blank gap '+gap)
 }
 assert.ok(desktop.rectangles.finance.width>desktop.rectangles.learning.width*1.65,
  'financial example remains wide and legible')
 log('independent_height_columns_and_full_width_finance')

 await page.screenshot({path:resolve(output,'01-rc6-initial-1440.png')})
 log('initial_modal_readable_7_clauses_and_no_consent')

 const shellButton=page.locator('.swtb-policy-sidebar-actions button').last()
 const modalBody=dialog.locator('.swtb-policy-modal-body')
 const scroll=await modalBody.evaluate(node=>{
  node.scrollTop=node.scrollHeight
  return {top:node.scrollTop,height:node.scrollHeight,client:node.clientHeight}
 })
 assert.ok(scroll.height>scroll.client && scroll.top>0,'seven clauses require a working internal scroll')
 await dialog.getByRole('button',{name:'بستن پیش‌نمایش چارچوب همکاری'}).click()
 await page.waitForFunction(()=>!document.querySelector('dialog.swtb-policy-modal'))
 assert.ok(await shellButton.evaluate(node=>document.activeElement===node),
  'closing native modal must restore focus to the worker charter trigger')
 log('scroll_close_focus_restore')

 await shellButton.click()
 await expectModal()
 assert.equal(await dialog.locator('li.swtb-policy-card').count(),7)
 for(let i=0;i<12;i++){
  await page.keyboard.press('Tab')
  const focus=await page.evaluate(()=>{
   const d=document.querySelector('dialog.swtb-policy-modal')
   const a=document.activeElement
   return {
    dialogExists:!!d,dialogOpen:d?.open,topLayer:d?.matches(':modal'),
    activeTag:a?.tagName,activeClass:typeof a?.className==='string'?a.className:'',
    activeText:a?.textContent?.trim().slice(0,80),
    inside:!!a?.closest('dialog.swtb-policy-modal')
   }
  })
  process.stdout.write('SWTB15_CHROME_TAB_'+(i+1)+'='+JSON.stringify(focus)+'\n')
  assert.ok(focus.inside,'Tab '+(i+1)+' escaped native modal: '+JSON.stringify(focus))
 }
 await page.keyboard.press('Escape')
 await page.waitForFunction(()=>!document.querySelector('dialog.swtb-policy-modal'))
 assert.ok(await shellButton.evaluate(node=>document.activeElement===node),'Escape restores trigger focus')
 log('reopen_tab_containment_escape')

 await page.getByRole('button',{name:'نمایش چارچوب همکاری',exact:true}).click()
 await expectModal()
 await page.setViewportSize({width:1366,height:720})
 await fit('1366x720 laptop')
 await page.screenshot({path:resolve(output,'02-rc6-short-laptop-1366.png')})
 await page.setViewportSize({width:800,height:600})
 await fit('800x600 compact')
 const mobile=await dialog.evaluate(node=>
  ['learning','choice','presence','library-routine','continuity','privacy','finance']
   .map(id=>node.querySelector('[data-policy-section="'+id+'"]').getBoundingClientRect().y))
 assert.ok(mobile.every((y,i)=>i===0||y>mobile[i-1]),
  'compact 800px view must show sections in real numerical order: '+mobile)
 log('compact_numeric_order_1_to_7')

 await page.screenshot({path:resolve(output,'03-rc6-compact-800.png')})
 await dialog.getByRole('button',{name:'بستن پیش‌نمایش چارچوب همکاری'}).click()
 await page.waitForFunction(()=>!document.querySelector('dialog.swtb-policy-modal'))
 log('short_laptop_compact_viewport')

 // Now exercise the ACTUAL WorkerOperations sidebar using the pre-existing
 // synthetic fake API Vite fixture, never the real application login.
 await page.close()
 page=undefined
 await server.close()
 server=undefined
 server=await createServer({configFile:resolve('tests/browser/vite.smoke.config.mjs')})
 await server.listen()
 page=await browser.newPage({viewport:{width:1440,height:900},locale:'fa-IR'})
 page.on('pageerror',error=>{
  browserErrors.push(error.message)
  process.stderr.write('SWTB15_CHROME_PAGEERROR='+error.message+'\n')
 })
 page.on('request',request=>{
  if(!['GET','HEAD','OPTIONS'].includes(request.method()))writeAttempts.push(request.url())
 })
 await page.route('**/*',route=>{
  const u=new URL(route.request().url())
  if(['127.0.0.1','localhost'].includes(u.hostname))return route.continue()
  externalAttempts.push(u.origin)
  return route.abort('blockedbyclient')
 })
 const workerResponse=await page.goto('http://127.0.0.1:4177/tests/browser/worker-smoke.html',
  {waitUntil:'domcontentloaded'})
 process.stdout.write('SWTB15_WORKER_FIXTURE_HTTP='+workerResponse.status()+'\n')
 try{
  await page.locator('.ow-b3-sidebar').waitFor({state:'visible',timeout:12000})
 }catch(error){
  const fixture=await page.evaluate(()=>({
   title:document.title,rootLength:document.getElementById('root')?.innerHTML?.length||0,
   bodyText:document.body.innerText.slice(0,1300),
   hasSidebar:!!document.querySelector('.ow-b3-sidebar'),
   hasViteOverlay:!!document.querySelector('vite-error-overlay'),
  }))
  process.stderr.write('SWTB15_WORKER_FIXTURE_DIAGNOSTIC='+JSON.stringify(fixture)+'\n')
  throw error
 }
 process.stdout.write('SWTB15_WORKER_FIXTURE_SIDEBAR_RENDERED\n')
 const welcome=page.locator('dialog.swtb-guide-welcome')
 if(await welcome.count() && await welcome.isVisible())
  await welcome.getByRole('button',{name:'فعلاً نه'}).click()
 const triggers=page.locator('.ow-b3-sidebar .swtb-policy-sidebar-actions button')
 assert.equal(await triggers.count(),2,'genuine worker sidebar must display help and charter')
 const uiLayout=await triggers.first().evaluate(node=>{
  const group=node.parentElement
  const buttons=Array.from(group.querySelectorAll('button'))
  return {display:getComputedStyle(group).display,
   widths:buttons.map(button=>button.getBoundingClientRect().width),
   heights:buttons.map(button=>button.getBoundingClientRect().height),
   icons:buttons.map(button=>button.querySelector('svg')?.getBoundingClientRect().width)}
 })
 assert.equal(uiLayout.display,'grid','matching sidebar layout CSS must already be loaded')
 assert.ok(uiLayout.widths.every(w=>w>=50),'sidebar triggers must both remain readable')
 assert.ok(Math.abs(uiLayout.widths[0]-uiLayout.widths[1])<=2,
  'both sidebar buttons must have matching widths')
 assert.ok(Math.abs(uiLayout.heights[0]-uiLayout.heights[1])<=2,
  'both sidebar buttons must have matching heights')
 assert.ok(uiLayout.icons.every(w=>w>13&&w<25),
  'guide and charter must use equivalent vector icons')
 await triggers.last().click()
 await expectModal()
 assert.equal(await page.locator('dialog.swtb-policy-modal li.swtb-policy-card').count(),7)
 await page.screenshot({path:resolve(output,'04-rc6-real-worker-shell-fake-data.png')})
 await page.keyboard.press('Escape')
 await page.waitForFunction(()=>!document.querySelector('dialog.swtb-policy-modal'))
 assert.equal(await page.evaluate(()=>globalThis.__qaWriteAttempts),0)
 log('actual_worker_sidebar_dialog_and_no_fake_rpc_writes')

 assert.deepEqual(browserErrors,[],'browser runtime errors')
 assert.deepEqual(writeAttempts,[],'unexpected POST/PUT/PATCH/DELETE')
 assert.deepEqual(externalAttempts,[],'external network request was attempted')
 log('no_pageerror_no_mutating_or_external_requests')
 process.stdout.write('SWTB15_NATIVE_WORKER_CHARTER_CHROME_PASS\n')
}catch(error){
 process.stderr.write('SWTB15_NATIVE_WORKER_CHARTER_CHROME_FAIL '+(error?.stack||error)+'\n')
 process.exitCode=1
}finally{
 await page?.close().catch(()=>{})
 await browser?.close().catch(()=>{})
 await server?.close().catch(()=>{})
}
