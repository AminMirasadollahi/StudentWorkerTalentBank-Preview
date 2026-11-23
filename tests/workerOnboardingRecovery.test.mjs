import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {
 validWorkerPasswordPair,
 workerPasswordChangeErrorCopy,
 confirmedInitialPasswordUpdateRejected,
} from '../src/lib/workerOnboardingRecovery.mjs'

test('password validation matches deployed Edge rules, without changing password data',()=>{
 const acceptable='synthetic-valid-password-123'
 assert.equal(validWorkerPasswordPair(acceptable,acceptable),true)
 assert.equal(validWorkerPasswordPair('x'.repeat(8),'x'.repeat(8)),true)
 assert.equal(validWorkerPasswordPair('x'.repeat(128),'x'.repeat(128)),true)
 for(const invalid of ['short',' '.repeat(8),'x'.repeat(129),null,undefined]){
  assert.equal(validWorkerPasswordPair(invalid,invalid),false)
 }
 assert.equal(validWorkerPasswordPair(acceptable,acceptable+'X'),false)
 assert.equal(validWorkerPasswordPair('x'.repeat(8),null),false)
})

test('uncertain initial-setup result never asserts that password was rejected',()=>{
 const text=workerPasswordChangeErrorCopy({initialSetup:true})
 assert.match(text,/ممکن است رمز جدید قبلاً ثبت شده باشد/)
 assert.match(text,/همین رمز/)
 assert.match(text,/نشست/)
 assert.match(text,/لینک امن جدید/)
 assert.doesNotMatch(text,/رمز دیگری انتخاب کنید/)
 assert.doesNotMatch(text,/synthetic-valid-password-123/)
})

test('ordinary password change has separate neutral recovery guidance',()=>{
 const standard=workerPasswordChangeErrorCopy()
 assert.match(standard,/تغییر رمز تأیید نشد/)
 assert.match(standard,/ممکن است/)
 assert.doesNotMatch(standard,/تکمیل فعال‌سازی/)
 assert.notEqual(standard,workerPasswordChangeErrorCopy({initialSetup:true}))
})

test('worker form really calls the shared validator and uncertain-state copy',()=>{
 const source=readFileSync(new URL('../src/OpsApp.jsx',import.meta.url),'utf8')
 assert.match(source,/if \(!validWorkerPasswordPair\(password, confirmation\)\)/)
 assert.match(source,/setPasswordError\(workerPasswordChangeErrorCopy\(\{initialSetup: !passwordEstablished\}\)\)/)
 assert.equal((source.match(/minLength=\{8\} maxLength=\{128\} required/g)||[]).length,2)
 assert.doesNotMatch(source,/ثبت رمز انجام نشد\. لطفاً رمز دیگری انتخاب کنید/)
})

test('uncertain first onboarding result reconciles server state before any password retry',()=>{
 const source=readFileSync(new URL('../src/OpsApp.jsx',import.meta.url),'utf8')
 const worker=source.slice(source.indexOf('function WorkerView('),source.indexOf('const accountSettingsPanel=',source.indexOf('function WorkerView(')))
 assert.ok(worker.length>2000,'worker action source available')
 assert.match(worker,/const recoveryMode=recoveryOffered\|\|confirmExisting/)
 assert.match(worker,/const body=recoveryMode\?\{password,mode:'confirm_existing_password'\}:\{password\}/)
 assert.match(worker,/const current=await currentOperationsIdentity\(\)/)
 assert.match(worker,/current\.profile\?\.worker_id===profile\.worker_id/)
 assert.match(worker,/current\.profile\?\.onboarding_state==='ready'/)
 assert.match(worker,/setRecoveryOffered\(true\)/)
 assert.match(worker,/setRecoveryOffered\(false\)/)
 assert.match(source,/تکمیل با همین رمز \(بدون تغییر رمز\)/)
 assert.match(source,/رمز دوباره تغییر نمی‌کند/)
 assert.match(source,/قبلاً رمز را ثبت کرده‌ام؛ تکمیل حساب بدون تغییر رمز/)
 assert.match(source,/void changePassword\(event,true\)/)
})
test('recovery guidance does not instruct password rotation after ambiguous Auth+DB commit',()=>{
 const message=workerPasswordChangeErrorCopy({initialSetup:true})
 assert.match(message,/این مسیر فقط رمز موجود را تأیید می‌کند/)
 assert.match(message,/با همین رمز/)
 assert.doesNotMatch(message,/رمز دیگری/)
})

test('only explicit 422/password_update_failed may retry initial password setup',async()=>{
 const authReject={context:{status:422,clone(){return{json:async()=>({error:'password_update_failed'})}}}}
 assert.equal(await confirmedInitialPasswordUpdateRejected(authReject,null),true)
 assert.equal(await confirmedInitialPasswordUpdateRejected(authReject,{error:'password_update_failed'}),true)
 const ambiguous={context:{status:503,clone(){return{json:async()=>({error:'password_update_failed'})}}}}
 assert.equal(await confirmedInitialPasswordUpdateRejected(ambiguous,null),false)
 assert.equal(await confirmedInitialPasswordUpdateRejected({context:{status:422,clone(){return{json:async()=>({error:'onboarding_finalize_failed'})}}}},null),false)
 assert.equal(await confirmedInitialPasswordUpdateRejected({context:{status:422,clone(){throw Error('no clone')}}},null),false)
 assert.equal(await confirmedInitialPasswordUpdateRejected(new Error('network disconnected'),null),false)
 assert.equal(await confirmedInitialPasswordUpdateRejected(null,{error:'password_update_failed'}),false)
})
test('worker handles definitive Auth rejection separately but keeps ambiguous responses proof-only',()=>{
 const source=readFileSync(new URL('../src/OpsApp.jsx',import.meta.url),'utf8')
 const worker=source.slice(source.indexOf('function WorkerView('),source.indexOf('const accountSettingsPanel=',source.indexOf('function WorkerView(')))
 assert.match(worker,/await confirmedInitialPasswordUpdateRejected\(error,data\)/)
 assert.match(worker,/const retryInitial=!recoveryMode/)
 assert.match(worker,/if\(failure\?\.retryInitial\)/)
 assert.match(worker,/setRecoveryOffered\(false\)/)
 assert.match(worker,/setRecoveryOffered\(true\)/)
 assert.match(worker,/const current=await currentOperationsIdentity\(\)/)
 assert.match(worker,/mode:'confirm_existing_password'/)
})
