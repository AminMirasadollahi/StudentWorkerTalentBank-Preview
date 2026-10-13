import test from 'node:test'
import assert from 'node:assert/strict'
import {
  persianDayParts,persianMonthBounds,persianMonthCells,plusIsoDays,
  previousPersianMonth,nextPersianMonth
} from '../src/lib/persianMonthCalendar.mjs'

test('Mehr 1405 is precisely Persian calendar month from Sep 23 to Oct 22',()=>{
 const month=persianMonthBounds('2026-10-13')
 assert.equal(month.start,'2026-09-23')
 assert.equal(month.end,'2026-10-22')
 assert.deepEqual({year:month.year,month:month.month},{year:1405,month:7})
 assert.equal(persianDayParts('2026-10-13').day,21)
 assert.deepEqual(persianMonthBounds(month.end),month)
})
test('Saturday-first calendar never leaks a neighboring month as a selectable date',()=>{
 const grid=persianMonthCells('2026-10-13')
 assert.ok(grid.days.length%7===0)
 const populated=grid.days.filter(Boolean)
 assert.equal(populated[0].date,grid.start)
 assert.equal(populated.at(-1).date,grid.end)
 assert.equal(populated.length,30)
 assert.equal(populated[0].day,1)
 assert.equal(populated.at(-1).day,30)
})
test('Persian month navigation rolls through different Gregorian boundaries and Esfand leap years',()=>{
 const first=persianMonthBounds('2026-10-13')
 assert.equal(persianMonthBounds(previousPersianMonth('2026-10-13')).month,6)
 assert.equal(persianMonthBounds(nextPersianMonth('2026-10-13')).month,8)
 assert.equal(plusIsoDays('2026-12-31',1),'2027-01-01')
 assert.ok([29,30].includes(persianMonthCells('2026-03-10').days.filter(Boolean).length))
 assert.throws(()=>plusIsoDays('2026-02-31',1))
})
