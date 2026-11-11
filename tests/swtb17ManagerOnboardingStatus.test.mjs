// SWTB17 manager-only display contract; all identities and timestamps synthetic.
// Must not talk to Auth, a real user, the Edge send-email function or Supabase.
import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {
 candidateStage,candidateOnboardingLabel,candidateAuthSignInLabel,
} from '../src/lib/managerCandidateView.mjs'

const worker={worker_id:'SYNTHETIC_WORKER_1',worker_state:'active'}
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8')

test('account existence and employment state never imply password setup or login',()=>{
 assert.equal(candidateStage(worker),'همکاری فعال')
 assert.equal(candidateOnboardingLabel(worker),'اطلاعات راه‌اندازی در دسترس نیست')
 assert.equal(candidateAuthSignInLabel(worker),'اطلاعات ورود در دسترس نیست')
 assert.equal(candidateOnboardingLabel({...worker,worker_onboarding_state:'password_required'}),'در انتظار تکمیل تعیین رمز')
 assert.equal(candidateOnboardingLabel({...worker,worker_onboarding_state:'ready'}),'راه‌اندازی حساب تکمیل‌شده')
 assert.equal(candidateOnboardingLabel({...worker,worker_onboarding_state:'unexpected'}),'اطلاعات راه‌اندازی در دسترس نیست')
 assert.equal(candidateOnboardingLabel({}),'حساب دانشجوکار ایجاد نشده')
})

test('auth sign-in is shown only when the authorized backend confirms an Auth account',()=>{
 const exists={...worker,worker_auth_account_found:true}
 assert.equal(candidateAuthSignInLabel(exists),'ورودی در سرویس احراز هویت ثبت نشده')
 assert.equal(candidateAuthSignInLabel({...exists,worker_last_auth_sign_in_at:'INVALID'}),'زمان ورود نامعتبر است')
 assert.equal(candidateAuthSignInLabel({...worker,worker_auth_account_found:false}),'حساب احراز هویت متناظر یافت نشد')
 assert.equal(candidateAuthSignInLabel({...worker,worker_last_auth_sign_in_at:'2026-11-11T09:00:00Z'}),'اطلاعات ورود در دسترس نیست','legacy RPC fields remain unknown')
 const actual=candidateAuthSignInLabel({...exists,worker_last_auth_sign_in_at:'2026-11-11T09:00:00Z'})
 assert.match(actual,/۱۴۰۵/)
 assert.notEqual(actual,'ورودی در سرویس احراز هویت ثبت نشده')
 assert.equal(candidateAuthSignInLabel({}),'حساب دانشجوکار ایجاد نشده')
})

test('the manager UI remains read-only: no direct auth.users query, invitation or password reset',()=>{
 const app=read('../src/OpsApp.jsx')
 const board=read('../src/components/ManagerCandidatesWorkspace.jsx')
 const caller=read('../src/lib/operations.js')
 assert.match(app,/راه‌اندازی حساب: \{candidateOnboardingLabel\(candidate\)\}/)
 assert.match(app,/آخرین ورود در سرویس احراز هویت: \{candidateAuthSignInLabel\(candidate\)\}/)
 assert.match(app,/دریافت یا بازشدن ایمیل دعوت/)
 assert.match(board,/row\.worker_id && row\.worker_onboarding_state/)
 assert.match(caller,/rpc\('ops_list_candidates'\)/)
 assert.doesNotMatch(board,/auth\.users|signIn|resetPasswordForEmail|functions\.invoke/)
 assert.doesNotMatch(app,/\.from\(['"]auth\.users['"]\)/)
})
