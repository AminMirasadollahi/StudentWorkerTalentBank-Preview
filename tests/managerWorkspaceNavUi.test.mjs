import test,{before,after} from 'node:test'
import assert from 'node:assert/strict'
import {JSDOM} from 'jsdom'
import {act,createElement,useState} from 'react'
import {createServer} from 'vite'
import {
 visibleManagerGroups,currentManagerDestination,nextManagerNavigation,
} from '../src/lib/managerWorkspaceNav.mjs'

let dom,server,Nav,createRoot
before(async()=>{
 dom=new JSDOM('<!doctype html><html lang="fa"><body></body></html>',{
  url:'https://synthetic.invalid',pretendToBeVisual:true,
 })
 globalThis.window=dom.window
 globalThis.document=dom.window.document
 globalThis.HTMLElement=dom.window.HTMLElement
 globalThis.IS_REACT_ACT_ENVIRONMENT=true
 ;({createRoot}=await import('react-dom/client'))
 server=await createServer({server:{middlewareMode:true},appType:'custom',logLevel:'error'})
 Nav=(await server.ssrLoadModule('/src/components/ManagerWorkspaceNav.jsx')).default
})
after(async()=>{
 await server?.close();dom?.window.close()
 for(const k of ['window','document','HTMLElement','IS_REACT_ACT_ENVIRONMENT'])
  delete globalThis[k]
})
const initial=()=>({
 section:'candidates',candidateView:'applicants',workView:'tasks',
 taskSearch:'حفظ فیلتر',taskWorkerId:'worker-synthetic',
 historyFrom:'2026-11-01',profileWorkerId:'existing',
})
const flatten=flags=>visibleManagerGroups(flags).flatMap(x=>x.items)
test('route inventory covers every existing manager destination exactly once',()=>{
 const ids=flatten({workPoolEnabled:true,termMembershipEnabled:true}).map(x=>x.id)
 assert.equal(ids.length,11)
 assert.equal(new Set(ids).size,ids.length)
 assert.deepEqual(ids,[
  'inbox','tasks','workPool','availability','approvals',
  'applicants','profiles','termMemberships','terms','history','candidateReport'])
 assert.equal(currentManagerDestination(initial()).id,'applicants')
})
test('feature-disabled views are removed from the manager navigation',()=>{
 const flags={workPoolEnabled:false,termMembershipEnabled:false}
 const ids=flatten(flags).map(x=>x.id)
 assert.ok(!ids.includes('workPool'))
 assert.ok(!ids.includes('termMemberships'))
 assert.equal(ids.length,9)
 assert.equal(currentManagerDestination({...initial(),section:'work',workView:'workPool'},flags).id,'inbox')
})
test('route selection only patches the destination, preserving all manager filters',()=>{
 const nav=initial()
 const destination=flatten().find(x=>x.id==='workPool')
 const next=nextManagerNavigation(nav,destination)
 assert.equal(next.section,'work')
 assert.equal(next.workView,'workPool')
 assert.equal(next.candidateView,'applicants')
 assert.equal(next.taskSearch,'حفظ فیلتر')
 assert.equal(next.taskWorkerId,'worker-synthetic')
 assert.equal(next.historyFrom,'2026-11-01')
 assert.equal(nav.section,'candidates','never mutate the original state')
 const report=nextManagerNavigation(next,flatten().find(x=>x.id==='candidateReport'))
 assert.equal(report.section,'candidates')
 assert.equal(report.candidateView,'report')
 assert.equal(report.workView,'workPool','return path must be retained')
})
async function mount(flags={}){
 const host=document.createElement('div');document.body.append(host)
 const root=createRoot(host)
 let snapshot=initial()
 function Harness(){
  const [navigation,setNavigation]=useState(initial)
  snapshot=navigation
  return createElement(Nav,{navigation,...flags,
   onNavigate:item=>setNavigation(previous=>nextManagerNavigation(previous,item))})
 }
 await act(async()=>root.render(createElement(Harness)))
 return {host,get snapshot(){return snapshot},
  cleanup:async()=>{await act(async()=>root.unmount());host.remove()}}
}
const route=(host,id)=>host.querySelector('[data-swtb22-route="'+id+'"]')
test('native grouped manager navigation activates one route and retains contextual state',async()=>{
 const ui=await mount()
 try{
  const nav=ui.host.querySelector('nav[aria-label="بخش‌های فضای مدیریت"]')
  assert.ok(nav)
  assert.equal(ui.host.querySelectorAll('nav').length,1)
  assert.equal(ui.host.querySelectorAll('nav h2').length,3)
  assert.equal(route(ui.host,'applicants').getAttribute('aria-current'),'page')
  assert.equal(ui.host.querySelectorAll('[aria-current="page"]').length,1)
  await act(async()=>route(ui.host,'workPool').click())
  assert.equal(route(ui.host,'workPool').getAttribute('aria-current'),'page')
  assert.equal(route(ui.host,'applicants').hasAttribute('aria-current'),false)
  assert.equal(ui.snapshot.taskSearch,'حفظ فیلتر')
  assert.equal(ui.snapshot.workView,'workPool')
  await act(async()=>route(ui.host,'candidateReport').click())
  assert.equal(ui.snapshot.candidateView,'report')
  assert.equal(ui.snapshot.workView,'workPool')
  assert.equal(ui.host.querySelectorAll('[aria-current="page"]').length,1)
 }finally{await ui.cleanup()}
})
test('sidebar collapse is keyboard-button action with accessible expanded state',async()=>{
 const ui=await mount()
 try{
  const b=ui.host.querySelector('.swtb22-manager-collapse')
  assert.equal(b.getAttribute('aria-expanded'),'true')
  assert.equal(b.getAttribute('aria-controls'),'swtb22-manager-route-list')
  await act(async()=>b.click())
  assert.equal(b.getAttribute('aria-expanded'),'false')
  assert.ok(ui.host.querySelector('aside.is-collapsed'))
  assert.ok(route(ui.host,'tasks').getAttribute('title'))
  await act(async()=>b.click())
  assert.ok(!ui.host.querySelector('aside.is-collapsed'))
 }finally{await ui.cleanup()}
})
test('flagged-off navigation never mounts hidden work pool or term membership buttons',async()=>{
 const ui=await mount({workPoolEnabled:false,termMembershipEnabled:false})
 try{
  assert.equal(route(ui.host,'workPool'),null)
  assert.equal(route(ui.host,'termMemberships'),null)
  assert.ok(route(ui.host,'approvals'))
 }finally{await ui.cleanup()}
})
