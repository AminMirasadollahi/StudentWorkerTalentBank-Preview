/* SWTB13 P1 — visual/content review ONLY. No acceptance is recorded here.
 * Publication and mandatory acknowledgements require a separately approved
 * server version registry and guarded mutation RPCs. */
import {workerAgreementDraft,workerTimeConcepts} from '../lib/workerAgreementDraft.mjs'
import './worker-agreement-review.css'

const iconStrokes={
 graduation:['M2 10 12 5 22 10 12 15Z','M6 12v5c3.8 3 8.2 3 12 0v-5','M22 10v6'],
 choice:['M4 12.5 9.2 17l3-3','M20 12.5 14.8 17l-3-3','M2 12l5-5 5 3 5-3 5 5','M9 10l3 4 3-4'],
 calendar:['M4 6h16v15H4z','M8 3v6','M16 3v6','M4 11h16','M8 15h3','M8 18h5'],
 users:['M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6','M2.5 20v-2a6.5 6.5 0 0 1 13 0v2','M16 5a3 3 0 0 1 0 6','M17 14a5 5 0 0 1 4.5 5'],
 messages:['M4 5h16v12H9l-5 4z','M8 9h8','M8 13h6'],
 shield:['M12 2 4 6v6c0 5 3.5 8.5 8 10 4.5-1.5 8-5 8-10V6z','M8.5 12l2.5 2.5 4.5-5'],
 scale:['M12 3v18','M5 7h14','M8 7 4 15h8z','M20 15h-8l4-8z','M8 21h8'],
 document:['M6 3h9l4 4v14H6z','M15 3v4h4','M9 12h7','M9 16h7'],
 check:['M4 12l5 5L20 6'],
}
function AgreementIcon({name}){
 return <svg className="swtb-policy-icon" viewBox="0 0 24 24" fill="none"
  stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"
  aria-hidden="true" focusable="false">
  {(iconStrokes[name]||iconStrokes.document).map((d,i)=><path key={i} d={d}/>)}
 </svg>
}
export default function WorkerAgreementReview(){
 const policy=workerAgreementDraft
 return <section className="swtb-policy-review" dir="rtl"
   aria-labelledby="swtb-policy-title" data-policy-status="draft">
   <header className="swtb-policy-head">
     <span className="swtb-policy-kicker">پیش‌نمایش محتوایی · نسخه {policy.version}</span>
     <h1 id="swtb-policy-title">{policy.title}</h1>
     <p className="swtb-policy-institution">{policy.institution}</p>
     <p>{policy.intro}</p>
     <p className="swtb-policy-caution" role="status">
       این صفحه فقط برای بازبینی متن و طراحی است؛ هنوز چارچوب رسمی منتشر نشده و هیچ موافقتی ثبت نمی‌شود.
     </p>
   </header>
   <ol className="swtb-policy-sections" aria-label="هفت اصل چارچوب همکاری">
     {policy.sections.map((item,index)=><li key={item.id} className="swtb-policy-card">
       <div className="swtb-policy-card-heading">
         <span className="swtb-policy-icon-box"><AgreementIcon name={item.icon}/></span>
         <h2><span className="swtb-policy-index" aria-hidden="true">{new Intl.NumberFormat('fa-IR').format(index+1)}.</span>{' '}{item.title}</h2>
       </div>
       <p>{item.body}</p>
     </li>)}
   </ol>
   <section className="swtb-policy-concepts" aria-labelledby="swtb-policy-concepts-heading">
     <h2 id="swtb-policy-concepts-heading">سه مفهوم که نباید با هم اشتباه شوند</h2>
     <div className="swtb-policy-concepts-grid">
       {workerTimeConcepts.map((concept,i)=><div className="swtb-policy-concept" key={concept.id}>
         <span className="swtb-policy-concept-icon"><AgreementIcon name={concept.icon}/></span>
         <div><strong>{concept.title}</strong><p>{concept.detail}</p></div>
         {i<workerTimeConcepts.length-1&&<span className="swtb-policy-concept-arrow" aria-hidden="true">←</span>}
       </div>)}
     </div>
   </section>
   <footer className="swtb-policy-footer">
     <p>{policy.notice}</p>
     <label className="swtb-policy-accept-disabled">
       <input type="checkbox" disabled aria-describedby="swtb-policy-future-gate-note"/>
       <span>{policy.acknowledgement}</span>
     </label>
     <button type="button" className="report-btn report-btn--primary" disabled>
       تأیید و شروع همکاری
     </button>
     <p id="swtb-policy-future-gate-note" className="swtb-policy-muted">
       نمونه نمایشی است. دکمه تأیید تنها پس از انتشار نسخه رسمی و فعال‌سازی ثبت امن پذیرش در سرور قابل استفاده خواهد بود.
     </p>
   </footer>
 </section>
}
