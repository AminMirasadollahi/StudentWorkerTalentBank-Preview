import test from 'node:test'
import assert from 'node:assert/strict'
import {clockMinute,minuteClock,deskInterval,projectDeskCoverage,visibleDeskShifts} from '../src/lib/libraryDeskShifts.mjs'
const shift=(worker,a,b,state='scheduled')=>({id:worker+'-'+a,worker_id:worker,
 start_minute:a,end_minute:b,state})
test('parse Tehran-local half-open time intervals without assuming a work duration',()=>{
 assert.deepEqual(deskInterval('09:00','11:15'),{startMinute:540,endMinute:675,minutes:135})
 assert.equal(deskInterval('11:00','11:00'),null)
 assert.equal(deskInterval('18:00','09:00'),null)
 for(const invalid of ['bad','24:01','-1:00','9:00','23:60','']){
  assert.equal(clockMinute(invalid),null)
 }
 assert.equal(clockMinute('24:00'),1440)
 assert.equal(minuteClock(675),'11:15')
 assert.equal(minuteClock(1440),'24:00')
})
test('cap two at every instant, not count of unrelated shifts in day',()=>{
 let rows=[shift('a',540,600),shift('b',600,660)]
 let p=projectDeskCoverage(rows,['c'],540,660)
 assert.equal(p.maxOccupied,1)
 assert.equal(p.allowed,true,'adjacent existing shifts leave a second seat for a longer new slot')
 p=projectDeskCoverage(rows,['c','d'],540,660)
 assert.equal(p.allowed,false)
 rows=[shift('a',540,640),shift('b',600,660)]
 p=projectDeskCoverage(rows,['c'],610,630)
 assert.equal(p.maxOccupied,2)
 assert.equal(p.allowed,false)
 assert.equal(p.available,0)
 assert.equal(projectDeskCoverage(rows,['c'],660,720).allowed,true)
})
test('one worker cannot occupy the same time twice and cancelled shifts free a seat',()=>{
 const rows=[shift('a',540,660),shift('b',540,660,'cancelled')]
 assert.equal(projectDeskCoverage(rows,['a'],600,650).workerOverlap,true)
 assert.equal(projectDeskCoverage(rows,['a'],600,650).allowed,false)
 assert.equal(projectDeskCoverage(rows,['b'],600,650).allowed,true)
 assert.equal(projectDeskCoverage(rows,['b','c'],600,650).allowed,false)
 assert.deepEqual(visibleDeskShifts(rows).map(x=>x.worker_id),['a'])
})
test('malformed and missing occupancy does not grant desk assignments',()=>{
 assert.equal(projectDeskCoverage(null,['a'],540,600).allowed,false)
 assert.equal(projectDeskCoverage([],[],540,600).allowed,false)
 assert.equal(projectDeskCoverage([],['a','b','c'],540,600).allowed,false)
 assert.equal(projectDeskCoverage([],['a','a'],540,600).allowed,false)
 assert.equal(projectDeskCoverage([],['a'],NaN,600).allowed,false)
 assert.equal(projectDeskCoverage([],['a'],600,600).allowed,false)
})
