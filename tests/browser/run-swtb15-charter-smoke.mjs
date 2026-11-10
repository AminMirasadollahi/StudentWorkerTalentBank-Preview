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
 page.on('pageerror',error=>browserErrors.push(error.message))
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
 assert.match(await dialog.innerText(),/1\.0-rc6/)
 assert.match(await dialog.innerText(),/پیش‌نمایش/)
 assert.equal(await dialog.locator('li.swtb-policy-card').count(),7)
 assert.equal(await dialog.locator('[data-policy-section="finance"]').count(),1)
 assert.ok((await dialog.locator('.swtb-policy-quota-math').getAttribute('aria-label')).includes('50'))
 assert.equal(await dialog.locator('input[type="checkbox"]').isDisabled(),true)
 assert.equal(await dialog.getByRole('button',{name:'تأیید و شروع همکاری'}).isDisabled(),true)
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
  assert.equal(await page.evaluate(()=>!!document.activeElement?.closest('dialog.swtb-policy-modal')),
   true,'Tab '+(i+1)+' escaped native modal')
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
 await page.screenshot({path:resolve(output,'03-rc6-compact-800.png')})
 await dialog.getByRole('button',{name:'بستن پیش‌نمایش چارچوب همکاری'}).click()
 await page.waitForFunction(()=>!document.querySelector('dialog.swtb-policy-modal'))
 log('short_laptop_compact_viewport')

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
