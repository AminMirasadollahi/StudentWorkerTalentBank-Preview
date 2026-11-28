// Actual production-mode OpsApp entry, fake operations module and fake RPCs only.
import assert from 'node:assert/strict'
import {mkdir,writeFile,mkdtemp,readFile,readdir,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {createRequire} from 'node:module'
import {resolve,join} from 'node:path'
import {build,preview} from 'vite'
const tool=process.env.SWTB23_BROWSER_TOOL_DIR
if(!tool)throw Error('BROWSER_TOOL_DIR_REQUIRED')
const {chromium}=createRequire(resolve(tool,'package.json'))('playwright')
const ref='pmwxryavkrjcdobwkryw'
for(const n of ['MANAGER_SHELL_UI','TASKS_FOCUS_UI','WORK_POOL_FOCUS_UI','REVIEW_FOCUS_UI','HISTORY_FOCUS_UI'])process.env['VITE_SWTB22_'+n]='true'
Object.assign(process.env,{NODE_ENV:'production',VITE_SWTB32_TYPED_ASSIGNMENT_RELEASE:'true',VITE_SWTB32_TYPED_RELEASE_PROJECT_REF:ref,VITE_SWTB32_TYPED_RELEASE_ID:'a'.repeat(40),VITE_SWTB28_STAGING_REVIEW_UI:'false',VITE_SWTB22_RECOVERY_REVIEW_UI:'false',VITE_SWTB22_RECOVERY_RELEASE_UI:'true',VITE_SWTB22_RECOVERY_RELEASE_PROJECT_REF:ref,VITE_SWTB23_WORKER_POLICY_RELEASE:'true',VITE_SWTB24_R5_MANAGER_IA_UI:'true',VITE_SWTB19_UNIFIED_WORK_UI:'true',VITE_SWTB21_WORK_POOL_UI:'true',VITE_SWTB21_TERM_MEMBERSHIP_UI:'false',VITE_SWTB18_PRESENCE_APPROVAL_UI:'false',VITE_SUPABASE_URL:'https://'+ref+'.supabase.co',VITE_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fake_build_only'})
const out=resolve('test-results/swtb32-typed-release-synthetic')
await mkdir(out,{recursive:true})
const root=await mkdtemp(join(tmpdir(),'swtb32-release-build-'))
let server,browser,context,page,blocked=0
const errors=[]
try{
 const configFile=resolve('tests/browser/vite.swtb27-opsapp.config.mjs'),entry='tests/browser/swtb32-typed-release-opsapp.html'
 await build({configFile,mode:'production',base:'/',build:{outDir:root,emptyOutDir:true,rollupOptions:{input:resolve(entry)}}})
 const assets=await readdir(join(root,'assets'));let found=false
 for(const a of assets.filter(a=>a.endsWith('.js'))){const s=await readFile(join(root,'assets',a),'utf8');assert.doesNotMatch(s,/SWTB28_STAGING_REVIEW_BLOCKED/);if(s.includes('TYPED_RELEASE_ADMISSION_BLOCKED'))found=true}
 assert.equal(found,true,'RELEASE_ENTRY_NOT_BUILT')
 server=await preview({configFile,mode:'production',base:'/',build:{outDir:root},preview:{host:'127.0.0.1',port:4189,strictPort:true}})
 browser=await chromium.launch({headless:true,channel:'chrome',args:['--no-sandbox','--disable-background-networking']})
 context=await browser.newContext({viewport:{width:1440,height:900},locale:'fa-IR',serviceWorkers:'block'})
 await context.route('**/*',r=>new URL(r.request().url()).origin==='http://127.0.0.1:4189'?r.continue():(blocked++,r.abort('blockedbyclient')))
 page=await context.newPage();page.on('pageerror',e=>errors.push(e.message))
 await page.goto('http://127.0.0.1:4189/'+entry,{waitUntil:'domcontentloaded'});await page.bringToFront()
 const button=name=>page.getByRole('button',{name,exact:true})
 const state=async n=>page.locator('[aria-label="مالک مشترک واگذاری"][data-state="'+n+'"]').waitFor({timeout:15000})
 const route=id=>page.locator('[data-swtb22-route="'+id+'"]')
 const calls=()=>page.evaluate(()=>globalThis.__qaTypedRelease.calls())
 const counts=()=>page.evaluate(()=>globalThis.__qaDayBatch.counts())
 await state('blocked');assert.equal(await button('+ تعریف کار').count(),0)
 assert.deepEqual((await calls()).map(x=>x.route),['ops_assignment_typed_release_status_v1'])
 await page.evaluate(()=>globalThis.__qaTypedRelease.ready(true))
 await button('بررسی مجدد دسترسی').click();await state('idle')
 await route('tasks').click();await state('idle')
 const common=button('+ تعریف کار'),dialog=page.getByRole('dialog',{name:'واگذاری مجموعه‌ای کارها'})
 await common.click();await page.getByRole('group',{name:'روش تخصیص کار'}).getByRole('button',{name:/واگذاری مجموعه‌ای/}).click();await dialog.waitFor()
 const batch=dialog.getByRole('region',{name:'پیش‌نمایش واگذاری مجموعه‌ای'})
 await batch.getByLabel('عنوان کار ۱',{exact:true}).fill('آزمون نسخه انتشار')
 await batch.getByLabel('دلیل اطلاع‌رسانی کوتاه (در صورت نیاز)').fill('آزمون مصنوعی')
 await batch.getByRole('checkbox',{name:'دانشجوکار الف',exact:true}).check()
 await button('بررسی تخصیص').click();await batch.getByTestId('batch-standard-total').waitFor()
 assert.equal(await button('ثبت آزمایشی مجموعه').count(),0)
 await page.evaluate(()=>globalThis.__qaDayBatch.lose('commit'))
 await button('ثبت مجموعه کارها').click();await state('unknown')
 await button('بستن و حفظ پیش‌نویس').click();await dialog.waitFor({state:'hidden'});await route('applicants').click();await state('committed')
 assert.match(await page.getByTestId('batch-receipt-summary').textContent(),/۱ تخصیص.*۶۰ دقیقه/)
 await page.locator('.swtb30-recovery-content[data-recovery-state="committed"]').screenshot({path:resolve(out,'batch-release-recovered.png')})
 await button('تأیید و بستن نتیجه').click();await state('idle')
 await route('tasks').click();await state('idle');await common.click();await page.getByRole('group',{name:'روش تخصیص کار'}).getByRole('button',{name:/واگذاری مستقیم/}).click()
 const direct=page.getByRole('dialog',{name:'واگذاری مستقیم کار جدید'});await direct.waitFor()
 await direct.getByLabel('واحد انجام کار',{exact:true}).selectOption('library')
 await direct.getByRole('button',{name:'استفاده از شرح وظیفه آماده',exact:true}).click()
 await direct.getByRole('button',{name:'لغو نوبت',exact:true}).click()
 await direct.getByLabel('علت لغو نوبت',{exact:true}).fill('لغو نوبت مصنوعی')
 await page.evaluate(()=>globalThis.__qaDayBatch.lose('commit'))
 await direct.getByRole('button',{name:'تأیید لغو نوبت',exact:true}).click();await state('unknown')
 await button('بستن و حفظ پیش‌نویس').click();await direct.waitFor({state:'hidden'});await route('applicants').click();await state('committed')
 await page.getByText('لغو نوبت و وظیفه مرتبط تأیید شد؛ این رسید تأیید ساعت نیست.',{exact:true}).waitFor()
 await page.locator('.swtb30-recovery-content[data-recovery-state="committed"]').screenshot({path:resolve(out,'desk-release-recovered.png')})
 await button('تأیید و بستن نتیجه').click();await state('idle')
 const c=await counts();assert.equal(c.reserves,2);assert.equal(c.commits,2);assert.equal(c.acks,2);assert.equal(c.deskReserves,1);assert.equal(c.deskCommits,1);assert.equal(c.legacyFallback,0)
 // Refresh with held contract: old owner loses authority; no legacy fallback.
 await page.evaluate(()=>{globalThis.__qaTypedRelease.ready(false);globalThis.__qaDayBatch.refresh()});await state('blocked');assert.equal(await common.count(),0)
 const all=await calls();assert.equal(all.some(x=>['ops_cancel_library_desk_shift','ops_assignment_recovery_write_v2','ops_assign_task'].includes(x.route)),false)
 for(let i=1;i<all.length;i++)if(all[i].route!=='ops_assignment_typed_release_status_v1')assert.equal(all.slice(0,i).some(x=>x.route==='ops_assignment_typed_release_status_v1'),true)
 assert.equal(blocked,0);assert.deepEqual(errors,[])
 await writeFile(resolve(out,'observations.json'),JSON.stringify({counts:c,requests:all,blocked,errors},null,2))
 console.log('PASS SWTB32_NORMAL_BUILD_TYPED_RELEASE_HELD_ADMITTED_BATCH_DESK_RECOVERY_NO_NETWORK')
}catch(e){console.error('SWTB32_RELEASE_CHROME_DIAGNOSTIC',JSON.stringify({errors,blocked,body:await page?.locator('body').innerText().catch(()=>null),calls:await page?.evaluate(()=>globalThis.__qaTypedRelease?.calls()).catch(()=>null)}));throw e}
finally{await context?.close().catch(()=>{});await browser?.close().catch(()=>{});await new Promise(r=>server?.httpServer?server.httpServer.close(r):r());await rm(root,{recursive:true,force:true})}
