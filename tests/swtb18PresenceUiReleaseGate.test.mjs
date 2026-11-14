import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const base=new URL('../',import.meta.url)
const read=path=>readFileSync(new URL(path,base),'utf8')
test('presence request UI is explicitly OFF in production and no new Vite token is published',()=>{
 const prod=read('.env.production')
 const app=read('src/OperationsWorkspace.jsx')
 assert.doesNotMatch(prod,/^VITE_SWTB18_PRESENCE_APPROVAL_UI\s*=\s*true/m)
 assert.match(app,/presenceApprovalUIEnabled\s*=\s*import\.meta\.env\?\.VITE_SWTB18_PRESENCE_APPROVAL_UI\s*===\s*'true'/)
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
