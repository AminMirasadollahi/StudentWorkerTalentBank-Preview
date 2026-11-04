import test from 'node:test'
import assert from 'node:assert/strict'
import {
 AUTO_TERM_REASON,AUTO_POOL_REASON,automaticPoolLabel,wholeHoursToMinutes,
 minutesToWholeHours,normalizeDigits,termChanged,poolChanged,sameUnits,
} from '../src/lib/termSettingsInput.mjs'

test('Arabic and Persian keyboard hours convert to exact integer minutes',()=>{
 assert.equal(wholeHoursToMinutes('۴۱۱'),24660)
 assert.equal(wholeHoursToMinutes('١٠٠'),6000)
 assert.equal(wholeHoursToMinutes('۰'),0)
 assert.equal(wholeHoursToMinutes('  411 '),24660)
 for(const value of ['','-1','1.5','1e3','5a','33334','∞','+1','４１１'])
  assert.equal(wholeHoursToMinutes(value),null,String(value))
 assert.equal(minutesToWholeHours(24660),'411')
 assert.equal(minutesToWholeHours(6000),'100')
 assert.equal(minutesToWholeHours(24661),'') // never round an existing legacy minute value
 assert.equal(normalizeDigits(' ۴۱١ '),'411')
})
test('auto title names units, not a redundant manually-entered group',()=>{
 assert.equal(automaticPoolLabel(['research','library']),'کتابخانه و پژوهش')
 assert.equal(automaticPoolLabel(['public_relations']),'روابط عمومی')
 assert.equal(automaticPoolLabel([]),'')
 assert.equal(sameUnits(['library','research'],['research','library']),true)
 assert.equal(sameUnits(['library','library'],['library','research']),false)
})
test('only actual edits need free-text reason; creation reasons are audit tagged',()=>{
 assert.match(AUTO_TERM_REASON,/خودکار/)
 assert.match(AUTO_POOL_REASON,/خودکار/)
 const t={label:'نیمسال تست',start_date:'2030-01-01',end_date:'2030-06-30'}
 assert.equal(termChanged(t,{label:t.label,start:t.start_date,end:t.end_date}),false)
 assert.equal(termChanged(t,{label:t.label,start:t.start_date,end:'2030-06-20'}),true)
 const p={label:'کتابخانه و پژوهش',units:['library','research'],allocated_minutes:24660}
 assert.equal(poolChanged(p,{label:p.label,units:['research','library'],allocatedMinutes:24660}),false)
 assert.equal(poolChanged(p,{label:p.label,units:p.units,allocatedMinutes:6000}),true)
 assert.equal(poolChanged(p,{label:p.label,units:['library'],allocatedMinutes:24660}),true)
})
