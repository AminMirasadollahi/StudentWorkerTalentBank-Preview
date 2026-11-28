import test from 'node:test'
import assert from 'node:assert/strict'
import {visibleManagerGroups,currentManagerDestination,nextManagerNavigation,managerR5SubViews} from '../src/lib/managerWorkspaceNav.mjs'
const flags={r5IaEnabled:true}
const flat=f=>visibleManagerGroups(f).flatMap(g=>g.items)
test('R5 maps all eleven authorized existing views to six unique parents only when opted in',()=>{
 assert.equal(flat({}).length,11)
 const parents=flat(flags);assert.equal(parents.length,6)
 const children=parents.flatMap(p=>p.children);assert.equal(children.length,11)
 assert.equal(new Set(children.map(x=>x.section+'/'+x.view)).size,11)
 for(const p of parents)for(const c of p.children){
  const nav={section:c.section,workView:c.section==='work'?c.view:'inbox',candidateView:c.section==='candidates'?c.view:'applicants',taskSearch:'retain'}
  assert.equal(currentManagerDestination(nav,flags).id,p.id)
  assert.equal(nextManagerNavigation(nav,p),nav)
  assert.equal(managerR5SubViews(nav,flags).length,p.children.length)
  assert.equal(nextManagerNavigation(nav,c).taskSearch,'retain')
 }
})
test('legacy fixture alias and explicit release flag produce the same six-space map',()=>{
 const legacy=visibleManagerGroups({r5IaFixture:true}),enabled=visibleManagerGroups(flags)
 assert.deepEqual(legacy.map(g=>g.items.map(i=>i.id)),enabled.map(g=>g.items.map(i=>i.id)))
})
test('disabled features remain absent; grouped parent never routes to disabled children',()=>{
 const f={...flags,workPoolEnabled:false,termMembershipEnabled:false}
 const children=flat(f).flatMap(p=>p.children)
 assert.equal(children.length,9)
 assert.ok(!children.some(x=>['workPool','termMemberships'].includes(x.id)))
 assert.equal(flat(f).length,6)
})
