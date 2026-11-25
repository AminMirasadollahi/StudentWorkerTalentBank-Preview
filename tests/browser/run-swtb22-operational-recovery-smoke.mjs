// Actual main.jsx + OpsApp + Supabase SDK + scoped transport, native Chrome.
// Synthetic identity and exact intercepted endpoints; no production or hosted staging access.
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {resolve} from 'node:path'
import {createServer} from 'vite'
import {createRecoveryBrowserFixture} from './assignment-recovery-browser-fixture.mjs'
const tool=process.env.SWTB22_BROWSER_TOOL_DIR
if(!tool)throw Error('BROWSER_TOOL_DIR_REQUIRED')
const {chromium}=createRequire(resolve(tool,'package.json'))('playwright')
const project='aaaaaaaaaaaaaaaaaaaa',origin='https://'+project+'.supabase.co'
const key='sb_publishable_synthetic_browser_only'
Object.assign(process.env,{VITE_SWTB22_RECOVERY_REVIEW_UI:'true',VITE_SWTB22_RECOVERY_RELEASE_UI:'false',
 VITE_SWTB22_RECOVERY_REVIEW_PROJECT_REF:project,VITE_SUPABASE_URL:origin,VITE_SUPABASE_PUBLISHABLE_KEY:key,
 VITE_SWTB22_MANAGER_SHELL_UI:'false'})
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0')
const now=Math.floor(Date.now()/1000),user={id:id(1),aud:'authenticated',role:'authenticated',email:'synthetic@example.invalid',is_anonymous:false,app_metadata:{provider:'email',providers:['email']},user_metadata:{},created_at:'2026-01-01T00:00:00Z'}
const encode=v=>Buffer.from(JSON.stringify(v)).toString('base64url')
const token=encode({alg:'HS256',typ:'JWT'})+'.'+encode({sub:user.id,aud:'authenticated',role:'authenticated',iat:now,exp:now+3600})+'.c3ludGhldGlj'
const session={access_token:token,refresh_token:'synthetic-refresh-not-a-real-credential',token_type:'bearer',expires_at:now+3600,expires_in:3600,user}
const worker={id:id(10),name:'دانشجوکار کاملاً ساختگی',state:'active',unit:'library'}
const work={workers:[worker],tasks:[],weekly_slots:[],exceptions:[],time_entries:[],profile_requests:[],approved_minutes_total:0}
const fixture=createRecoveryBrowserFixture(),calls=[],unexpected=[],errors=[]
let server,browser,context,page
const count=action=>fixture.calls.filter(c=>c.action===action).length
try{
 server=await createServer({configFile:resolve('vite.config.js'),base:'/',server:{host:'127.0.0.1',port:4187,strictPort:true},logLevel:'error'})
 await server.listen()
 browser=await chromium.launch({headless:true,channel:'chrome',args:['--no-sandbox','--disable-background-networking']})
 context=await browser.newContext({viewport:{width:1440,height:900},locale:'fa-IR',serviceWorkers:'block'})
 await context.addInitScript(({storageKey,session})=>{
  if(location.origin!=='http://127.0.0.1:4187')return
  if(!sessionStorage.getItem('swtb22-synthetic-seeded')){
   localStorage.setItem(storageKey,JSON.stringify(session))
   sessionStorage.setItem('swtb22-synthetic-seeded','1')
  }
 },{storageKey:'student-worker-operations-review-'+project,session})
 const cors={'access-control-allow-origin':'http://127.0.0.1:4187','access-control-allow-methods':'GET, POST, OPTIONS','access-control-allow-headers':'*','access-control-max-age':'0'}
 await context.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url())
  if(url.origin==='http://127.0.0.1:4187')return route.continue()
  const respond=(status,body)=>route.fulfill({status,headers:cors,contentType:'application/json',body:JSON.stringify(body)})
  if(url.origin!==origin){unexpected.push('unexpected external origin');return route.abort('blockedbyclient')}
  if(req.method()==='OPTIONS')return route.fulfill({status:204,headers:cors,body:''})
  const headers=req.headers()
  if(headers.apikey!==key||headers.authorization!=='Bearer '+token){unexpected.push('unexpected synthetic authorization');return respond(401,{message:'SYNTHETIC_DENIED'})}
  if(url.pathname==='/auth/v1/user'&&req.method()==='GET'){calls.push('auth_user');return respond(200,user)}
  if(url.pathname==='/auth/v1/logout'&&req.method()==='POST'){calls.push('logout');return respond(200,{})}
  if(req.method()!=='POST'||!url.pathname.startsWith('/rest/v1/rpc/')){unexpected.push('unexpected endpoint');return respond(403,{message:'SYNTHETIC_DENIED'})}
  const rpc=url.pathname.split('/').at(-1)
  calls.push(rpc)
  if(rpc==='ops_is_admin')return respond(200,true)
  if(rpc==='ops_list_candidates')return respond(200,[])
  if(rpc==='ops_get_operations_v3')return respond(200,work)
  if(rpc==='ops_get_admin_student_worker_report')return respond(200,{rows:[],summary:{},filters:{}})
  if(rpc==='ops_assignment_recovery_control_v2'||rpc==='ops_assignment_recovery_write_v2'){
   const args=req.postDataJSON()
   const isControl=['discover','cancel','acknowledge'].includes(args?.p_action)
   if(isControl!==(rpc==='ops_assignment_recovery_control_v2')){unexpected.push('wrong recovery RPC');return respond(400,{})}
   const result=fixture.handle(args)
   return respond(result.status,result.body)
  }
  unexpected.push('unexpected RPC '+rpc);return respond(403,{message:'SYNTHETIC_DENIED'})
 })
 page=await context.newPage()
 page.on('pageerror',e=>errors.push(e.message))
 page.setDefaultTimeout(15000)
 const url='http://127.0.0.1:4187/?page=operations'
 await page.goto(url,{waitUntil:'domcontentloaded'})
 await page.getByRole('button',{name:'برنامه و کارها',exact:true}).waitFor()
 await page.getByRole('button',{name:'برنامه و کارها',exact:true}).click()
 const form=page.locator('form.ow-assignment-form')
 await form.waitFor()
 await page.waitForFunction(()=>document.querySelector('form.ow-assignment-form fieldset')?.disabled===false&&document.querySelector('.ow-worker-option-list input[type="checkbox"]'))
 const fill=async title=>{
  await form.locator('.ow-multi-picker summary').click()
  await form.locator('.ow-worker-option-list input[type="checkbox"]').first().check()
  await form.locator('select[aria-label="واحد انجام کار"]').selectOption('research')
  await form.locator('input[maxlength="160"]').fill(title)
  await form.locator('input[maxlength="3000"]').fill('شرح صرفاً ساختگی')
  const reason=form.locator('input[maxlength="300"]')
  if(await reason.count())await reason.fill('دلیل ساختگی معتبر آزمون')
  await form.locator('button[type="submit"]').click()
 }
 const title='واگذاری ساختگی آزمون اتصال واقعی'
 fixture.loseNextCommitResponse()
 await fill(title)
 await page.getByText(/وضعیت درخواست هنوز تأیید نشده است/).waitFor()
 assert.equal(fixture.view().active?.status,'committed')
 assert.equal(count('reserve'),1);assert.equal(count('commit'),1)
 assert.equal(await form.locator('button[type="submit"]').isDisabled(),true)
 await page.getByRole('button',{name:'داشبورد و داوطلبان',exact:true}).click()
 await page.getByRole('button',{name:'آمار و خروجی‌ها',exact:true}).click()
 await page.getByText(/ثبت واگذاری تأیید شد/).waitFor()
 assert.equal(await form.count(),0)
 assert.equal(count('commit'),1)
 await page.reload({waitUntil:'domcontentloaded'})
 await page.getByText(/ثبت واگذاری تأیید شد/).waitFor()
 assert.equal(await page.getByRole('button',{name:'ثبت نهایی واگذاری'}).count(),0)
 assert.equal(await page.evaluate(t=>[localStorage,sessionStorage].some(s=>Object.values(s).some(x=>String(x).includes(t))),title),false)
 await page.getByRole('button',{name:'تأیید و بستن رسید'}).click()
 await page.waitForFunction(()=>!document.querySelector('.ow-assignment-recovery'))
 assert.equal(fixture.view().epoch,1);assert.equal(fixture.view().active,null)
 await page.getByRole('button',{name:'برنامه و کارها',exact:true}).click()
 await page.waitForFunction(()=>document.querySelector('form.ow-assignment-form fieldset')?.disabled===false&&document.querySelector('.ow-worker-option-list input[type="checkbox"]'))
 assert.equal(await form.locator('input[maxlength="160"]').inputValue(),'')
 await fill('واگذاری ساختگی سالم دوم')
 await page.getByText(/ثبت واگذاری تأیید شد/).waitFor()
 await page.getByRole('button',{name:'تأیید و بستن رسید'}).click()
 await page.waitForFunction(()=>document.querySelector('form.ow-assignment-form input[maxlength="160"]')?.value===''&&document.querySelector('form.ow-assignment-form fieldset')?.disabled===false)
 assert.equal(fixture.view().epoch,2)
 assert.equal(count('reserve'),2);assert.equal(count('commit'),2);assert.equal(count('acknowledge'),2)
 assert.ok(calls.includes('ops_get_admin_student_worker_report'))
 assert.ok(calls.includes('ops_list_candidates'));assert.ok(calls.includes('ops_get_operations_v3'))
 await page.getByRole('button',{name:'خروج',exact:true}).click()
 await page.waitForFunction(()=>!document.querySelector('form.ow-assignment-form')&&!document.querySelector('nav[aria-label="بخش‌های مدیریت دانشجوکار"]'))
 assert.deepEqual(unexpected,[],'only explicitly intercepted synthetic endpoints')
 assert.deepEqual(errors,[],'no native browser errors')
 console.log('SWTB22_ACTUAL_OPSAPP_SYNTHETIC_CHROME_PASS')
 console.log(JSON.stringify({reserve:count('reserve'),commit:count('commit'),acknowledge:count('acknowledge'),epoch:fixture.view().epoch,unexpected_requests:unexpected.length,page_errors:errors.length,production_network:false,hosted_auth:false}))
}finally{
 await context?.close().catch(()=>{});await browser?.close().catch(()=>{});await server?.close().catch(()=>{})
}
