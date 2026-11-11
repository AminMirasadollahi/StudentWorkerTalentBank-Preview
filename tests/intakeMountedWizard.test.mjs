// SWTB17 — mounted React intake QA with synthetic browser state only.
// No page deployment, real applicant, Auth, Supabase call or real submission.
import test,{before,after} from 'node:test'
import assert from 'node:assert/strict'
import {JSDOM} from 'jsdom'
import {createElement,act} from 'react'
import {createServer} from 'vite'

const STORAGE_KEY='student-worker-form-v2'
let dom,rootFactory,app,server,originalFetch
let outboundRequests=0

before(async()=>{
  dom=new JSDOM('<!doctype html><html lang="fa"><body></body></html>',{
    url:'https://synthetic.invalid/',pretendToBeVisual:true,
  })
  globalThis.window=dom.window
  globalThis.document=dom.window.document
  globalThis.HTMLElement=dom.window.HTMLElement
  globalThis.localStorage=dom.window.localStorage
  globalThis.IS_REACT_ACT_ENVIRONMENT=true
  dom.window.scrollTo=()=>{}
  dom.window.HTMLElement.prototype.scrollTo=()=>{}
  originalFetch=globalThis.fetch
  globalThis.fetch=async()=>{outboundRequests++;throw new Error('SWTB17_QA_NETWORK_FORBIDDEN')}
  ;({createRoot:rootFactory}=await import('react-dom/client'))
  server=await createServer({server:{middlewareMode:true},appType:'custom',logLevel:'error'})
  app=(await server.ssrLoadModule('/src/App.jsx')).default
})

after(async()=>{
  await server?.close()
  dom?.window.close()
  if(originalFetch)globalThis.fetch=originalFetch
  else delete globalThis.fetch
  for(const key of ['window','document','HTMLElement','localStorage','IS_REACT_ACT_ENVIRONMENT'])
    delete globalThis[key]
})

function fakeDraft(overrides={}){
  return {
    fullName:'دانشجوی کاملاً ساختگی',
    studentNumber:'۴۰۱۲۳۴۵۶۷',
    phone:'۰۹۱۲۳۴۵۶۷۸۹',
    socialPhone:'٠٩١٢٣٤٥٦٧٨٨',
    email:'student@synthetic.invalid',
    major:'آموزش ابتدایی',
    entryYear:'سایر',
    entryYearOther:'۱۳۹۷',
    currentSemester:4,
    primaryUnit:'library',
    secondaryUnits:[],
    availability:['شنبه|08-13'],
    selectedSkills:['book_shelving'],
    topSkills:['book_shelving'],
    hasExperience:false,
    experienceSummary:'',
    benefitExpectation:'یادگیری از کار واقعی',
    portfolioUrl:'',
    consentCurrent:true,
    consentTalentBank:false,
    ...overrides,
  }
}

async function mount(overrides={}){
  localStorage.clear()
  localStorage.setItem(STORAGE_KEY,JSON.stringify(fakeDraft(overrides)))
  const host=document.createElement('div');document.body.append(host)
  const root=rootFactory(host)
  await act(async()=>root.render(createElement(app)))
  return {host,cleanup:async()=>{await act(async()=>root.unmount());host.remove();localStorage.clear()}}
}

function currentStep(ui){
  const stage=ui.host.querySelector('main.experience-shell')
  assert.ok(stage,'public intake wizard is mounted')
  const className=stage.className
  const match=/\bstep-(\d+)\b/.exec(className)
  assert.ok(match,'step class present')
  return Number(match[1])
}

async function advance(ui,step){
  while(currentStep(ui)<step){
    const button=ui.host.querySelector('nav.nav-row button.btn-primary')
    assert.ok(button, 'step navigation exists')
    assert.equal(button.disabled,false,'next enabled at step '+currentStep(ui))
    await act(async()=>button.click())
  }
  assert.equal(currentStep(ui),step)
}

function typeInto(input,newValue){
  assert.ok(input,'input target exists')
  const proto=Object.getPrototypeOf(input)
  const nativeSetter=Object.getOwnPropertyDescriptor(proto,'value')?.set
  assert.ok(nativeSetter,'native value setter exists')
  nativeSetter.call(input,newValue)
  input.dispatchEvent(new window.Event('input',{bubbles:true}))
}

test('mounted public wizard accepts Persian/Arabic paste, keeps mobile leading zeros, and reads old drafts',async()=>{
  const ui=await mount()
  try{
    await advance(ui,4)
    const number=ui.host.querySelector('input[placeholder="401234567"]')
    assert.equal(number.value,'401234567','legacy student draft normalized on load')
    await act(async()=>typeInto(number,'۴۰١-۲۳۴۵۶۷'))
    assert.equal(number.value,'401234567')
    await advance(ui,5)
    const phone=ui.host.querySelector('input[autocomplete="tel"]')
    assert.equal(phone.value,'09123456789')
    const social=ui.host.querySelector('input[placeholder="اگر با شماره تماس فرق دارد"]')
    assert.equal(social.value,'09123456788')
    await act(async()=>typeInto(phone,'۰۹۱-٢٣٤ ۵۶۷۸۹'))
    assert.equal(phone.value,'09123456789')
    await act(async()=>typeInto(social,'٠٩١٢٣٤٥٦٧٨٨'))
    assert.equal(social.value,'09123456788')
    assert.equal(ui.host.querySelector('nav.nav-row button.btn-primary').disabled,false)
    const saved=JSON.parse(localStorage.getItem(STORAGE_KEY))
    assert.equal(saved.studentNumber,'401234567')
    assert.equal(saved.phone,'09123456789')
    assert.equal(saved.socialPhone,'09123456788')
    assert.equal(outboundRequests,0,'no external requests in mounted intake QA')
  }finally{await ui.cleanup()}
})

test('mounted step 7 refuses invalid custom year until a valid Persian entry is given',async()=>{
  const ui=await mount({entryYearOther:'۱۲۹۹'})
  try{
    await advance(ui,7)
    const year=ui.host.querySelector('input[placeholder="مثلاً ۱۳۹۷"]')
    assert.ok(year)
    assert.equal(year.value,'1299')
    let next=ui.host.querySelector('nav.nav-row button.btn-primary')
    assert.equal(next.disabled,true,'invalid year blocks moving beyond step 7')
    await act(async()=>typeInto(year,'۱۳۹۷'))
    assert.equal(year.value,'1397')
    next=ui.host.querySelector('nav.nav-row button.btn-primary')
    assert.equal(next.disabled,false,'valid year allows moving on')
    await act(async()=>next.click())
    assert.equal(currentStep(ui),8)
    assert.equal(outboundRequests,0)
  }finally{await ui.cleanup()}
})

test('mounted final review never deletes draft on cancel and only resets after confirmation',async()=>{
  const ui=await mount()
  const previousConfirm=window.confirm
  try{
    await advance(ui,18)
    const button=ui.host.querySelector('button.danger-link')
    assert.ok(button)
    const before=localStorage.getItem(STORAGE_KEY)
    const asks=[]
    window.confirm=message=>{asks.push(message);return false}
    await act(async()=>button.click())
    assert.equal(asks.length,1)
    assert.match(asks[0],/قابل بازگشت نیست/)
    assert.equal(currentStep(ui),18,'cancel retains review')
    assert.equal(localStorage.getItem(STORAGE_KEY),before,'cancel does not change stored draft')
    window.confirm=()=>true
    await act(async()=>button.click())
    assert.equal(currentStep(ui),1,'explicit consent resets to welcome')
    assert.equal(JSON.parse(localStorage.getItem(STORAGE_KEY)).fullName,'')
    assert.equal(JSON.parse(localStorage.getItem(STORAGE_KEY)).phone,'')
    assert.equal(outboundRequests,0,'never submit an application during QA')
  }finally{window.confirm=previousConfirm;await ui.cleanup()}
})
