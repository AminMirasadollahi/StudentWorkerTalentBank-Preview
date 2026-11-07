import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {peerToneIndex} from '../src/lib/workerUnifiedPresence.mjs'
const jsx=readFileSync(new URL('../src/OperationsWorkspace.jsx',import.meta.url),'utf8')
const css=readFileSync(new URL('../src/operations-workspace.css',import.meta.url),'utf8')
const panel=readFileSync(new URL('../src/components/WorkerPerformancePanel.jsx',import.meta.url),'utf8')

test('individual peer tone remains deterministic and only affects presentation',()=>{
 for(const id of ['QA-RUN-A','QA-RUN-B','same-person-id','دانشجوکار-نمونه',null]){
  const a=peerToneIndex(id),b=peerToneIndex(id)
  assert.equal(a,b)
  assert.ok(Number.isInteger(a)&&a>=0&&a<6)
 }
 assert.match(jsx,/peerToneIndex\(item\.workerId\)/)
 assert.match(jsx,/title=\{labelPeerInterval\(item\)\}/)
 assert.match(jsx,/aria-label=\{labelPeerInterval\(item\)\+'؛ فقط مشاهده'\}/)
 const marker=css.indexOf('/* Stable worker identity palette')
 assert.ok(marker>0)
 const colors=css.slice(marker,css.indexOf('/* Balanced accents',marker))
 assert.ok(colors.includes('font-size:.64rem;font-weight:600'))
 for(let i=0;i<6;i++)assert.ok(colors.includes('.ow-unified-peer-tone-'+i))
})

test('Persian history filters share one compact toolbar and keep semantics',()=>{
 const history=jsx.slice(jsx.indexOf('function WorkerReportHistory('),
  jsx.indexOf('function WorkerSelfProfile('))
 assert.match(history,/<UnitHourSummary scope="worker" approvedTotal=\{total\}/)
 assert.match(history,/const total=approvedMinutesTotal\?\?null/)
 assert.match(history,/className="ow-history-query"/)
 assert.match(history,/className="ow-history-query-fields"/)
 assert.match(history,/className="ow-history-query-status"/)
 assert.match(history,/data-swtb-guide="history-controls"/)
 assert.match(history,/JalaliDatePicker value=\{dateFrom\}/)
 assert.match(history,/JalaliDatePicker value=\{dateTo\}/)
 assert.match(history,/className="ow-history-filter"/)
 assert.match(history,/dateResult.invalidRange/)
 assert.match(history,/setUnitFilter\(''\);setView\('all'\);setDateFrom\(''\);setDateTo\(''\)/)
 assert.ok(!history.includes('className="ow-worker-performance-dates"'),
  'old disconnected date accordion must be gone')
 assert.match(history,/<WorkerPerformancePanel rows=\{entries\} tasks=\{tasks\}/)
 assert.match(history,/className="ow-b3-ledger-list"/)
})

test('empty analytics omit two large blank chart placeholders',()=>{
 assert.match(panel,/monthlyReady\|\|unitsReady\?<details/)
 assert.match(panel,/className="ow-worker-performance-chart-empty"/)
 assert.match(panel,/monthlyReady&&<section/)
 assert.match(panel,/unitsReady&&<section/)
 assert.match(panel,/metrics\.approvedMinutes!==null/)
 assert.ok(!panel.includes('monthlyReady?<PerformanceBars'))
 assert.ok(!panel.includes('unitsReady?<PerformanceBars'))
})

test('cross-panel visual rules stay confined to worker CSS and legible',()=>{
 const start=css.indexOf('/* SWTB12 visual-system pass')
 assert.ok(start>0)
 const visual=css.slice(start)
 assert.match(visual,/\.ops-worker-b3-view \.ow-b3-stage>\.ow-worker-task-workspace/)
 assert.match(visual,/\.ops-worker-b3-view \.ow-b3-stage>\.ow-worker-work-pool/)
 assert.match(visual,/\.ops-worker-b3-view \.ow-b3-stage>\.ow-worker-availability-panel/)
 assert.match(visual,/\.ops-worker-b3-view \.ow-b3-stage>\.ow-b3-ledger/)
 assert.match(visual,/\.ops-worker-b3-view \.ow-b3-stage>\.ow-self-profile/)
 assert.ok(!visual.includes('.swtb22-term-'),'must not style manager')
 assert.match(visual,/@media\(forced-colors:active\)/)
})
