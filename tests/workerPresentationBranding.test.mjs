import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'

const jsx=readFileSync(new URL('../src/OperationsWorkspace.jsx',import.meta.url),'utf8')
const css=readFileSync(new URL('../src/operations-workspace.css',import.meta.url),'utf8')

test('worker sidebar presents approved local faculty name and concise panel identity',()=>{
 const start=jsx.indexOf('<div className="ow-b3-brand"')
 const end=jsx.indexOf('</div>',start+10)
 assert.ok(start>=0&&end>start,'worker brand renders')
 const brand=jsx.slice(start,jsx.indexOf('<SectionTabs ',start))
 assert.match(brand,/<strong>پنل دانشجوکار<\/strong>/)
 assert.match(brand,/<small>دانشکده علوم انسانی شهید رجایی بابل<\/small>/)
 assert.ok(!brand.includes('<small>دانشگاه فرهنگیان</small>'))
 assert.match(brand,/!sidebarCollapsed/,'respect collapsed identity layout')
})

test('new presentation tints are scoped strictly to authenticated worker shell',()=>{
 const start=css.indexOf('/* SWTB12 — restrained worker-facing visual identity')
 assert.ok(start>0)
 const block=css.slice(start)
 assert.match(block,/\.ops-worker-b3-view \.ow-b3-layout/)
 assert.match(block,/\.ow-b3-ledger \.ow-worker-performance-kpis article:nth-child\(2\)/)
 assert.match(block,/\.ow-b3-ledger \.ow-worker-performance-kpis article:nth-child\(3\)/)
 assert.match(block,/\.ow-b3-layout \.ow-b3-brand small/)
 assert.ok(!block.includes('.swtb22-manager'),'manager visual rules unchanged')
 assert.ok(!block.includes('visibility:hidden'),'never hide dashboard text')
})
