// No-network browser smoke for actual compiled QA React bundle.
// All Supabase routes are intercepted with fake Auth and fake worker records;
// NO real Supabase request can leave the runner.
import {createServer} from 'node:http';
import {readFileSync,existsSync,statSync} from 'node:fs';
import {resolve,extname,sep} from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const root=resolve('qa/local-visual/dist');
const project='https://pmwxryavkrjcdobwkryw.supabase.co';
const user={id:'00000000-0000-4000-8000-000000000001',
  email:'manager@example.invalid',aud:'authenticated',role:'authenticated',
  app_metadata:{provider:'email',providers:['email']},user_metadata:{},
  created_at:'2026-10-01T12:00:00.000Z'};
const now=Math.floor(Date.now()/1000);
const segment=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt=segment({alg:'HS256',typ:'JWT'})+'.'+segment({
  sub:user.id,aud:'authenticated',role:'authenticated',exp:now+3600,iat:now,
  iss:project+'/auth/v1',email:user.email})+'.'+segment('synthetic-signature');
const session={access_token:jwt,token_type:'bearer',expires_in:3600,
  expires_at:now+3600,refresh_token:'synthetic-refresh',user};
const candidate=[{id:'SYNTHETIC_APP',worker_id:'SYNTHETIC_WORKER',
  full_name:'نام اولیه ساختگی',major:'رشته اولیه ساختگی',entry_year:1404,
  primary_unit:'library',worker_state:'active',interview_status:'approved',
  clearance_status:'cleared'}];
const manager={
  workers:[{id:'SYNTHETIC_WORKER',application_id:'SYNTHETIC_APP',
    name:'نام تأییدشده ساختگی',major:'رشته تأییدشده ساختگی',state:'active',
    unit:'library'}],
  tasks:[],time_entries:[],weekly_slots:[],date_exceptions:[],inbox:[],
};
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.woff2':'font/woff2',
  '.woff':'font/woff','.png':'image/png','.jpg':'image/jpeg','.json':'application/json'};
const csp="default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src "+project+"; form-action 'none'; base-uri 'none'; frame-ancestors 'none'; object-src 'none'";
const server=createServer((req,res)=>{
  const p=new URL(req.url||'/', 'http://127.0.0.1');
  const route=p.pathname==='/'?'/index.html':decodeURIComponent(p.pathname);
  const full=resolve(root,'.'+route);
  if(!full.startsWith(root+sep)||!existsSync(full)||!statSync(full).isFile()){
    res.writeHead(404);res.end();return;
  }
  res.writeHead(200,{'content-type':mime[extname(full)]||'application/octet-stream',
    'content-security-policy':csp,'cache-control':'no-store',
    'x-content-type-options':'nosniff'});
  res.end(readFileSync(full));
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+server.address().port;
let browser;
let upstream=0,blockedWrites=0;
try{
  browser=await chromium.launch({headless:true,executablePath:'/usr/bin/google-chrome',
    args:['--no-sandbox']});
  const context=await browser.newContext({viewport:{width:1280,height:900}});
  await context.route('**/*',async route=>{
    const req=route.request();
    const u=new URL(req.url());
    if(u.origin===base)return route.continue();
    if(u.origin!==project){return route.abort('blockedbyclient');}
    // Every possible request to Supabase is replaced here. Zero real traffic.
    const method=req.method(),path=u.pathname;
    const headers={'access-control-allow-origin':base,
      'access-control-allow-headers':'authorization,apikey,content-type,x-client-info',
      'access-control-allow-methods':'GET,POST,OPTIONS',
      'content-type':'application/json'};
    if(method==='OPTIONS')
      return route.fulfill({status:204,headers,body:''});
    const respond=body=>route.fulfill({status:200,headers,
      body:JSON.stringify(body)});
    if(path==='/auth/v1/token'&&method==='POST')return respond(session);
    if(path==='/auth/v1/user'&&method==='GET')return respond(user);
    if(path==='/auth/v1/logout'&&method==='POST')return respond({});
    if(path==='/rest/v1/rpc/ops_is_admin')return respond(true);
    if(path==='/rest/v1/rpc/ops_list_candidates')return respond(candidate);
    if(path==='/rest/v1/rpc/ops_get_operations_v3')return respond(manager);
    upstream++;
    return route.fulfill({status:403,headers,
      body:JSON.stringify({error:'UNEXPECTED_FAKE_RPC'})});
  });
  const page=await context.newPage();
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/',{waitUntil:'domcontentloaded'});
  await page.locator('#swtb17-qa-toolbar').waitFor({timeout:15000});
  assert.match(await page.locator('#swtb17-qa-toolbar').innerText(),/فقط خواندن/);
  await page.locator('input[type=email]').fill('manager@example.invalid');
  await page.locator('input[type=password]').fill('SYNTHETIC_PASSWORD_123');
  await page.locator('button[type=submit]').click();
  await page.locator('[data-swtb22-route="applicants"]').waitFor({timeout:15000});
  await page.locator('[data-swtb22-route="applicants"]').click();
  const row=page.locator('.swtb22-candidate-row').first();
  await row.waitFor({timeout:15000});
  assert.match(await row.innerText(),/نام تأییدشده ساختگی/);
  assert.match(await row.innerText(),/رشته تأییدشده ساختگی/);
  await row.click();
  assert.match(await page.locator('.ops-candidate').innerText(),/نام اولیه ساختگی/);
  // Simulate an unauthorized business write from the same page; the fetch
  // guard must reject before it could ever reach the mocked network route.
  const failure=await page.evaluate(async origin=>{
    try{
      await window.fetch(origin+'/rest/v1/rpc/ops_set_screening',{method:'POST'});
      return 'UNEXPECTED_NETWORK_WRITE';
    }catch(e){return String(e.message);}
  },project);
  assert.equal(failure,'SWTB17_QA_READ_ONLY_BLOCKED');
  blockedWrites++;
  assert.equal(upstream,0,'unexpected RPC from the QA page');
  assert.deepEqual(errors.filter(e=>/Uncaught|is not defined/.test(e)),[]);
  console.log('SWTB17_QA_CHROMIUM_REAL_REACT_FAKE_AUTH=PASS');
  console.log('SWTB17_QA_CHROMIUM_READ_ONLY_NETWORK_BLOCK=PASS');
  console.log('SWTB17_QA_CHROMIUM_SYNTHETIC_BLOCKED_WRITES='+blockedWrites);
  await context.close();
}finally{
  if(browser)await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
