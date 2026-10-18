import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {chromium} from '@playwright/test'

// Offline browser security/UX regression: synthetic markup only, no site login,
// API endpoint, user data, business POST or network-backed navigation.
const css=await readFile(new URL('../src/ops.css',import.meta.url),'utf8')
const browser=await chromium.launch({headless:true})
try{
 await test('native showModal top-layer remains hidden and inert while refocus auth is pending, draft survives success',async()=>{
   const page=await browser.newPage({viewport:{width:1050,height:740}})
   try{
     await page.setContent(`<!doctype html><html><body>
       <div id="workspace" style="min-height:1800px"><h1 id="privileged">ONLY FOR AUTHORIZED ADMIN</h1>
        <dialog id="calendar" class="ow-assignment-dialog">
          <label>Pending task<input id="draft" value="unsent owner draft"></label>
          <button id="submit">TEST ONLY</button>
        </dialog>
       </div><div id="checking" class="ops-recheck-curtain" hidden role="status"><span class="ops-recheck-indicator">Checking identity</span></div>
     </body></html>`)
     await page.addStyleTag({content:css})
     await page.evaluate(()=>document.getElementById('calendar').showModal())
     await page.evaluate(()=>window.scrollTo(0,320))
     const initialScroll=await page.evaluate(()=>window.scrollY)
     assert.equal(await page.locator('#calendar').isVisible(),true)
     await page.evaluate(()=>{
       const w=document.getElementById('workspace')
       w.classList.add('ops-recheck-frozen')
       w.hidden=false
       w.inert=true
       w.setAttribute('aria-hidden','true')
       document.getElementById('checking').hidden=false
     })
     assert.equal(await page.locator('#calendar').isVisible(),false,
       'native top-layer modal must never be visible during authorization')
     assert.equal(await page.locator('#privileged').isVisible(),false)
     const security=await page.evaluate(()=>{
       const d=document.getElementById('calendar'), w=document.getElementById('workspace')
       return {modalOpen:d.open, modalDisplay:getComputedStyle(d).display,
         modalVisibility:getComputedStyle(d).visibility, wrapperHidden:w.hidden,
         wrapperInert:w.inert, a11yHidden:w.getAttribute('aria-hidden'),
         draft:document.getElementById('draft').value}
     })
     assert.equal(security.modalOpen,true)
     assert.equal(security.modalDisplay,'none')
     assert.equal(security.wrapperInert,true)
     assert.equal(security.wrapperHidden,false,'preserve geometry instead of display:none')
     assert.equal(await page.evaluate(()=>window.scrollY),initialScroll,'scroll position survives secure freeze')
     const masked=await page.evaluate(()=>{
       const w=document.querySelector('#workspace');return {visible:getComputedStyle(w).visibility,
         maskedAtCenter:document.elementFromPoint(innerWidth/2,innerHeight/2)?.closest('#checking')?.id}
     })
     assert.equal(masked.visible,'hidden','privileged stale DOM must never be rendered')
     assert.equal(masked.maskedAtCenter,'checking','fully opaque shield captures pointer region')
     assert.equal(security.a11yHidden,'true')
     assert.equal(security.draft,'unsent owner draft')
     await page.evaluate(()=>{
       const w=document.getElementById('workspace')
       w.classList.remove('ops-recheck-frozen')
       w.hidden=false;w.inert=false;w.removeAttribute('aria-hidden')
       document.getElementById('checking').hidden=true
     })
     assert.equal(await page.locator('#calendar').isVisible(),true)
     assert.equal(await page.evaluate(()=>window.scrollY),initialScroll)
     assert.equal(await page.locator('#draft').inputValue(),'unsent owner draft')
     assert.equal(await page.evaluate(()=>document.getElementById('calendar').open),true)
   }finally{await page.close()}
 })
 await test('revocation removes privileged dialog and its draft instead of re-enabling it',async()=>{
   const page=await browser.newPage()
   try{
     await page.setContent('<div id="workspace"><dialog id="secret"><input id="old-draft" value="private"></dialog></div><div id="check">Checking</div>')
     await page.addStyleTag({content:css})
     await page.evaluate(()=>{
       document.querySelector('#secret').showModal()
       const w=document.querySelector('#workspace')
       w.classList.add('ops-recheck-frozen');w.inert=true;w.setAttribute('aria-hidden','true')
     })
     assert.equal(await page.locator('#secret').isVisible(),false)
     await page.evaluate(()=>document.querySelector('#workspace').remove())
     assert.equal(await page.locator('#secret').count(),0)
   }finally{await page.close()}
 })
}finally{
 await browser.close()
}
