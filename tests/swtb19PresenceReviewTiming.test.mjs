import test from 'node:test'
import assert from 'node:assert/strict'
import {presenceReviewTiming} from '../src/lib/presenceReviewTiming.mjs'

const at=t=>Date.parse(t)
test('Tehran midnight 48h threshold is an exact instant, not two calendar-day estimates',()=>{
 const target='2026-11-21'
 assert.deepEqual(presenceReviewTiming(target,at('2026-11-18T23:59:59+03:30')),{state:'direct',requiresReview:false})
 assert.deepEqual(presenceReviewTiming(target,at('2026-11-19T00:00:00+03:30')),{state:'review',requiresReview:true})
 assert.equal(presenceReviewTiming('2026-11-20',at('2026-11-18T17:20:00+03:30')).requiresReview,true)
 assert.equal(presenceReviewTiming('2026-11-29',at('2026-11-18T17:20:00+03:30')).state,'direct')
})
test('Tehran target day remains review-only through last millisecond, then past',()=>{
 const date='2026-11-21'
 assert.equal(presenceReviewTiming(date,at('2026-11-21T23:59:59.999+03:30')).state,'review')
 assert.equal(presenceReviewTiming(date,at('2026-11-22T00:00:00+03:30')).state,'past')
})
test('invalid input cannot be reclassified as safely direct',()=>{
 for(const date of ['',null,'2026-02-30','2026-13-01','2026-11-9','tomorrow']){
  assert.equal(presenceReviewTiming(date,Date.now()).state,'invalid')
 }
 assert.equal(presenceReviewTiming('2026-11-21',NaN).state,'invalid')
 assert.equal(presenceReviewTiming('2026-11-21',Date.now(),-1).state,'invalid')
})
test('future policy hours can change presentation, not server authorization',()=>{
 const now=at('2026-11-19T12:00:00+03:30')
 assert.equal(presenceReviewTiming('2026-11-21',now,48).state,'review')
 assert.equal(presenceReviewTiming('2026-11-21',now,24).state,'direct')
})
