import test from 'node:test'
import assert from 'node:assert/strict'
import {managerWindowHistoryV2 as history,managerWindowExcelRowsV2 as excel,managerUnallocatedWindowsV2 as backlog,assessWindowAwareCapacityV2 as capacity,validatePeerDayOnlyTasksV2 as peer,WINDOW_HISTORY_COLUMNS,windowHistoryMetadataV2 as metadata} from '../src/lib/managerWindowReadV2.mjs'
import {buildManagerWindowHistoryWorkbookV2 as workbook} from '../src/lib/managerWindowHistoryWorkbookV2.mjs'
const w={id:'w',name:'=QA',state:'active'},v={id:'v',name:'Other',state:'active'}
const legacy={id:'l',worker_id:'w',unit:'library',title:'Legacy',state:'assigned',schedule_kind:'legacy_day',planned_date:'2026-12-01',estimate_minutes:60,has_any_report:false}
const window={id:'x',worker_id:'w',unit:'research',title:'Window',state:'assigned',schedule_kind:'single_report_window',planned_date:null,window_start:'2026-11-29',window_end:'2026-12-04',window_term_id:'term',window_revision:1,daily_allocated_minutes:null,allocation_code:'UNALLOCATED_WINDOW',estimate_minutes:120,has_any_report:false}
const entry={id:'r',task_id:'x',worker_id:'w',work_date:'2026-12-02',reported_minutes:120,review_state:'approved',approved_minutes:120}
const data=(tasks=[legacy,window],time_entries=[])=>({schedule_contract_version:2,review_only:true,workers:[w,v],tasks,time_entries,weekly_slots:[{worker_id:'w',weekday_iso:2,start_minute:480,end_minute:660,valid_from:'2026-01-01'}],exceptions:[]})
const reported={...window,state:'completed',has_any_report:true}
const request={from:'2026-11-29',to:'2026-12-04'}
const redacted={worker_id:'v',planned_date:'2026-12-01',unit:'library',title:'فعالیت ثبت‌شده',state:'scheduled'}
test('mixed history standard once and no fake date',()=>{const h=history(data());assert.equal(h.summary.standardMinutesOnce,180);const x=h.records.find(r=>r.taskId==='x');assert.equal(x.date,'');assert.equal(x.actualWorkDate,null);assert.equal(x.dateBasis,'window_overlap')})
test('inclusive overlap first boundary',()=>assert.equal(history(data(),{from:'2026-11-29',to:'2026-11-29'}).records.length,1))
test('inclusive overlap last boundary',()=>assert.equal(history(data(),{from:'2026-12-04',to:'2026-12-04'}).records.length,1))
test('outside window',()=>assert.equal(history(data(),{from:'2026-12-05'}).records.length,0))
test('reported date independent of planned range',()=>{const h=history(data([reported],[entry]),{from:'2026-12-01',to:'2026-12-01'});assert.equal(h.records.length,0)})
test('actual report date and plan fields preserved',()=>{const h=history(data([reported],[entry]),{from:'2026-12-02',to:'2026-12-02'});assert.equal(h.records[0].actualWorkDate,'2026-12-02');assert.equal(h.records[0].windowStart,'2026-11-29');assert.equal(h.summary.approvedMinutes,120)})
test('historical report outside loaded list not unreported',()=>{const h=history(data([reported]),{review:'without_report'});assert.equal(h.records.length,0);assert.equal(h.summary.unloadedReportTaskCount,1)})
test('filtered-out reports do not create false unreported',()=>assert.equal(history(data([reported],[entry]),{review:'without_report'}).records.length,0))
test('two reports do not repeat standard',()=>{const h=history(data([reported],[entry,{...entry,id:'r2',review_state:'rejected',approved_minutes:null}]));assert.equal(h.summary.standardMinutesOnce,120);assert.equal(h.summary.approvedMinutes,120);assert.equal(h.records.length,2)})
test('zero approved remains numeric zero',()=>assert.equal(excel(history(data([reported],[{...entry,approved_minutes:0}])))[0].approvedMinutes,0))
test('pending never approved',()=>assert.equal(history(data([{...reported,state:'submitted'}],[{...entry,review_state:'submitted',approved_minutes:null}])).summary.approvedMinutes,0))
test('Excel separate date fields and formula escape',()=>{const r=excel(history(data([reported],[entry])))[0];assert.equal(r.workerName,"'=QA");assert.equal(r.plannedDate,'');assert.equal(r.actualWorkDate,'2026-12-02');assert.equal(r.windowEnd,'2026-12-04');assert.equal(r.estimateMinutes,120);assert.equal(r.windowRevision,1);assert.equal(new Set(WINDOW_HISTORY_COLUMNS.map(x=>x[1])).size,WINDOW_HISTORY_COLUMNS.length)})
test('Excel metadata bounded coverage',()=>assert.ok(metadata(history(data([reported]))).some(r=>r[1]===1)))
test('daily capacity unchanged and separate window',()=>{const c=capacity(data(),{workerId:'w',date:'2026-12-01',estimateMinutes:30});assert.equal(c.availableMinutes,180);assert.equal(c.assignedMinutes,60);assert.equal(c.remainingMinutes,90);assert.equal(c.unallocatedWindowStandardMinutes,120);assert.equal(c.completeCapacityClaim,false)})
test('no timetable is unknown not zero',()=>assert.equal(capacity({...data(),weekly_slots:[]},{workerId:'w',date:'2026-12-01'}).availableMinutes,null))
test('backlog one row for overlapping range',()=>{const b=backlog(data(),request);assert.equal(b.windowCount,1);assert.equal(b.standardMinutesOnce,120);assert.equal(b.dailyAllocatedMinutes,null)})
test('completed/cancelled windows excluded from open backlog',()=>assert.equal(backlog(data([reported,{...window,id:'y',state:'cancelled'}]),request).windowCount,0))
test('unit and worker filters',()=>{assert.equal(history(data(),{unit:'research'}).summary.taskCount,1);assert.equal(backlog(data(),{...request,workerId:'v'}).windowCount,0)})
test('reject unknown kind, fake date, absent report flag',()=>{for(const t of [{...window,schedule_kind:'new'},{...window,planned_date:'2026-12-01'},{...window,has_any_report:undefined}])assert.throws(()=>history(data([t])))})
test('reject duplicate task and report IDs',()=>{assert.throws(()=>history(data([window,window])));assert.throws(()=>history(data([reported],[entry,entry])))})
test('reject invalid dates and report owner mismatch',()=>{assert.throws(()=>history(data([{...window,window_start:'2026-02-30'}])));assert.throws(()=>history(data([reported],[{...entry,worker_id:'v'}])));assert.throws(()=>history(data([reported],[{...entry,work_date:'2026-12-05'}])))})
test('reject inconsistent report existence and invalid credit',()=>{assert.throws(()=>history(data([window],[entry])));assert.throws(()=>history(data([reported],[{...entry,approved_minutes:121}])))})
test('explicit legacy peer projection and whitelist',()=>assert.deepEqual(peer([{...redacted,id:'secret',instructions:'secret'}],request),[redacted]))
test('peer rejects window metadata and null day',()=>{for(const t of [{...redacted,window_start:'2026-12-01'},{...redacted,planned_date:null},{...redacted,schedule_kind:'single_report_window'}])assert.throws(()=>peer([t],request))})
test('reject bad version and reversed filter',()=>{assert.throws(()=>history({...data(),schedule_contract_version:1}));assert.throws(()=>history(data(),{from:'2026-12-04',to:'2026-11-29'}))})
test('workbook uses key-based numeric columns and split date headers (test double)',()=>{class Sheet{constructor(){this.rows=[];this.formats={}}set columns(x){this.cols=x}get rowCount(){return this.rows.length+1}addRow(r){this.rows.push(r)}getRow(){return {}}getColumn(k){return this.formats[k]??={}}}class Workbook{constructor(){this.calcProperties={};this.sheets=[]}addWorksheet(){const s=new Sheet();this.sheets.push(s);return s}}const out=workbook({Workbook},history(data([reported],[entry])));assert.equal(out.sheets.length,2);const sh=out.sheets[1];assert.equal(sh.rows[0].actualWorkDate,'2026-12-02');assert.equal(sh.formats.approvedMinutes.numFmt,'0');assert.equal(sh.formats.windowRevision.numFmt,'0');assert.ok(sh.cols.some(c=>c.key==='windowStart'));assert.equal(sh.autoFilter.to.column,WINDOW_HISTORY_COLUMNS.length)})
