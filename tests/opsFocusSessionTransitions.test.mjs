import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { act, createElement } from 'react'
import { createServer } from 'vite'

let dom, vite, OpsApp, createRoot
let currentIdentity, deferredIdentity
let issuedAuthEvents = new Set()
const userA = Object.freeze({ id: 'FAKE_WORKER_AUTH_ID', email: 'qa-a@example.invalid' })
const userB = Object.freeze({ id: 'FAKE_OTHER_AUTH_ID' })
const worker = (state = 'active', onboarding_state = 'ready', user = userA) => ({
  role: state === 'paused' || state === 'inactive' ? 'worker_disabled' : 'worker',
  user, profile: {
    worker_id: 'FAKE_WORKER_ID', name: 'دانشجوکار ساختگی فقط آزمون',
    unit: 'library', state, onboarding_state,
  },
})
const admin = (user = userA) => ({ role: 'admin', user })
const stub = {
  name: 'ops-session-test-stubs',
  enforce: 'pre',
  resolveId(source, importer) {
    if (importer?.endsWith('/src/OpsApp.jsx') && source === './lib/operations') {
      return '\0qa-session-auth-client'
    }
    if (importer?.endsWith('/src/OpsApp.jsx') && source === './OperationsWorkspace') {
      return '\0qa-session-workspaces'
    }
  },
  load(id) {
    if (id === '\0qa-session-auth-client') {
      return [
        'export const opsClient = { auth: {',
        '  onAuthStateChange(callback) { globalThis.__authListeners.add(callback);',
        '    return {data:{subscription:{unsubscribe() { globalThis.__authListeners.delete(callback) }}}} },',
        '  updateUser: async () => ({error:null}),',
        '  getSession: async () => ({data:{session:globalThis.__qaHasLocalSession ? {access_token:"SYNTHETIC_ONLY"} : null},error:null}),',
        '  resetPasswordForEmail: async () => ({error:null}),',
        '}, functions: {invoke:async () => ({error:new Error("QA_FORBIDDEN")})}};',
        'export const currentOperationsIdentity = async () => globalThis.__getQaIdentity();',
        'export const getOperationsCandidates = async () => {globalThis.__qaCandidateReads=(globalThis.__qaCandidateReads||0)+1;return []};',
        'export const provisionWorker = async () => {throw new Error("QA_FORBIDDEN")};',
        'export const setCandidateScreening = async () => {throw new Error("QA_FORBIDDEN")};',
        'export const setCandidateEmail = async () => {throw new Error("QA_FORBIDDEN")};',
        'export const signInOperations = async () => ({}) ;',
        'export const signOutOperations = async () => {globalThis.__authListeners.forEach(f=>f("SIGNED_OUT"));};',
      ].join('\n')
    }
    if (id === '\0qa-session-workspaces') {
      return [
        'import React from "react";',
        'export function AdminOperations({refreshRevision=0}){React.useEffect(()=>{globalThis.__qaAdminMounts=(globalThis.__qaAdminMounts||0)+1},[]);React.useEffect(()=>{globalThis.__qaAdminReads=(globalThis.__qaAdminReads||0)+1},[refreshRevision]);return React.createElement("div", {"data-testid":"admin-work"}, "ADMIN_WORK_MOUNTED")}',
        'export function WorkerOperations({refreshRevision=0}){React.useEffect(()=>{globalThis.__qaWorkerReads=(globalThis.__qaWorkerReads||0)+1},[refreshRevision]);return React.createElement("div", {"data-testid":"worker-work"}, "WORKER_WORK_MOUNTED")}',
      ].join('\n')
    }
  },
}
before(async () => {
  dom = new JSDOM('<!doctype html><html lang="fa"><body></body></html>', {
    url: 'http://example.invalid/operations-session-qa', pretendToBeVisual: true,
  })
  globalThis.window = dom.window
  globalThis.document = dom.window.document
  globalThis.HTMLElement = dom.window.HTMLElement
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  globalThis.__authListeners = issuedAuthEvents
  globalThis.__qaHasLocalSession = false
  globalThis.__getQaIdentity = () => {
    if (deferredIdentity) return deferredIdentity
    return currentIdentity
  }
  // Browser visibility is a read-only DOM property.
  Object.defineProperty(dom.window.document, 'visibilityState', { configurable: true, get: () => 'visible' })
  ;({ createRoot } = await import('react-dom/client'))
  vite = await createServer({
    plugins: [stub], server: { middlewareMode: true },
    appType: 'custom', logLevel: 'error',
  })
  OpsApp = (await vite.ssrLoadModule('/src/OpsApp.jsx')).default
})
after(async () => {
  await vite?.close()
  dom?.window.close()
  delete globalThis.__getQaIdentity
  delete globalThis.__authListeners
  delete globalThis.__qaHasLocalSession
  delete globalThis.IS_REACT_ACT_ENVIRONMENT
  delete globalThis.window
  delete globalThis.document
  delete globalThis.HTMLElement
})

function userVisibleText(host) {
  const clone=host.cloneNode(true)
  for(const element of clone.querySelectorAll('[hidden], [aria-hidden="true"]'))element.remove()
  return clone.textContent
}

async function mount(initial = worker(), mode = initial.role === 'admin' ? 'admin' : 'worker') {
  globalThis.__qaHasLocalSession = false
  currentIdentity = initial
  deferredIdentity = null
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  await act(async () => { root.render(createElement(OpsApp, {mode})) })
  async function resolve(identity) {
    currentIdentity = identity
    deferredIdentity = null
    await act(async () => {
      window.dispatchEvent(new window.Event('blur'))
      window.dispatchEvent(new window.Event('focus'))
      await Promise.resolve()
    })
  }
  async function pending() {
    let release
    deferredIdentity = new Promise(resolve => { release = resolve })
    await act(async () => {
      window.dispatchEvent(new window.Event('blur'))
      window.dispatchEvent(new window.Event('focus'))
      await Promise.resolve()
    })
    assert.match(userVisibleText(host), /بررسی کوتاه دسترسی/)
    assert.doesNotMatch(userVisibleText(host), /WORKER_WORK_MOUNTED|ADMIN_WORK_MOUNTED/)
    const frozen=host.querySelector('.ops-recheck-frozen[inert][aria-hidden="true"]')
    assert.ok(frozen,'the still-mounted operational DOM must stay inert and a11y-suppressed')
    assert.equal(frozen.hasAttribute('hidden'),false,'keep geometry and scroll stable')
    assert.ok(host.querySelector('.ops-recheck-curtain[role="status"]'),
      'opaque data-free placeholder is rendered instead of login-like route')
    return async value => {
      deferredIdentity = null
      currentIdentity = value
      await act(async () => { release(value) })
    }
  }
  async function fail() {
    deferredIdentity = Promise.reject(new Error('synthetic disconnect'))
    await act(async () => {
      window.dispatchEvent(new window.Event('blur'))
      window.dispatchEvent(new window.Event('focus'))
      await Promise.resolve()
    })
    deferredIdentity = null
  }
  async function unmount() {
    await act(async () => root.unmount())
    host.remove()
  }
  return {host, resolve, pending, fail, unmount}
}

test('active/ready shows work, and pending resume hides it before reading permission', async () => {
  const ui = await mount()
  try {
    assert.match(ui.host.textContent, /WORKER_WORK_MOUNTED/)
    const release = await ui.pending()
    await release(worker('paused'))
    assert.match(ui.host.textContent, /موقتاً تعلیق شده است/)
    assert.doesNotMatch(ui.host.textContent, /WORKER_WORK_MOUNTED|ADMIN_WORK_MOUNTED|تغییر رمز عبور/)
  } finally { await ui.unmount() }
})
test('inactive is also a restricted, zero-work view; restored active shows work', async () => {
  const ui = await mount(worker('inactive'))
  try {
    assert.match(ui.host.textContent, /غیرفعال شده است/)
    assert.doesNotMatch(ui.host.textContent, /WORKER_WORK_MOUNTED|ADMIN_WORK_MOUNTED/)
    await ui.resolve(worker('active'))
    assert.match(ui.host.textContent, /WORKER_WORK_MOUNTED/)
  } finally { await ui.unmount() }
})
test('active but password_required cannot mount work; ready resumes it', async () => {
  const ui = await mount(worker('active','ready'))
  try {
    assert.match(ui.host.textContent, /WORKER_WORK_MOUNTED/)
    await ui.resolve(worker('active','password_required'))
    assert.doesNotMatch(ui.host.textContent, /WORKER_WORK_MOUNTED/)
    assert.match(ui.host.textContent, /در اولین ورود، رمز اختصاصی خودتان را تعیین کنید/)
    await ui.resolve(worker('active','ready'))
    assert.match(ui.host.textContent, /WORKER_WORK_MOUNTED/)
  } finally { await ui.unmount() }
})
test('manager to worker and worker to manager replace privileged views', async () => {
  const ui = await mount(admin())
  try {
    assert.match(ui.host.textContent, /پذیرش داوطلبان/)
    await ui.resolve(worker())
    assert.doesNotMatch(ui.host.textContent, /پذیرش داوطلبان|ADMIN_WORK_MOUNTED/)
    assert.match(ui.host.textContent, /WORKER_WORK_MOUNTED/)
    await ui.resolve(admin())
    assert.match(ui.host.textContent, /پذیرش داوطلبان/)
    assert.doesNotMatch(ui.host.textContent, /WORKER_WORK_MOUNTED/)
  } finally { await ui.unmount() }
})
test('denied or lost access fails closed to the login screen', async () => {
  const ui = await mount(worker())
  try {
    await ui.resolve({role:'no_access',user:userA})
    assert.match(ui.host.textContent, /دسترسی این نشست دیگر معتبر نیست/)
    assert.doesNotMatch(ui.host.textContent, /WORKER_WORK_MOUNTED|ADMIN_WORK_MOUNTED/)
  } finally { await ui.unmount() }
})
test('transient identity check failure removes stale UI but offers read-only revalidation without reissuing links',async()=>{
  const ui=await mount(worker())
  try{
    await ui.fail()
    assert.match(userVisibleText(ui.host),/دسترسی نیازمند بررسی مجدد است/)
    assert.doesNotMatch(ui.host.textContent,/WORKER_WORK_MOUNTED|ADMIN_WORK_MOUNTED/)
    const retry=Array.from(ui.host.querySelectorAll('button')).find(b=>b.textContent.includes('بررسی دوبارهٔ دسترسی'))
    assert.ok(retry)
    await act(async()=>{retry.click();await Promise.resolve()})
    assert.match(userVisibleText(ui.host),/WORKER_WORK_MOUNTED/,
      'fresh online user+role check must restore account without password reset')
  }finally{await ui.unmount()}
})
test('temporary retry that proves session absent must show login, never cached operations',async()=>{
 const ui=await mount(worker())
 try{
   await ui.fail()
   currentIdentity=null
   const retry=Array.from(ui.host.querySelectorAll('button')).find(b=>b.textContent.includes('بررسی دوبارهٔ دسترسی'))
   await act(async()=>{retry.click();await Promise.resolve()})
   assert.match(userVisibleText(ui.host),/ورود به/)
   assert.doesNotMatch(ui.host.textContent,/WORKER_WORK_MOUNTED|ADMIN_WORK_MOUNTED/)
 }finally{await ui.unmount()}
})

test('focus recheck preserves the same mounted admin workspace until fresh authorization and drops it on role change',async()=>{
  globalThis.__qaAdminMounts=0
  const ui=await mount(admin())
  try{
    const workTab=Array.from(ui.host.querySelectorAll('button')).find(x=>x.textContent==='برنامه و کارها')
    assert.ok(workTab)
    await act(async()=>{workTab.click()})
    assert.match(userVisibleText(ui.host),/ADMIN_WORK_MOUNTED/)
    assert.equal(globalThis.__qaAdminMounts,1)
    const release=await ui.pending()
    assert.equal(globalThis.__qaAdminMounts,1,'no remount during recheck')
    assert.doesNotMatch(userVisibleText(ui.host),/ADMIN_WORK_MOUNTED/)
    await release(admin())
    assert.equal(globalThis.__qaAdminMounts,1,'successful same-principal recheck preserves form state')
    assert.match(userVisibleText(ui.host),/ADMIN_WORK_MOUNTED/)
    await ui.resolve(worker())
    assert.doesNotMatch(userVisibleText(ui.host),/ADMIN_WORK_MOUNTED/)
    assert.match(userVisibleText(ui.host),/WORKER_WORK_MOUNTED/)
  }finally{await ui.unmount();delete globalThis.__qaAdminMounts}
})

test('a different authenticated principal in a second tab never silently replaces the first worker',async()=>{
  const ui=await mount(worker())
  try{
    await ui.resolve(worker('active','ready',userB))
    assert.match(userVisibleText(ui.host),/نشست مرورگر به حساب دیگری تغییر کرده است/)
    assert.doesNotMatch(ui.host.textContent,/WORKER_WORK_MOUNTED|ADMIN_WORK_MOUNTED/)
    assert.match(userVisibleText(ui.host),/ورود به/)
  }finally{await ui.unmount()}
})
test('cached session after missing online identity must be blocked until server revalidation; no local token grants access',async()=>{
 const ui=await mount(worker())
 try{
   await ui.fail()
   globalThis.__qaHasLocalSession=true
   currentIdentity=null
   const retry=Array.from(ui.host.querySelectorAll('button')).find(b=>b.textContent.includes('بررسی دوبارهٔ دسترسی'))
   await act(async()=>{retry.click();await Promise.resolve()})
   assert.match(userVisibleText(ui.host),/دسترسی نیازمند بررسی مجدد است/)
   assert.doesNotMatch(ui.host.textContent,/WORKER_WORK_MOUNTED|ADMIN_WORK_MOUNTED/)
   currentIdentity=worker()
   const retry2=Array.from(ui.host.querySelectorAll('button')).find(b=>b.textContent.includes('بررسی دوبارهٔ دسترسی'))
   await act(async()=>{retry2.click();await Promise.resolve()})
   assert.match(userVisibleText(ui.host),/WORKER_WORK_MOUNTED/)
 }finally{await ui.unmount()}
})
test('authenticated worker can see their OWN login email but no foreign user email',async()=>{
 const ui=await mount(worker())
 try{
  assert.match(userVisibleText(ui.host),/qa-a@example.invalid/)
  assert.doesNotMatch(userVisibleText(ui.host),/qa-b@example.invalid/)
 }finally{await ui.unmount()}
})

test('P0: worker browser title, manual reload and same-principal refocus all target worker projection',async()=>{
 globalThis.__qaWorkerReads=0
 const ui=await mount(worker())
 try {
  assert.equal(document.title,'پنل اختصاصی دانشجوکار | SWTB')
  assert.equal(globalThis.__qaWorkerReads,1,'worker initially loads once')
  const refresh=Array.from(ui.host.querySelectorAll('button')).find(b=>b.textContent==='به‌روزرسانی')
  assert.ok(refresh,'worker dashboard must offer explicit refresh without browser F5')
  await act(async()=>{refresh.click();await Promise.resolve()})
  assert.equal(globalThis.__qaWorkerReads,2,'worker button rereads own protected data')
  const pending=await ui.pending()
  assert.equal(globalThis.__qaWorkerReads,2,'no work refresh while online identity is uncertain')
  await pending(worker())
  assert.equal(globalThis.__qaWorkerReads,3,'authorized refocus requests an updated worker projection')
  assert.equal(document.title,'پنل اختصاصی دانشجوکار | SWTB')
  assert.equal(ui.host.querySelectorAll('[data-testid="worker-work"]').length,1,'worker view retains mounted React state')
 } finally {await ui.unmount();delete globalThis.__qaWorkerReads}
})

test('P0: manager title, header refresh of active work tab, tab-switch candidate invalidation',async()=>{
 globalThis.__qaAdminReads=0
 globalThis.__qaCandidateReads=0
 const ui=await mount(admin())
 try {
  assert.equal(document.title,'مدیریت دانشجوکارها | SWTB')
  assert.equal(globalThis.__qaCandidateReads,1,'initial candidate fetch')
  const workTab=Array.from(ui.host.querySelectorAll('button')).find(b=>b.textContent==='برنامه و کارها')
  await act(async()=>{workTab.click()})
  assert.equal(globalThis.__qaAdminReads,1,'work section loads when mounted')
  const header=Array.from(ui.host.querySelectorAll('button')).find(b=>b.textContent==='به‌روزرسانی')
  assert.ok(header)
  await act(async()=>{header.click();await Promise.resolve()})
  assert.equal(globalThis.__qaAdminReads,2,'header button targets active work module')
  assert.equal(globalThis.__qaCandidateReads,1,'not the hidden candidate list')
  await ui.resolve(admin())
  assert.equal(globalThis.__qaAdminReads,3,'valid identity on refocus triggers work readback')
  const candidateTab=Array.from(ui.host.querySelectorAll('button')).find(b=>b.textContent==='پذیرش داوطلبان')
  await act(async()=>{candidateTab.click();await Promise.resolve()})
  assert.equal(globalThis.__qaCandidateReads,2,'return to applicant module refreshes stale candidate data')
 }finally{await ui.unmount();delete globalThis.__qaAdminReads;delete globalThis.__qaCandidateReads}
})

test('P0: revoked online identity never refreshes the old privileged projection',async()=>{
 globalThis.__qaWorkerReads=0
 const ui=await mount(worker())
 try{
  assert.equal(globalThis.__qaWorkerReads,1)
  await ui.resolve({role:'no_access',user:userA})
  assert.equal(globalThis.__qaWorkerReads,1,'permission revocation cannot authorize a data refetch')
  assert.doesNotMatch(userVisibleText(ui.host),/WORKER_WORK_MOUNTED/)
 }finally{await ui.unmount();delete globalThis.__qaWorkerReads}
})
