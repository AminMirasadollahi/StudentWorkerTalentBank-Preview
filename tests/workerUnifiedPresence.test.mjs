import test from 'node:test'
import assert from 'node:assert/strict'
import {projectUnifiedPeerDay,sharedPeerClockScale,packPeerDayIntervals,
 labelPeerInterval} from '../src/lib/workerUnifiedPresence.mjs'
import {unifiedPeerRequestWindows,sanitizeUnifiedPeerResponse,mergeUnifiedPeerWindows}
 from '../src/lib/useUnifiedPeerCalendar.js'

const date='2026-11-07'
function fixture(){
 return {
  workers:[
   {id:'SELF',name:'خود من',state:'active',unit:'library',contact:'PRIVATE_MOBILE'},
   {id:'A',name:'الف',state:'active',unit:'library',email:'PRIVATE_EMAIL'},
   {id:'B',name:'ب',state:'active',unit:'research'},
   {id:'C',name:'ج',state:'active',unit:'library'},
   {id:'D',name:'د',state:'active',unit:'library'},
   {id:'E',name:'ه',state:'active',unit:'research'},
   {id:'OFF',name:'غیرفعال',state:'paused',unit:'research'},
  ],
  weekly_slots:[
   {worker_id:'SELF',weekday_iso:6,start_minute:480,end_minute:540,
    valid_from:'2026-10-01',valid_until:null},
   {worker_id:'A',weekday_iso:6,start_minute:480,end_minute:540,
    valid_from:'2026-10-01',valid_until:null},
   {worker_id:'B',weekday_iso:6,start_minute:540,end_minute:660,
    valid_from:'2026-10-01',valid_until:null},
   {worker_id:'C',weekday_iso:6,start_minute:600,end_minute:720,
    valid_from:'2026-10-01',valid_until:null},
   {worker_id:'D',weekday_iso:6,start_minute:480,end_minute:720,
    valid_from:'2026-10-01',valid_until:null},
   {worker_id:'OFF',weekday_iso:6,start_minute:480,end_minute:1200,
    valid_from:'2026-10-01',valid_until:null},
  ],
  exceptions:[
   {worker_id:'A',local_date:date,kind:'replacement_intervals',
    intervals:[{start:720,end:1200}],note:'PRIVATE_ABSENCE_NOTE'},
   {worker_id:'E',local_date:date,kind:'unavailable',
    intervals:[],note:'PRIVATE_MEDICAL_REASON'},
  ],
  tasks:[
   {worker_id:'E',planned_date:date,state:'scheduled',
    title:'PRIVATE_TASK_TITLE',unit:'library'},
  ],
 }
}
test('self, paused, contact, private task and notes never project into the coworker overlay',()=>{
 const row=projectUnifiedPeerDay(fixture(),date,'SELF')
 assert.equal(row.peers.some(p=>p.workerId==='SELF'||p.workerId==='OFF'),false)
 assert.equal(row.plannedCount,4)
 assert.equal(row.unavailableCount,1)
 assert.equal(row.taskWithoutPlanCount,1)
 assert.deepEqual(row.peers.find(p=>p.workerId==='A').windows,
  [{start:'12:00',end:'20:00'}])
 const serialized=JSON.stringify(row)
 for(const secret of ['PRIVATE_MOBILE','PRIVATE_EMAIL','PRIVATE_TASK_TITLE',
   'PRIVATE_ABSENCE_NOTE','PRIVATE_MEDICAL_REASON']){
  assert.equal(serialized.includes(secret),false)
 }
})
test('comparable dynamic weekly axis rounds outward, never clips late or early slots',()=>{
 const peers=[projectUnifiedPeerDay(fixture(),date,'SELF')]
 const scale=sharedPeerClockScale(peers)
 assert.equal(scale.start,480)
 assert.equal(scale.end,1200)
 assert.equal(scale.ticks[0],scale.start)
 assert.equal(scale.ticks.at(-1),scale.end)
 const late=sharedPeerClockScale([{peers:[{windows:[{start:'12:30',end:'24:00'}]}]}])
 assert.equal(late.start,720)
 assert.equal(late.end,1440)
 const early=sharedPeerClockScale([{peers:[{windows:[{start:'00:20',end:'02:15'}]}]}])
 assert.equal(early.start,0)
 assert.equal(early.end,180)
 assert.equal(sharedPeerClockScale([{peers:[]}]).fallback,true)
})
test('greedy packing reuses one lane where intervals touch, but never hides overlaps',()=>{
 const day={peers:[
  {workerId:'A',name:'الف',windows:[{start:'08:00',end:'09:00'},{start:'10:00',end:'11:00'}]},
  {workerId:'B',name:'ب',windows:[{start:'09:00',end:'10:00'}]},
  {workerId:'C',name:'ج',windows:[{start:'10:00',end:'12:00'}]},
 ]}
 const p=packPeerDayIntervals(day)
 assert.equal(p.totalLanes,2)
 assert.equal(p.hiddenIntervalCount,0)
 assert.deepEqual(p.lanes[0].map(x=>x.workerId),['A','B','A'])
 assert.equal(p.lanes[1][0].workerId,'C')
 assert.equal(labelPeerInterval(p.lanes[0][0]),'الف، 08:00 تا 09:00')
})
test('only two visible lanes, extra intervals counted accurately, all source people retained',()=>{
 const day={peers:[
  {workerId:'A',name:'الف',windows:[{start:'08:00',end:'16:00'}]},
  {workerId:'B',name:'ب',windows:[{start:'09:00',end:'18:00'}]},
  {workerId:'C',name:'ج',windows:[{start:'10:00',end:'19:00'}]},
  {workerId:'D',name:'د',windows:[{start:'11:00',end:'20:00'}]},
 ]}
 const p=packPeerDayIntervals(day)
 assert.equal(p.lanes.length,2)
 assert.equal(p.totalLanes,4)
 assert.equal(p.hiddenIntervalCount,2)
 assert.equal(p.hiddenWorkerCount,2)
 assert.equal(day.peers.length,4,'source detail remains available')
})
test('explicit unavailable worker with assigned task is not incorrectly described as unscheduled available',()=>{
 const row=projectUnifiedPeerDay(fixture(),date,'SELF')
 const person=row.peers.find(p=>p.workerId==='E')
 assert.equal(person.kind,'unavailable')
 assert.deepEqual(person.windows,[])
 assert.equal(person.assignedCount,1)
})

test('month/week requests do not overlap, and actor changes require a new scoped request',()=>{
 assert.deepEqual(unifiedPeerRequestWindows({
  monthStart:'2026-11-01',monthEnd:'2026-11-30',
  weekStart:'2026-10-31',weekEnd:'2026-11-06',
 }),[{from:'2026-11-01',to:'2026-11-30'},
  {from:'2026-10-31',to:'2026-10-31'}])
 assert.throws(()=>unifiedPeerRequestWindows({}),/invalid_unified_peer_calendar_window/)
})
test('public client keeps only whitelisted fields, rejects raw task titles and inconsistent roster',()=>{
 const w={from:'2026-11-01',to:'2026-11-30'}
 const good={ok:true,scope:'coworker_summary_only',start_date:w.from,end_date:w.to,
  workers:[{id:'SYNTHETIC-A',name:'همکار ساختگی',state:'active',
   private_phone:'SHOULD_NEVER_RENDER'}],
  weekly_slots:[],exceptions:[],tasks:[]}
 const clean=sanitizeUnifiedPeerResponse(good,w)
 assert.doesNotMatch(JSON.stringify(clean),/SHOULD_NEVER_RENDER/)
 assert.throws(()=>sanitizeUnifiedPeerResponse({...good,
  tasks:[{title:'PRIVATE_TASK',state:'scheduled'}]},w),/untrusted_unified_peer_task/)
 assert.throws(()=>sanitizeUnifiedPeerResponse({...good,
  scope:'manager_full_calendar'},w),/untrusted_unified_peer_response/)
 assert.throws(()=>mergeUnifiedPeerWindows([clean,
  {...clean,workers:[{id:'DIFFERENT'}]}]),/unified_peer_roster_changed/)
})
