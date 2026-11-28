// Local DEV entry only; not part of normal Pages build.
// Fail before importing modules that construct a Supabase client.
import React from 'react'
import {createRoot} from 'react-dom/client'
import {resolveStagingManagerReviewConfig,createStagingManagerFixture} from '../../src/lib/stagingManagerReview.mjs'
const root=createRoot(document.getElementById('root'))
async function start(){
 try{
  resolveStagingManagerReviewConfig(import.meta.env,window.location)
  const [{default:OpsApp},{opsClient},{default:Host}]=await Promise.all([
   import('../../src/OpsApp.jsx'),import('../../src/lib/operations.js'),import('../../src/components/DayBatchManagerReviewHost.jsx'),
   import('../../src/typography.css'),import('../../src/styles.css'),import('../../src/production-polish.css'),import('../../src/operations-workspace.css')
  ])
  const today=()=>{const p=Object.fromEntries(new Intl.DateTimeFormat('en-US',{calendar:'gregory',timeZone:'Asia/Tehran',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).map(x=>[x.type,x.value]));return [p.year,p.month,p.day].join('-')}
  const fixture=Object.freeze({mode:'staging-review',Host,createFixture:actorId=>createStagingManagerFixture({env:import.meta.env,location:window.location,auth:opsClient.auth,actorId,fetchImpl:(...a)=>window.fetch(...a),makeId:()=>crypto.randomUUID(),today})})
  root.render(<OpsApp r5IaFixture dayBatchReviewFixture={fixture}/>)
 }catch{root.render(<main dir="rtl" role="alert">تنظیمات محیط آزمایشی معتبر نیست؛ اتصال برقرار نشد.</main>)}
}
void start()
