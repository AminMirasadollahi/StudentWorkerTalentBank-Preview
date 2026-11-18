import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const base=new URL('../',import.meta.url)
const read=path=>readFileSync(new URL(path,base),'utf8')
test('SWTB18 flag requires recorded SQL migration and explicit React gate',()=>{
 const prod=read('.env.production')
 const app=read('src/OperationsWorkspace.jsx')
 const enable=/^VITE_SWTB18_PRESENCE_APPROVAL_UI\s*=\s*true\s*$/m.test(prod)
 assert.match(app,/presenceApprovalUIEnabled\s*=\s*import\.meta\.env\?\.VITE_SWTB18_PRESENCE_APPROVAL_UI\s*===\s*'true'/)
 if(enable){
   // This marker is the owner-authorized, actually installed production SQL
   // migration; removing it requires disabling the flag first.
   assert.match(prod,/SWTB18 PR52\+PR87: coordinated server migration 20261118070059/)
   assert.match(app,/if\(presenceApprovalUIEnabled\)\{void submitPresenceRequest\('set_exception'\);return\}/)
   assert.match(app,/presenceApprovalUIEnabled&&workerId&&<WorkerPresenceRequests/)
 }
 assert.equal((prod.match(/^VITE_SWTB18_PRESENCE_APPROVAL_UI\s*=/gm)||[]).length,1)
})
test('no direct presence client table mutation or hidden fallback to legacy write when enabled',()=>{
 const api=read('src/lib/presenceChangesApi.js')
 const app=read('src/OperationsWorkspace.jsx')
 assert.doesNotMatch(api,/\.from\(['"]worker_presence_change_requests['"]\)/)
 assert.match(api,/rpc\('ops_request_presence_change'/)
 assert.match(api,/rpc\('ops_review_presence_change'/)
 assert.match(api,/rpc\('ops_cancel_presence_change'/)
 assert.match(app,/if\(presenceApprovalUIEnabled\)\{void submitPresenceRequest\('set_exception'\);return\}/)
 assert.match(app,/presenceApprovalUIEnabled&&existingDayException/)
})
test('pending receipt is not rendered as effective presence and no task credit mutation',()=>{
 const panels=read('src/components/PresenceChangePanels.jsx')
 const app=read('src/OperationsWorkspace.jsx')
 assert.match(app,/در انتظار تأیید مدیر/)
 assert.match(panels,/برنامه مؤثر را تغییر نمی‌دهد/)
 assert.match(panels,/فهرست را بازخوانی کنید/)
 assert.doesNotMatch(panels,/ops_submit_time|ops_review_time|ops_assign_task|worker_time_entries/)
})
