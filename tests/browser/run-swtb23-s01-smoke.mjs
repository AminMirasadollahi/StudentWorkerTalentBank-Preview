// Native Chrome, actual worker entry and actual manager control. All API traffic intercepted.
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {resolve} from 'node:path'
import {createServer} from 'vite'
const tool=process.env.SWTB23_BROWSER_TOOL_DIR
if(!tool)throw Error('BROWSER_TOOL_DIR_REQUIRED')
const {chromium}=createRequire(resolve(tool,'package.json'))('playwright')
const project='aaaaaaaaaaaaaaaaaaaa',origin='https://'+project+'.supabase.co',local='http://127.0.0.1:4189',key='sb_publishable_synthetic_browser_only'
Object.assign(process.env,{VITE_SWTB22_RECOVERY_REVIEW_UI:'false',VITE_SWTB22_RECOVERY_RELEASE_UI:'false',VITE_SUPABASE_URL:origin,VITE_SUPABASE_PUBLISHABLE_KEY:key})
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0')
const now=Math.floor(Date.now()/1000),user={id:id(1),aud:'authenticated',role:'authenticated',email:'synthetic@example.invalid',is_anonymous:false,app_metadata:{provider:'email',providers:['email']},user_metadata:{},created_at:'2026-01-01T00:00:00Z'}
const encode=v=>Buffer.from(JSON.stringify(v)).toString('base64url')
const token=encode({alg:'HS256',typ:'JWT'})+'.'+encode({sub:user.id,aud:'authenticated',role:'authenticated',iat:now,exp:now+3600})+'.c3ludGhldGlj'
const session={access_token:token,refresh_token:'synthetic-refresh-not-a-real-credential',token_type:'bearer',expires_at:now+3600,expires_in:3600,user}
const profile={worker_id:id(2),name:'دانشجوکار ساختگی',state:'active',unit:'library',onboarding_state:'password_required'}
let phase='dispatched',server,browser,context,page
const mutations=[],unexpected=[],errors=[]
try{
 server=await createServer({configFile:resolve('vite.config.js'),mode:'production',base:'/',server:{host:'127.0.0.1',port:4189,strictPort:true},logLevel:'error'})
 await server.listen()
 browser=await chromium.launch({headless:true,channel:'chrome',args:['--no-sandbox','--disable-background-networking']})
 context=await browser.newContext({viewport:{width:1440,height:900},locale:'fa-IR',serviceWorkers:'block'})
 await context.addInitScript(({storageKey,session})=>{
  if(location.origin==='http://127.0.0.1:4189'&&!sessionStorage.getItem('s01-seeded')){
   localStorage.setItem(storageKey,JSON.stringify(session));sessionStorage.setItem('s01-seeded','1')
  }
 },{storageKey:'student-worker-operations-auth-v1',session})
 const cors={'access-control-allow-origin':local,'access-control-allow-methods':'GET, POST, OPTIONS','access-control-allow-headers':'*'}
 await context.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url())
  if(url.origin===local)return route.continue()
  const respond=(status,body)=>route.fulfill({status,headers:cors,contentType:'application/json',body:JSON.stringify(body)})
  if(url.origin!==origin){unexpected.push('external origin');return route.abort('blockedbyclient')}
  if(req.method()==='OPTIONS')return route.fulfill({status:204,headers:cors,body:''})
  const headers=req.headers()
  if(headers.apikey!==key||headers.authorization!=='Bearer '+token){unexpected.push('authorization');return respond(401,{message:'SYNTHETIC_DENIED'})}
  if(url.pathname==='/auth/v1/user'&&req.method()==='GET')return respond(200,user)
  if(req.method()!=='POST'){unexpected.push('method');return respond(403,{message:'SYNTHETIC_DENIED'})}
  if(url.pathname==='/functions/v1/ops-complete-worker-onboarding'){
   const body=req.postDataJSON();mutations.push({mode:body.mode||'initial',keys:Object.keys(body).sort()})
   if(phase!=='none'||body.mode!=='confirm_existing_password')return respond(409,{ok:false,error:'synthetic_denied'})
   profile.onboarding_state='ready';return respond(200,{ok:true,onboarding_state:'ready'})
  }
  const rpc=url.pathname.split('/').at(-1)
  if(!url.pathname.startsWith('/rest/v1/rpc/')){unexpected.push('endpoint');return respond(403,{message:'SYNTHETIC_DENIED'})}
  if(rpc==='ops_is_admin')return respond(200,false)
  if(rpc==='ops_get_my_worker_profile'||rpc==='ops_get_my_worker_profile_v2')return respond(200,profile)
  if(rpc==='ops_s01_support_status')return respond(200,{ok:true,phase,worker_state:'active',onboarding_state:profile.onboarding_state})
  if(rpc==='ops_get_my_work_v2')return respond(200,{state:'active',tasks:[],weekly_slots:[],exceptions:[],time_entries:[],approved_minutes_total:0})
  if(rpc==='ops_get_my_profile_change_requests')return respond(200,[])
  if(rpc==='ops_get_unit_hour_totals_v1')return respond(200,{scope:'worker',units:[]})
  unexpected.push(rpc);return respond(403,{message:'SYNTHETIC_DENIED'})
 })
 page=await context.newPage();page.on('pageerror',e=>errors.push(e.message))
 await page.goto(local+'/?page=worker')
 const panel=page.locator('#ops-worker-account-settings')
 await panel.getByRole('heading',{name:/در اولین ورود/}).waitFor()
 const fill=async()=>{await panel.locator('input[type=password]').nth(0).fill('Synthetic-password-42');await panel.locator('input[type=password]').nth(1).fill('Synthetic-password-42')}
 await fill()
 await panel.getByRole('button',{name:'ثبت رمز اختصاصی',exact:true}).click()
 await panel.getByRole('alert').filter({hasText:'وضعیت عملیات حساب هنوز قطعی نیست'}).waitFor()
 assert.equal(mutations.length,0)
 assert.equal(await panel.locator('input[type=password]').nth(0).inputValue(),'')
 assert.equal(await panel.locator('input[type=password]').nth(1).inputValue(),'')
 assert.equal(await panel.locator('button[type=submit]').isDisabled(),true)
 console.log('PASS S01_NATIVE_WORKER_HELD_CLEARS_AND_BLOCKS')
 phase='none'
 await panel.getByRole('button',{name:'بررسی مجدد وضعیت حساب (بدون تغییر رمز)'}).click()
 await panel.getByRole('button',{name:'تکمیل با همین رمز (بدون تغییر رمز)',exact:true}).waitFor()
 await fill()
 await panel.getByRole('button',{name:'تکمیل با همین رمز (بدون تغییر رمز)',exact:true}).click()
 await page.locator('.ops-worker-b3-view').waitFor()
 assert.deepEqual(mutations,[{mode:'confirm_existing_password',keys:['mode','password']}])
 await page.locator('.ow-worker-task-workspace').waitFor()
 console.log('PASS S01_NATIVE_WORKER_PROOF_RECOVERY')
 await page.goto(local+'/tests/browser/swtb23-s01-manager.html')
 await page.getByRole('button',{name:'بررسی وضعیت راه‌اندازی'}).click()
 await page.getByRole('button',{name:'لغو رزرو ارسال‌نشده',exact:true}).click()
 assert.equal(await page.evaluate(()=>window.__s01.calls.length),1)
 await page.getByRole('button',{name:'تأیید لغو رزرو',exact:true}).click()
 await page.getByText('رزرو ارسال‌نشده لغو شد؛ هیچ رمز یا لینکی تغییر نکرد.').waitFor()
 assert.deepEqual(await page.evaluate(()=>window.__s01.calls[1]),['ops_s01_cancel_reserved',{p_worker_id:'synthetic-a',p_support_ref:'synthetic-ref'}])
 await page.evaluate(()=>{window.__s01.phase='dispatched'})
 await page.getByRole('button',{name:'بررسی وضعیت راه‌اندازی'}).click()
 await page.getByText(/ممکن است عملیات به سرویس احراز هویت ارسال شده باشد/).waitFor()
 assert.equal(await page.getByRole('button',{name:'صدور لینک امن تعیین رمز'}).isDisabled(),true)
 assert.equal(await page.getByRole('button',{name:'لغو رزرو ارسال‌نشده',exact:true}).count(),0)
 await page.evaluate(()=>{window.__s01.phase='reserved';window.__s01.defer=true})
 await page.getByRole('button',{name:'بررسی وضعیت راه‌اندازی'}).click()
 await page.waitForFunction(()=>typeof window.__s01.resolve==='function')
 await page.getByRole('button',{name:'تغییر پرونده آزمایشی'}).click()
 await page.evaluate(()=>window.__s01.resolve())
 assert.equal(await page.getByRole('button',{name:'لغو رزرو ارسال‌نشده',exact:true}).count(),0)
 assert.equal(await page.getByText(/رزرو هنوز به سرویس/).count(),0)
 assert.equal(await page.evaluate(()=>window.__s01.reissues.length),0)
 assert.deepEqual(unexpected,[]);assert.deepEqual(errors,[])
 console.log('PASS S01_NATIVE_MANAGER_RESERVED_DISPATCHED_STALE')
 console.log('SWTB23_S01_SYNTHETIC_NATIVE_CHROME_PASS')
}finally{await context?.close().catch(()=>{});await browser?.close().catch(()=>{});await server?.close().catch(()=>{})}
