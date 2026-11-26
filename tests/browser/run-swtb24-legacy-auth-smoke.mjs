// Native Chrome actual worker entry, legacy Auth + strict V3. All API traffic intercepted.
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {resolve} from 'node:path'
import {createServer} from 'vite'
const tool=process.env.SWTB23_BROWSER_TOOL_DIR
if(!tool)throw Error('BROWSER_TOOL_DIR_REQUIRED')
const {chromium}=createRequire(resolve(tool,'package.json'))('playwright')
const project='aaaaaaaaaaaaaaaaaaaa',origin='https://'+project+'.supabase.co',local='http://127.0.0.1:4189',key='sb_publishable_synthetic_browser_only'
Object.assign(process.env,{VITE_SWTB23_WORKER_POLICY_RELEASE:'true',VITE_SWTB22_RECOVERY_REVIEW_UI:'true',VITE_SWTB22_RECOVERY_REVIEW_PROJECT_REF:project,VITE_SWTB22_RECOVERY_RELEASE_UI:'false',VITE_SUPABASE_URL:origin,VITE_SUPABASE_PUBLISHABLE_KEY:key})
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0')
const now=Math.floor(Date.now()/1000),user={id:id(1),aud:'authenticated',role:'authenticated',email:'synthetic@example.invalid',is_anonymous:false,app_metadata:{provider:'email',providers:['email']},user_metadata:{},created_at:'2026-01-01T00:00:00Z'}
const encode=v=>Buffer.from(JSON.stringify(v)).toString('base64url')
const token=encode({alg:'HS256',typ:'JWT'})+'.'+encode({sub:user.id,aud:'authenticated',role:'authenticated',iat:now,exp:now+3600})+'.c3ludGhldGlj'
const session={access_token:token,refresh_token:'synthetic-refresh-not-a-real-credential',token_type:'bearer',expires_at:now+3600,expires_in:3600,user}
const profile={worker_id:id(2),name:'دانشجوکار ساختگی',state:'active',unit:'library',onboarding_state:'password_required'}
let responseMode='reject',server,browser,context,page,reads=0
const mutations=[],unexpected=[],errors=[],observed=[]
try{
 server=await createServer({configFile:resolve('vite.config.js'),mode:'production',base:'/',server:{host:'127.0.0.1',port:4189,strictPort:true},logLevel:'error'})
 await server.listen()
 browser=await chromium.launch({headless:true,channel:'chrome',args:['--no-sandbox','--disable-background-networking']})
 context=await browser.newContext({viewport:{width:1440,height:900},locale:'fa-IR',serviceWorkers:'block'})
 await context.addInitScript(({storageKey,session})=>{
  if(location.origin==='http://127.0.0.1:4189'&&!sessionStorage.getItem('s01-seeded')){
   localStorage.setItem(storageKey,JSON.stringify(session));localStorage.setItem('swtb-worker-guide:v1:00000000-0000-4000-8000-000000000002','suppressed');sessionStorage.setItem('s01-seeded','1')
  }
 },{storageKey:'student-worker-operations-review-'+project,session})
 const cors={'access-control-allow-origin':local,'access-control-allow-methods':'GET, POST, OPTIONS','access-control-allow-headers':'*'}
 await context.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url())
  if(url.origin===local)return route.continue()
  const respond=(status,body)=>route.fulfill({status,headers:cors,contentType:'application/json',body:JSON.stringify(body)})
  if(url.origin!==origin){unexpected.push('external origin');return route.abort('blockedbyclient')}
  observed.push(req.method()+' '+url.pathname)
  if(req.method()==='OPTIONS')return route.fulfill({status:204,headers:cors,body:''})
  const headers=req.headers()
  if(headers.apikey!==key||headers.authorization!=='Bearer '+token){unexpected.push('authorization');return respond(401,{message:'SYNTHETIC_DENIED'})}
  if(url.pathname==='/auth/v1/user'&&req.method()==='GET')return respond(200,user)
  if(req.method()!=='POST'){unexpected.push('method');return respond(403,{message:'SYNTHETIC_DENIED'})}
  if(url.pathname==='/functions/v1/ops-complete-worker-onboarding'){
   const body=req.postDataJSON();mutations.push({mode:body.mode||'initial',keys:Object.keys(body).sort()})
   if(Object.keys(body).sort().join(',')!=='password'){unexpected.push('legacy payload drift');return respond(400,{ok:false})}
   if(responseMode==='reject')return respond(422,{ok:false,error:'synthetic_denied'})
   profile.onboarding_state='ready';return respond(200,{ok:true,onboarding_state:'ready'})
  }
  const rpc=url.pathname.split('/').at(-1)
  if(!url.pathname.startsWith('/rest/v1/rpc/')){unexpected.push('endpoint');return respond(403,{message:'SYNTHETIC_DENIED'})}
  if(rpc==='ops_is_admin')return respond(200,false)
  if(rpc==='ops_get_my_worker_profile'||rpc==='ops_get_my_worker_profile_v2')return respond(200,profile)
  if(rpc==='ops_get_my_work_v3'){reads++;return respond(200,{state:'active',report_contract_version:1,server_today:'2026-11-26',tasks:[],weekly_slots:[],exceptions:[],time_entries:[],approved_minutes_total:0})}
  if(rpc==='ops_get_my_profile_change_requests')return respond(200,[])
  if(rpc==='ops_get_unit_hour_totals_v1')return respond(200,{scope:'worker',units:[]})
  unexpected.push(rpc);return respond(403,{message:'SYNTHETIC_DENIED'})
 })
 page=await context.newPage();page.on('pageerror',e=>errors.push(e.message))
 // The actual review entry deliberately blocks ?page=worker; the server-verified worker role selects WorkerView from ?page=operations.
 await page.goto(local+'/?page=operations')
 const panel=page.locator('#ops-worker-account-settings')
 await panel.getByRole('heading',{name:/در اولین ورود/}).waitFor()
 const fill=async()=>{await panel.locator('input[type=password]').nth(0).fill('Synthetic-password-42');await panel.locator('input[type=password]').nth(1).fill('Synthetic-password-42')}
 await fill()
 await panel.locator('button[type=submit]').click()
 await panel.getByRole('alert').filter({hasText:'ممکن است رمز جدید قبلاً ثبت شده باشد'}).waitFor()
 assert.deepEqual(mutations,[{mode:'initial',keys:['password']}])
 assert.equal(await page.locator('.ops-worker-b3-view').count(),0)
 assert.equal(await panel.getByText(/تکمیل با همین رمز \(بدون تغییر رمز\)/).count(),0)
 console.log('PASS LEGACY_AUTH_UNCERTAIN_NO_AUTOMATIC_RETRY')
 responseMode='accept'
 await fill()
 const strictRead=page.waitForResponse(r=>new URL(r.url()).pathname==='/rest/v1/rpc/ops_get_my_work_v3'&&r.ok())
 await panel.locator('button[type=submit]').click()
 await strictRead
 await page.locator('.ops-worker-b3-view').waitFor()
 await page.locator('.ow-worker-task-workspace').waitFor()
 assert.deepEqual(mutations,[{mode:'initial',keys:['password']},{mode:'initial',keys:['password']}])
 assert.ok(reads>0)
 assert.deepEqual(unexpected,[]);assert.deepEqual(errors,[])
 console.log('PASS LEGACY_AUTH_INITIAL_TO_STRICT_V3')
 console.log('SWTB24_LEGACY_AUTH_NATIVE_CHROME_PASS')
}catch(e){console.error('SWTB24_BROWSER_DIAGNOSTIC',JSON.stringify({unexpected,errors,reads,mutationCount:mutations.length,observed,headings:await page?.locator('h1,h2').allTextContents().catch(()=>[])}));throw e}finally{await context?.close().catch(()=>{});await browser?.close().catch(()=>{});await server?.close().catch(()=>{})}
