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
// Keep owner-authored **emphasis** without HTML injection or a Markdown parser.
function policyInline(raw){
 return String(raw).split(/(\*\*[^*]+\*\*)/g).map((part,i)=>
   part.startsWith('**')&&part.endsWith('**')
     ?<strong key={i}>{part.slice(2,-2)}</strong>
     :part)
}
const faNumber=value=>new Intl.NumberFormat('fa-IR',{maximumFractionDigits:2}).format(value)

export default function WorkerAgreementReview({policy=workerAgreementDraft}){
 return <section className="swtb-policy-review" dir="rtl"
   aria-labelledby="swtb-policy-title" data-policy-status="draft">
   <header className="swtb-policy-head">
     <span className="swtb-policy-kicker">پیش‌نمایش محتوایی · نسخه {policy.version}</span>
     <h1 id="swtb-policy-title">{policy.title}</h1>
     {policy.studyNote&&<p className="swtb-policy-study-note">
       <AgreementIcon name="document"/><span>{policyInline(policy.studyNote)}</span>
     </p>}
     <p className="swtb-policy-institution">{policy.institution}</p>
     {policy.intro.split(/\n\s*\n/).map((paragraph,i)=><p key={i} className="swtb-policy-intro-paragraph">{policyInline(paragraph)}</p>)}
     <p className="swtb-policy-caution" role="status">
       {policy.notice||'این صفحه فقط برای بازبینی متن و طراحی است؛ هنوز چارچوب رسمی منتشر نشده و هیچ موافقتی ثبت نمی‌شود.'}
     </p>
   </header>
   <ol className="swtb-policy-sections" aria-label="هفت اصل چارچوب همکاری">
     {policy.sections.map((item,index)=><li key={item.id} className="swtb-policy-card" data-policy-section={item.id}
         data-policy-has-timeline={item.id==='continuity'&&Array.isArray(policy.timeline)?'true':'false'}
         data-policy-has-quota={item.id==='finance'&&Boolean(policy.quotaExample)?'true':'false'}>
       <div className="swtb-policy-card-heading">
         <span className="swtb-policy-icon-box"><AgreementIcon name={item.icon}/></span>
         <h2><span className="swtb-policy-index" aria-hidden="true">{new Intl.NumberFormat('fa-IR').format(index+1)}.</span>{' '}{item.title}</h2>
       </div>
       {Array.isArray(item.paragraphs)
         ?item.paragraphs.map((p,i)=><p key={i}>{policyInline(p)}</p>)
         :<p>{item.body}</p>}
       {item.id==='finance'&&policy.quotaExample&&<section
         className="swtb-policy-quota-example" aria-labelledby="swtb-policy-quota-example-title">
         <h3 id="swtb-policy-quota-example-title">نمونه محاسبه سهمیه نیمسال</h3>
         <p>{policyInline(policy.quotaExample.preamble)}</p>
         <div className="swtb-policy-quota-math" role="img"
           aria-label={`${policy.quotaExample.individualApproved} تقسیم بر ${policy.quotaExample.totalApproved} ضرب در ${policy.quotaExample.quota} برابر با ${policy.quotaExample.payAllocation} ساعت؛ یعنی ${policy.quotaExample.proportionalPercent} درصد از سهمیه`}>
           <div className="swtb-policy-quota-ratio">
             <span className="swtb-policy-quota-fraction" aria-hidden="true">
               <b>{faNumber(policy.quotaExample.individualApproved)}</b>
               <b>{faNumber(policy.quotaExample.totalApproved)}</b>
             </span>
             <small>{faNumber(policy.quotaExample.proportionalPercent)}٪ از کل کارکرد</small>
           </div>
           <span className="swtb-policy-quota-operator" aria-hidden="true">×</span>
           <span className="swtb-policy-quota-value" aria-hidden="true">
             {faNumber(policy.quotaExample.quota)} <small>ساعت سهمیه</small>
           </span>
           <span className="swtb-policy-quota-operator" aria-hidden="true">=</span>
           <strong className="swtb-policy-quota-total" aria-hidden="true">
             {faNumber(policy.quotaExample.payAllocation)} <small>ساعت مبنای پرداخت</small>
           </strong>
         </div>
         <div className="swtb-policy-quota-comparison">
           <div><small>ساعات واقعی تأییدشده</small><strong>{faNumber(policy.quotaExample.individualApproved)} ساعت</strong></div>
           <div><small>سهم مبنای پرداخت</small><strong>{faNumber(policy.quotaExample.payAllocation)} ساعت</strong></div>
         </div>
         <p>{policyInline(policy.quotaExample.note)}</p>
       </section>}
       {item.id==='continuity'&&Array.isArray(policy.timeline)&&<section
         className="swtb-policy-timeline" aria-labelledby="swtb-policy-timeline-heading">
         <h3 id="swtb-policy-timeline-heading">مراحل و مهلت‌های مشخص پیگیری همکاری</h3>
         <div className="swtb-policy-timeline-scroll" role="region" tabIndex={0}
           aria-label="جدول زمان‌بندی استمرار همکاری">
           <table>
             <caption>مبنای بررسی وضعیت همکاری، نه مجازات خودکار</caption>
             <thead><tr>
               <th scope="col">زمان</th>
               <th scope="col">شرایط بررسی</th>
               <th scope="col">اقدام احتمالی</th>
             </tr></thead>
             <tbody>{policy.timeline.map((step,i)=><tr key={i}>
               <th scope="row">{step.when}</th>
               <td>{step.trigger}</td>
               <td>{step.action}</td>
             </tr>)}</tbody>
           </table>
         </div>
         <p className="swtb-policy-muted">بیماری، امتحان، تغییر موجه برنامه یا روز بدون کار واگذارشده به‌خودی‌خود تخلف نیست. تصمیم هر مرحله پس از شنیدن توضیحات فرد و با اختیار مسئول مجاز بررسی می‌شود.</p>
       </section>}
       {Array.isArray(item.detailParagraphs)&&<details className="swtb-policy-continuity-details">
         <summary>شرایط تعهدهای انجام‌نشده، حق توضیح و درخواست بازبینی — متن کامل</summary>
         <div>{item.detailParagraphs.map((p,i)=><p key={'detail-'+i}>{p}</p>)}</div>
       </details>}
     </li>)}
   </ol>
   {policy.showTimeConcepts!==false&&<section className="swtb-policy-concepts" aria-labelledby="swtb-policy-concepts-heading">
     <h2 id="swtb-policy-concepts-heading">سه مفهوم که نباید با هم اشتباه شوند</h2>
     <div className="swtb-policy-concepts-grid">
       {workerTimeConcepts.map((concept,i)=><div className="swtb-policy-concept" key={concept.id}>
         <span className="swtb-policy-concept-icon"><AgreementIcon name={concept.icon}/></span>
         <div><strong>{concept.title}</strong><p>{concept.detail}</p></div>
         {i<workerTimeConcepts.length-1&&<span className="swtb-policy-concept-arrow" aria-hidden="true">←</span>}
       </div>)}
     </div>
   </section>}
   <footer className="swtb-policy-footer">
     <p>{policy.notice}</p>
     <p className="swtb-policy-muted" role="note">
       این متن در مرحله فعلی صرفاً برای آشنایی شما با اصول پیشنهادی همکاری منتشر شده است.
       مطالعه این متن در سامانه به‌عنوان تأیید یا پذیرش ثبت نمی‌شود و استفاده از پنل را محدود نمی‌کند.
       اگر نسخه‌ای به تصویب رسمی برسد، شیوه اطلاع‌رسانی و پذیرش معتبر آن جداگانه اعلام خواهد شد.
     </p>
   </footer>
 </section>
}
