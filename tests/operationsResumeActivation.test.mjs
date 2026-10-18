import test from 'node:test'
import assert from 'node:assert/strict'
import {watchOperationsResume} from '../src/lib/operationsResume.mjs'

async function settle() { for (let i=0;i<8;i++) await Promise.resolve() }

function setup(readIdentity = async () => ({user:'A',role:'worker'})) {
  const win = new EventTarget()
  const doc = new EventTarget()
  let visibility='visible'
  Object.defineProperty(doc,'visibilityState',{get:()=>visibility})
  const events=[]
  const dispose=watchOperationsResume({
    windowTarget:win, documentTarget:doc, readIdentity,
    onStart:()=>events.push('START'),
    onIdentity:who=>events.push('OK:'+who.user),
    onFailure:()=>events.push('FAIL'),
    onFinish:()=>events.push('FINISH'),
  })
  return {
    events, dispose,
    focus:()=>win.dispatchEvent(new Event('focus')),
    blur:()=>win.dispatchEvent(new Event('blur')),
    visible:()=>{visibility='visible';doc.dispatchEvent(new Event('visibilitychange'))},
    hidden:()=>{visibility='hidden';doc.dispatchEvent(new Event('visibilitychange'))},
  }
}

test('focus + visibilitychange coalesce to a single fresh server identity verification',async()=>{
  let reads=0
  const s=setup(async()=>{reads++;return {user:'A'}})
  try {
    s.focus();s.visible();s.focus()
    await settle()
    assert.equal(reads,1)
    assert.deepEqual(s.events,['START','OK:A','FINISH'])
    s.blur();s.hidden();s.visible();s.focus()
    await settle()
    assert.equal(reads,2,'one NEW online check after a real leave-and-return')
    assert.deepEqual(s.events.slice(3),['START','OK:A','FINISH'])
  }finally{s.dispose()}
})

test('quick tab refocus with blur triggers revalidation even without hidden state',async()=>{
 let reads=0
 const s=setup(async()=>({user:String(++reads)}))
 try{
  s.focus();await settle()
  s.blur();s.focus();await settle()
  assert.equal(reads,2)
  assert.equal(s.events.filter(x=>x==='START').length,2)
 }finally{s.dispose()}
})

test('never start online authorization while background tab is hidden',async()=>{
 let reads=0
 const s=setup(async()=>{reads++;return {user:'A'}})
 try{
  s.hidden();s.focus()
  await settle()
  assert.equal(reads,0)
  s.visible();await settle()
  assert.equal(reads,1)
 }finally{s.dispose()}
})

test('late verification from an older activation is discarded and rechecked before unfreezing',async()=>{
 let readCount=0,resolveFirst
 const s=setup(()=>{
   readCount++
   if(readCount===1)return new Promise(resolve=>{resolveFirst=resolve})
   return Promise.resolve({user:'fresh'})
 })
 try{
  s.focus()
  assert.equal(readCount,1)
  s.blur();s.hidden();s.visible();s.focus()
  resolveFirst({user:'STALE'})
  await settle()
  assert.equal(readCount,2)
  assert.ok(!s.events.includes('OK:STALE'))
  assert.deepEqual(s.events,['START','START','OK:fresh','FINISH'])
 }finally{s.dispose()}
})

test('server authorization failure remains fail-closed',async()=>{
 const s=setup(async()=>{throw new Error('invalid session')})
 try{
  s.focus();await settle()
  assert.deepEqual(s.events,['START','FAIL','FINISH'])
 }finally{s.dispose()}
})

test('disposed observer ignores late identity responses and removes all handlers',async()=>{
 let release,reads=0
 const s=setup(()=>{
  reads++
  return new Promise(resolve=>{release=resolve})
 })
 s.focus()
 s.dispose()
 release({user:'A'})
 await settle()
 s.blur();s.visible();s.focus();await settle()
 assert.equal(reads,1)
 assert.deepEqual(s.events,['START'])
})

test('an old request completing while the browser stays blurred never authorizes until next focus',async()=>{
 let reads=0, releaseFirst
 const s=setup(()=>{
   reads++
   if(reads===1)return new Promise(resolve=>{releaseFirst=resolve})
   return Promise.resolve({user:'fresh'})
 })
 try {
  s.focus()
  s.blur()
  releaseFirst({user:'STALE'})
  await settle()
  assert.equal(reads,1,'must not send request while unfocused')
  assert.deepEqual(s.events,['START'],'must not reveal stale UI or finish recheck')
  s.focus();await settle()
  assert.equal(reads,2)
  assert.deepEqual(s.events,['START','START','OK:fresh','FINISH'])
 }finally{s.dispose()}
})
