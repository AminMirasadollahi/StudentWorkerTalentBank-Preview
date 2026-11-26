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

test('analytics show truthful zero categories and never infer a missing month',()=>{
 assert.match(panel,/className="ow-worker-performance-chart-disclosure" aria-label=/)
 assert.match(panel,/className="ow-worker-unit-donut-ring"/)
 assert.doesNotMatch(panel,/<summary>نمای نموداری کارکرد تأییدشده<\/summary>/)
 assert.match(panel,/className="ow-worker-performance-zero-month"/)
 assert.match(panel,/className="ow-worker-performance-chart-grid"/)
 assert.match(panel,/metrics\.byMonth\.length>0/)
 assert.match(panel,/metrics\.missingWorkDateCount===0/)
 assert.match(panel,/metrics\.missingUnitCount===0/)
 assert.match(panel,/metrics\.approvedMinutes!==null/)
 assert.match(panel,/Object\.keys\(units\)\.map\(unit=>\(\{unit,minutes:byUnitMap\.get\(unit\)\|\|0\}\)\)/)
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

test('SWTB22 chosen task keeps full paragraph layout and reports actual date separately from plan',()=>{
 const card=jsx.slice(jsx.indexOf('function WorkerTaskCard('),jsx.indexOf('function WorkerTaskCard(')+20000)
 assert.match(card,/تاریخ واقعی انجام کار \(شمسی\)/)
 assert.match(card,/تاریخ برنامه‌ریزی: \{pretty\(task.planned_date\)\}/)
 assert.match(card,/JalaliDatePicker value=\{date\} max=\{v3\?contract\?\.date_max:today\(\)\} min=\{v3\?contract\?\.date_min:shift\(today\(\),-90\)\}/)
 assert.match(card,/task\.instructions\}/)
 assert.match(jsx,/className="ow-task-full-description"\>\{inspectedTask\.instructions\}/)
 assert.match(css,/\.ow-task-full-description\s*\{\s*white-space:pre-wrap; overflow-wrap:anywhere;/)
 assert.match(css,/\.ow-worker-task-instructions p\s*\{[^}]*white-space:pre-wrap/)
})
