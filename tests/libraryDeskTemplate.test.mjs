import test from 'node:test'
import assert from 'node:assert/strict'
import {LIBRARY_DESK_TEMPLATE,canDraftLibraryDeskGroup} from '../src/lib/libraryDeskTemplate.mjs'

test('library desk template is in Persian and fits the existing assignment backend contract',()=>{
 assert.equal(LIBRARY_DESK_TEMPLATE.unit,'library')
 assert.ok(LIBRARY_DESK_TEMPLATE.title.length>=8&&LIBRARY_DESK_TEMPLATE.title.length<=160)
 assert.ok(LIBRARY_DESK_TEMPLATE.instructions.length>=300&&LIBRARY_DESK_TEMPLATE.instructions.length<=3000)
 for(const term of ['جست‌وجوی','قفسه','امانت','برگشتی','شناسه','تأیید مدیر'])
   assert.ok(LIBRARY_DESK_TEMPLATE.instructions.includes(term),term)
 assert.equal(LIBRARY_DESK_TEMPLATE.maxPerRoutineShift,2)
})
test('routine template restricts one group to 1-2, never claims a global simultaneous capacity guarantee',()=>{
 for(const n of [1,2])
  assert.equal(canDraftLibraryDeskGroup('library',true,n),true)
 for(const n of [0,3,4,NaN,-1,1.4])
  assert.equal(canDraftLibraryDeskGroup('library',true,n),false)
 assert.equal(canDraftLibraryDeskGroup('research',true,3),true)
 assert.equal(canDraftLibraryDeskGroup('library',false,3),true)
})
