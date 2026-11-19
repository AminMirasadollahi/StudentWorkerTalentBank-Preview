/* Browser test for PROPOSED agreement consent only. Fake Ops APIs, no network.
 * The build flag is deliberately set ONLY in this isolated QA process.
 */
import assert from 'node:assert/strict'
import {mkdir} from 'node:fs/promises'
import {resolve} from 'node:path'
import {createServer} from 'vite'
import {chromium} from 'playwright'

process.env.VITE_SWTB15_OFFICIAL_CONSENT_UI='true'
const output=resolve('test-results/swtb15-official-synthetic')
await mkdir(output,{recursive:true})
let server,browser,page
const external=[],mutating=[],errors=[]
const passed=label=>process.stdout.write('SWTB15_OFFICIAL_CHROME_PASS='+label+'\n')
try{
 server=await createServer({configFile:resolve('tests/browser/vite.smoke.config.mjs')})
 await server.listen()
 browser=await chromium.launch({headless:true,channel:'chrome',args:['--no-sandbox']})
 page=await browser.newPage({viewport:{width:1440,height:900},locale:'fa-IR'})
 page.on('pageerror',e=>errors.push(e.message))
 page.on('request',req=>{
  if(!['GET','HEAD','OPTIONS'].includes(req.method()))mutating.push(req.method()+' '+req.url())
 })
 await page.route('**/*',route=>{
  const host=new URL(route.request().url()).hostname
  if(host==='127.0.0.1'||host==='localhost')return route.continue()
  external.push(route.request().url());return route.abort('blockedbyclient')
 })
 await page.goto('http://127.0.0.1:4177/tests/browser/worker-smoke.html')
 const launch=page.locator('.ow-b3-sidebar .swtb-agreement-official-launch')
 await launch.waitFor({state:'visible',timeout:18000})
 // First-login spotlight is an unrelated synthetic component; dismiss it.
 const welcome=page.locator('dialog.swtb-guide-welcome')
 if(await welcome.count()&&await welcome.isVisible())
  await welcome.getByRole('button',{name:'فعلاً نه'}).click()
 assert.match(await launch.innerText(),/نیازمند تأیید/)
 let dialog=page.locator('dialog.swtb-agreement-official-modal')
 assert.equal(await dialog.count(),0,'do not interrupt the initial worker guide')
 passed('no_automatic_dialog_collision_with_first_login_guide')

 await launch.click()
 await dialog.waitFor({state:'visible'})
 assert.equal(await dialog.evaluate(n=>n.matches(':modal')),true)
 assert.equal(await dialog.locator('.swtb-agreement-official-sections>li').count(),7)
 assert.ok((await dialog.innerText()).includes('00000000-0000-4000-8000-000000000001'))
 assert.ok((await dialog.innerText()).includes('۵۰ ساعت واقعی فرضی'))
 assert.equal(await dialog.locator('input[type="checkbox"]').isChecked(),false)
 const confirm=dialog.getByRole('button',{name:'تأیید و ثبت پذیرش همین نسخه'})
 assert.equal(await confirm.isDisabled(),true,'explicit unchecked consent')
 await page.screenshot({path:resolve(output,'01-official-unchecked-1440.png')})
 assert.equal(await page.evaluate(()=>globalThis.__qaAgreementAcceptCalls.length),0)
 passed('server_snapshot_exact_7_sections_unchecked_no_auto_accept')

 await dialog.locator('input[type="checkbox"]').check()
 await confirm.click()
 await page.waitForFunction(()=>document.querySelector('dialog.swtb-agreement-official-modal')
  ?.innerText.includes('پذیرش همین نسخه با موفقیت در سرور ثبت'))
 assert.equal(await dialog.locator('input[type="checkbox"]').count(),0)
 const accepted=await page.evaluate(()=>({
  calls:globalThis.__qaAgreementAcceptCalls,
  reads:globalThis.__qaAgreementReads,
  accepted:globalThis.__qaAgreementStatus.accepted,
  writes:globalThis.__qaWriteAttempts
 }))
 assert.deepEqual(accepted.calls,[{versionId:'00000000-0000-4000-8000-000000000001',
  digest:'a'.repeat(64)}])
 assert.equal(accepted.accepted,true)
 assert.ok(accepted.reads>=3,'read before display and read after receipt')
 assert.equal(accepted.writes,0,'no unrelated worker mutation')
 await page.screenshot({path:resolve(output,'02-synthetic-confirmed-receipt-1440.png')})
 passed('single_explicit_acceptance_and_authoritative_readback')

 await page.keyboard.press('Escape')
 await page.waitForFunction(()=>!document.querySelector('dialog.swtb-agreement-official-modal'))
 assert.ok(await launch.evaluate(node=>document.activeElement===node),
  'keyboard Escape returns focus')
 await page.evaluate(()=>{
  const s=globalThis.__qaAgreementStatus
  s.version_id='00000000-0000-4000-8000-000000000003'
  s.digest='b'.repeat(64)
  s.accepted=false;s.accepted_at=null
 })
 await launch.click()
 await dialog.waitFor({state:'visible'})
 assert.equal(await dialog.locator('input[type="checkbox"]').isChecked(),false,
  'a new server version must be freshly acknowledged')
 assert.equal(await confirm.isDisabled(),true)
 passed('new_version_resets_consent_and_preserves_read_only_access')

 await page.evaluate(()=>{globalThis.__qaAgreementMode='commit_then_throw'})
 await dialog.locator('input[type="checkbox"]').check()
 await confirm.click()
 await page.waitForFunction(()=>document.querySelector('dialog.swtb-agreement-official-modal')
  ?.innerText.includes('با وجود اختلال ارتباط، ثبت پذیرش همین نسخه در سرور تأیید شد'))
 assert.equal(await page.evaluate(()=>globalThis.__qaAgreementAcceptCalls.length),2,
  'uncertain response must not trigger an automatic second acceptance')
 passed('ambiguous_commit_then_network_error_reconciled_without_retry')
 await page.screenshot({path:resolve(output,'03-recovered-uncertain-response.png')})

 await page.keyboard.press('Escape')
 await page.waitForFunction(()=>!document.querySelector('dialog.swtb-agreement-official-modal'))
 await page.evaluate(()=>{
  globalThis.__qaAgreementStatus.document.status='draft'
  globalThis.__qaAgreementStatus.accepted=false
  globalThis.__qaAgreementStatus.accepted_at=null
 })
 await launch.click()
 await page.locator('.swtb-agreement-official-entry [role="alert"]')
  .waitFor({state:'visible'})
 assert.equal(await page.locator('dialog.swtb-agreement-official-modal').count(),0)
 assert.equal(await page.evaluate(()=>globalThis.__qaAgreementAcceptCalls.length),2)
 passed('draft_document_rejected_even_when_server_claims_published')

 assert.deepEqual(errors,[],'browser runtime errors')
 assert.deepEqual(external,[],'no production or external connections')
 assert.deepEqual(mutating,[],'no HTTP write requests')
 process.stdout.write('SWTB15_OFFICIAL_NATIVE_CHROME_PASS\n')
}catch(error){
 process.stderr.write('SWTB15_OFFICIAL_NATIVE_CHROME_FAIL '+(error.stack||error)+'\n')
 process.exitCode=1
}finally{
 await page?.close().catch(()=>{})
 await browser?.close().catch(()=>{})
 await server?.close().catch(()=>{})
}
