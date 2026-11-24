/* Actual worker shell + actual pool components, isolated fake RPCs only. */
import assert from 'node:assert/strict'
import {resolve} from 'node:path'
import {createServer} from 'vite'
import {chromium} from 'playwright'

const A='SWTB_CHROMIUM_SYNTHETIC_WORKER',B='SWTB21_SYNTHETIC_OTHER'
let browser
try{
 browser=await chromium.launch({headless:true,channel:'chrome',args:['--no-sandbox']})
 for(const mode of ['unified','legacy','off']){
  process.env.VITE_SWTB21_WORK_POOL_UI=mode==='off'?'false':'true'
  process.env.VITE_SWTB19_UNIFIED_WORK_UI=mode==='unified'?'true':'false'
  process.env.VITE_SWTB21_DESK_POOL_UI='true'
  let server,page
  const errors=[],external=[]
  try{
   server=await createServer({configFile:resolve('tests/browser/vite.smoke.config.mjs')})
   await server.listen()
   page=await browser.newPage({viewport:{width:1440,height:900},locale:'fa-IR'})
   page.on('pageerror',error=>errors.push(error.message))
   await page.route('**/*',route=>{
    const u=new URL(route.request().url())
    if(u.hostname==='127.0.0.1'||u.hostname==='localhost')return route.continue()
    external.push(u.hostname);return route.abort()
   })
   await page.addInitScript(({A,B})=>{
    for(const id of [A,B])localStorage.setItem('swtb-worker-guide:v1:'+id,'suppressed')
   },{A,B})
   await page.goto('http://127.0.0.1:4177/tests/browser/worker-smoke.html',{waitUntil:'domcontentloaded'})
   await page.locator('.ow-worker-tasks .ow-item').first().waitFor()
   await page.evaluate(({A,B,mode})=>{
    const today=globalThis.__qaWorkerData.tasks[0].planned_date
    const date=mode==='unified'?'2099-03-02':today
    const item=(id,title,date)=>({id,title,date,end_date:date,description:'SYNTHETIC_'+id,
     allocation_mode:mode==='unified'?'fixed':'legacy',unit:'library',estimated_minutes:60,
     remaining_minutes:120,min_share_minutes:60,max_share_minutes:60,share_step_minutes:1,
     remaining:2,priority:3,claim_deadline:date,claimable:true,my_task_id:null})
    globalThis.__qaPoolState={
     [A]:{general:[item('A-GENERAL','فرصت ساختگی الف',date),item('A-LATE','فرصت پاسخ دیرهنگام',date)],
      desk:[{...item('A-DESK','نوبت ساختگی الف',today),deadline:today,start_minute:480,end_minute:540,
       remaining_offer:2,remaining_global_desk:2,remaining_effective:2}]},
     [B]:{general:[item('B-GENERAL','فرصت ساختگی ب',date)],desk:[]},
    }
   },{A,B,mode})
   const nav=page.locator('.ow-worker-workspace-switch')
   const route=page.locator('[data-swtb-guide="nav-workPool"]')
   const pool=page.locator('[data-swtb-guide="work-pool-list"]')
   const opportunities=()=>nav.getByRole('button',{name:'فرصت‌های قابل انتخاب',exact:true})
   const tasks=()=>nav.getByRole('button',{name:'کارهای واگذارشده و انتخاب‌شده',exact:true})
   const card=title=>pool.locator('article.ow-work-pool-item').filter({hasText:title})
   const calls=()=>page.evaluate(()=>globalThis.__qaClaimCalls)
   if(mode==='off'){
    assert.equal(await nav.count(),0)
    assert.equal(await route.count(),0)
    await page.evaluate(()=>globalThis.__qaSetNav({section:'workPool',taskRange:'today'}))
    await page.locator('.ow-worker-tasks .ow-item').first().waitFor()
    assert.equal(await pool.count(),0)
    assert.equal(await page.evaluate(()=>globalThis.__qaPoolReads),0)
   }else{
    assert.equal(await pool.count(),0,'no pool read or mount before entry')
    await opportunities().click()
    await card('فرصت ساختگی الف').waitFor()
    await card('نوبت ساختگی الف').waitFor()
    assert.equal(await pool.count(),1)
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2),false)
    if(mode==='unified'){
     await card('فرصت ساختگی الف').getByRole('button',{name:'مشاهده جزئیات'}).click()
     await page.locator('#swtb19-worker-inspector').waitFor()
     assert.match(await page.locator('#swtb19-worker-inspector').innerText(),/SYNTHETIC_A-GENERAL/)
     await page.keyboard.press('Escape')
     assert.equal(await page.locator('#swtb19-worker-inspector').count(),0)
    }
    await pool.locator('[data-swtb-guide="help-workPool"]').click()
    await page.locator('dialog.swtb-guide-spotlight').waitFor()
    await page.locator('dialog.swtb-guide-spotlight .swtb-guide-close').click()
    assert.ok(await pool.isVisible())
    assert.equal((await calls()).length,0)
    await page.evaluate(()=>globalThis.__qaClaimMode='reject')
    await card('فرصت ساختگی الف').getByRole('button',{name:'انتخاب این کار'}).click()
    const retry=()=>card('فرصت ساختگی الف').getByRole('button',{name:'تلاش مجدد با همان شناسه'})
    await retry().waitFor()
    assert.ok(await retry().isDisabled())
    await tasks().click()
    assert.equal(await pool.isVisible(),false)
    await route.click()
    await retry().waitFor()
    assert.ok(await retry().isDisabled())
    assert.equal((await calls()).length,1)
    await page.evaluate(()=>{globalThis.__qaWorkerDenied=true;globalThis.__qaRefresh()})
    await page.locator('.ow-access-recheck').waitFor()
    assert.equal(await page.getByText('SYNTHETIC_A-GENERAL',{exact:true}).count(),0)
    await page.evaluate(()=>globalThis.__qaWorkerDenied=false)
    await page.getByRole('button',{name:'تلاش مجدد برای دریافت اطلاعات'}).click()
    await retry().waitFor()
    assert.ok(await retry().isDisabled())
    await card('فرصت ساختگی الف').getByRole('button',{name:/بررسی (نتیجه|وضعیت) از سرور/}).click()
    await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(x=>x.textContent.includes('تلاش مجدد با همان شناسه')&&!x.disabled))
    await retry().click()
    await page.locator('#ow-task-inspector').waitFor()
    assert.match(await page.locator('#ow-task-inspector').innerText(),/فرصت ساختگی الف/)
    const retried=await calls()
    assert.equal(retried.length,2)
    assert.deepEqual(retried[0],retried[1],'same request ID and payload')
    assert.equal(await pool.isVisible(),false)
    assert.equal(await page.locator('.ow-worker-focus-switch button[aria-current="true"]').textContent().then(x=>x.includes(mode==='unified'?'پیش‌رو':'نیازمند اقدام')),true)
    await opportunities().click()
    await card('نوبت ساختگی الف').waitFor()
    await page.evaluate(()=>globalThis.__qaClaimMode='lost')
    await card('نوبت ساختگی الف').getByRole('button',{name:'انتخاب این نوبت'}).click()
    await card('نوبت ساختگی الف').getByRole('button',{name:'بررسی نتیجه از سرور'}).waitFor()
    await tasks().click()
    await opportunities().click()
    await card('نوبت ساختگی الف').getByRole('button',{name:'بررسی نتیجه از سرور'}).click()
    await page.locator('#ow-task-inspector').waitFor()
    assert.match(await page.locator('#ow-task-inspector').innerText(),/نوبت ساختگی الف/)
    assert.equal((await calls()).length,3,'desk lost response reconciled without a second claim')
    await opportunities().click()
    await card('فرصت پاسخ دیرهنگام').waitFor()
    await page.evaluate(()=>globalThis.__qaClaimMode='defer')
    await card('فرصت پاسخ دیرهنگام').getByRole('button',{name:'انتخاب این کار'}).click()
    await page.waitForFunction(()=>typeof globalThis.__qaFinishClaim==='function')
    await page.evaluate(B=>globalThis.__qaSetWorker(B,{tasks:[],weekly_slots:[],exceptions:[],time_entries:[]}),B)
    await card('فرصت ساختگی ب').waitFor()
    await page.evaluate(()=>globalThis.__qaFinishClaim())
    await page.waitForFunction(()=>document.querySelector('[data-swtb-guide="work-pool-list"]')?.textContent.includes('فرصت ساختگی ب'))
    assert.equal(await page.getByText('SYNTHETIC_A-LATE',{exact:true}).count(),0)
    assert.ok(await pool.isVisible(),'old receipt must not navigate new account')
    assert.equal(await page.locator('#ow-task-inspector').count(),0)
    assert.equal(await page.getByText('انتخاب شما در سرور تأیید شد.',{exact:false}).count(),0)
    assert.equal((await calls()).length,4)
   }
   assert.equal(await page.evaluate(()=>globalThis.__qaWriteAttempts),0)
   assert.deepEqual(errors,[])
   assert.deepEqual(external,[])
   console.log('PASS SWTB21 isolated native Chrome '+mode)
  }finally{
   await page?.close().catch(()=>{})
   await server?.close().catch(()=>{})
  }
 }
}finally{await browser?.close().catch(()=>{})}
