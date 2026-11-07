import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'

const read=path=>readFileSync(new URL(path,import.meta.url),'utf8')
const ops=read('../src/OperationsWorkspace.jsx')
const performance=read('../src/components/WorkerPerformancePanel.jsx')
const hint=read('../src/components/WorkerInfoHint.jsx')
const css=read('../src/operations-workspace.css')
const pool=read('../src/components/WorkPoolWorkerPanel.jsx')

test('worker history places filters directly before the report ledger; analytics after',()=>{
 const start=ops.indexOf('function WorkerReportHistory(')
 const end=ops.indexOf('function WorkerSelfProfile(',start)
 assert.ok(start>=0&&end>start)
 const part=ops.slice(start,end)
 const query=part.indexOf('<div className="ow-history-report-flow">')
 const filters=part.indexOf('<section className="ow-history-query"')
 const ledger=part.indexOf('className="ow-b3-ledger-list"')
 const after=part.indexOf('<WorkerPerformancePanel rows={entries}')
 assert.ok(query>=0&&filters>query&&ledger>filters&&after>ledger)
 assert.match(part,/const total=approvedMinutesTotal\?\?null/)
 assert.match(part,/<UnitHourSummary scope="worker" approvedTotal=\{total\}/)
 assert.match(part,/data-swtb-guide="history-controls"/)
 assert.match(part,/!dateResult\.invalidRange&&<WorkerPerformancePanel/)
 assert.match(part,/aria-label="فیلترهای گزارش‌ها"/)
 assert.ok(!part.includes('className="ow-history-query-note"'))
})

test('server-authoritative per-unit data remains compact and never silently zeroes absent lifetime total',()=>{
 assert.match(ops,/approvedTotal===null\?'—':exactDuration\(approvedTotal\)/)
 assert.match(ops,/scope==='worker'\?'ساعات تأییدشده'/)
 assert.match(ops,/getUnitHourTotals\(\)/)
 assert.match(css,/\.ow-unit-hours--combined \.ow-unit-hours__grid\{\s*display:flex/)
 assert.match(css,/\.ow-unit-hours--combined \.ow-unit-hours__grid article\+article\{/)
 assert.match(css,/justify-content:flex-start/)
})

test('secondary help uses click and keyboard, native hover title, Escape dismissal',()=>{
 assert.match(hint,/<details className="ow-worker-info-hint"/)
 assert.match(hint,/<summary aria-label=\{label\} title=\{text\}>/)
 assert.match(hint,/event\.key==='Escape'/)
 assert.match(hint,/event\.currentTarget\.open=false/)
 assert.match(ops,/import WorkerInfoHint from/)
 assert.match(performance,/import WorkerInfoHint from/)
 assert.match(pool,/import WorkerInfoHint from/)
 assert.match(css,/summary:focus-visible/)
})

test('peer strips are flat while retaining identity tone and clock geometry',()=>{
 const marker=css.indexOf('/* Peer windows are compact read-only information strips')
 assert.ok(marker>0)
 const segment=css.slice(marker,css.indexOf('@media(max-width:800px)',marker))
 assert.match(segment,/\.ow-unified-peer-bar\.is-second\{\s*border:0;box-shadow:none/)
 assert.match(ops,/peerToneIndex\(item\.workerId\)/)
 assert.match(ops,/percentForMinute\(item\.start\)/)
 assert.match(ops,/width:width\+'%'/)
})

test('zero-data chart appears without implying fake monthly credits',()=>{
 assert.match(performance,/Object\.keys\(units\)\.map/)
 assert.match(performance,/metrics\.approvedMinutes!==null&&metrics\.missingUnitCount===0/)
 assert.match(performance,/metrics\.approvedMinutes!==null&&metrics\.missingWorkDateCount===0/)
 assert.match(performance,/metrics\.byMonth\.length>0/)
 assert.match(performance,/className="ow-worker-performance-zero-month"/)
 assert.match(performance,/aria-label="در نتایج فعلی هیچ گزارش تأییدشده‌ای/)
 assert.ok(!performance.includes('با افزایش گزارش‌های دارای کارکرد'))
})
