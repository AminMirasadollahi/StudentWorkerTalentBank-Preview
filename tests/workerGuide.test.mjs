import test from 'node:test'
import assert from 'node:assert/strict'
import {WORKER_GUIDE_VERSION,GUIDE_SECTIONS,SECTION_GUIDES,
 getWorkerGuideSteps,workerGuideStorageKey,isWorkerGuideSection
} from '../src/lib/workerGuide.mjs'
test('same contextual definitions power whole application and isolated sections',()=>{
 const full=getWorkerGuideSteps('all')
 assert.equal(WORKER_GUIDE_VERSION,1)
 const counts={tasks:3,availability:4,history:3,profile:4}
 assert.equal(full.length,14,'the V4 overlay and profile shortcuts have own guide steps')
 assert.deepEqual(full,GUIDE_SECTIONS.flatMap(key=>getWorkerGuideSteps(key)))
 for(const section of GUIDE_SECTIONS){
  assert.equal(SECTION_GUIDES[section].length,counts[section])
  assert.equal(getWorkerGuideSteps(section).length,counts[section])
  assert.ok(getWorkerGuideSteps(section).every(item=>item.section===section))
 }
 assert.ok(full.some(item=>item.anchor==='availability-peers'))
 assert.ok(full.some(item=>item.anchor==='profile-shortcuts'))
})
test('every step has an explicit unique visible anchor and human instruction',()=>{
 const full=getWorkerGuideSteps()
 const seen=new Set()
 for(const step of full){
  assert.match(step.anchor,/^[a-z-]+$/)
  assert.ok(step.title.length>=4)
  assert.ok(step.description.length>=60)
  assert.ok(!seen.has(step.anchor),'each anchor unique: '+step.anchor)
  seen.add(step.anchor)
 }
 assert.ok(full.some(x=>x.description.includes('ساعت')))
 assert.ok(full.some(x=>x.description.includes('تأیید مدیر')))
})
test('invalid scope does not construct a tour or mix worker identities',()=>{
 assert.deepEqual(getWorkerGuideSteps('bogus'),[])
 assert.equal(workerGuideStorageKey(''),null)
 assert.equal(workerGuideStorageKey(null),null)
 assert.notEqual(workerGuideStorageKey('worker-a'),workerGuideStorageKey('worker-b'))
 assert.ok(workerGuideStorageKey('worker-a').includes('v'+WORKER_GUIDE_VERSION))
 assert.equal(isWorkerGuideSection('tasks'),true)
 assert.equal(isWorkerGuideSection('admin'),false)
})
