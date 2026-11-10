/* SWTB15 — candidate official consent UI. FEATURE FLAG OFF by default.
 * Only server-published approved version/digest may be signed.
 * No login/write protection is claimed here; PR39–40 guard it on the server.
 */
import {useEffect,useRef,useState} from 'react'
import {getMyWorkerAgreement,acceptMyWorkerAgreement} from '../lib/operationsV2'
import {parseWorkerAgreementStatus,acceptanceCoordinates,
 verifyWorkerAcceptanceReceipt,isSameAgreement} from '../lib/workerAgreementAcceptanceContract.mjs'
import {trapModalTab} from '../lib/dialogFocusTrap.mjs'
import './worker-agreement-official.css'

const boldParts=value=>String(value).split(/(\*\*[^*]+\*\*)/g)
 .map((s,i)=>s.startsWith('**')&&s.endsWith('**')
  ?<strong key={i}>{s.slice(2,-2)}</strong>:s)
const fa=new Intl.NumberFormat('fa-IR')
const readableTime=value=>{
 if(!value)return ''
 try{return new Intl.DateTimeFormat('fa-IR',{
  dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Tehran',
 }).format(new Date(value))}
 catch{return 'زمان نامشخص'}
}

function ServerAgreementDocument({snapshot}){
 const doc=snapshot.document
 return <article className="swtb-agreement-server-document" dir="rtl"
  aria-labelledby="swtb-agreement-server-title">
  <div className="swtb-agreement-version-meta">
   <strong>نسخه مصوب و منتشرشده {snapshot.versionLabel}</strong>
   <span>شناسه سند از سرور: <bdi dir="ltr">{snapshot.versionId}</bdi></span>
   <span>تاریخ انتشار: {readableTime(snapshot.publishedAt)}</span>
  </div>
  <h3 id="swtb-agreement-server-title">{doc.title}</h3>
  {doc.institution&&<p>{doc.institution}</p>}
  {doc.studyNote&&<p className="swtb-agreement-note">{boldParts(doc.studyNote)}</p>}
  {doc.intro.split(/\n\s*\n/).map((p,i)=><p key={'intro-'+i}>{boldParts(p)}</p>)}
  {snapshot.changeSummary&&<p className="swtb-agreement-change">
   <strong>خلاصه تغییرات این نسخه: </strong>{snapshot.changeSummary}</p>}
  <ol className="swtb-agreement-official-sections">
   {doc.sections.map((section,index)=><li key={section.id}>
    <h4>{fa.format(index+1)}. {section.title}</h4>
    {section.paragraphs.map((p,i)=><p key={i}>{boldParts(p)}</p>)}
    {section.detailParagraphs?.map((p,i)=><p key={'detail-'+i}>{boldParts(p)}</p>)}
    {section.id==='finance'&&doc.quotaExample&&<aside className="swtb-agreement-official-example">
     <strong>مثال توضیحی سهمیه نیمسال (نه کسر از ساعات واقعی ثبت‌شده)</strong>
     <p>{boldParts(doc.quotaExample.preamble)}</p>
     <p className="swtb-agreement-official-formula" dir="ltr">
      {fa.format(doc.quotaExample.individualApproved)} ÷ {fa.format(doc.quotaExample.totalApproved)}
      {' × '}{fa.format(doc.quotaExample.quota)}
      {' = '}{fa.format(doc.quotaExample.payAllocation)} ساعت مبنای محاسبه
     </p>
     {doc.quotaExample.note.split(/\n\s*\n/).map((p,i)=><p key={i}>{boldParts(p)}</p>)}
    </aside>}
   </li>)}
  </ol>
  {doc.notice&&<p className="swtb-agreement-note">{boldParts(doc.notice)}</p>}
  <details className="swtb-agreement-digest">
   <summary>مشخصات فنی نسخه ثبت‌شونده</summary>
   <p>پذیرش شما فقط به همین نسخه و اثرانگشت سروری آن متصل خواهد شد.</p>
   <p>SHA-256: <bdi dir="ltr">{snapshot.digest}</bdi></p>
  </details>
 </article>
}

export default function WorkerAgreementOfficialConsent({workerId}){
 const [status,setStatus]=useState({phase:'loading',agreement:null,error:''})
 const [open,setOpen]=useState(false)
 const [checked,setChecked]=useState(false)
 const [posting,setPosting]=useState(false)
 const [note,setNote]=useState('')
 const dialogRef=useRef(null),triggerRef=useRef(null)
 const alive=useRef(true),autoshown=useRef(false),postingRef=useRef(false)
 useEffect(()=>{
  alive.current=true
  let cancelled=false
  getMyWorkerAgreement().then(raw=>{
   const agreement=parseWorkerAgreementStatus(raw)
   if(cancelled)return
   setStatus({phase:'ready',agreement,error:''})
   if(agreement.kind==='published'&&agreement.required&&!agreement.accepted
     &&!autoshown.current){
    autoshown.current=true;setChecked(false);setOpen(true)
   }
  }).catch(()=>{
   if(!cancelled)setStatus({phase:'error',agreement:null,
    error:'وضعیت نسخه مصوب از سرور دریافت نشد. هیچ تأییدی ثبت نشده است.'})
  })
  return()=>{cancelled=true;alive.current=false}
 },[workerId])
 useEffect(()=>{
  const d=dialogRef.current
  if(!open||!d)return
  if(typeof d.showModal!=='function')return
  try{if(!d.open)d.showModal()}catch{}
  return()=>{try{if(d.open)d.close()}catch{}}
 },[open,status.phase])
 const agreement=status.agreement
 const reload=async({show=false}={})=>{
  if(postingRef.current)return
  setStatus({phase:'loading',agreement:null,error:''})
  setChecked(false);setNote('')
  try{
   const fresh=parseWorkerAgreementStatus(await getMyWorkerAgreement())
   if(!alive.current)return
   setStatus({phase:'ready',agreement:fresh,error:''})
   if(show&&fresh.kind==='published')setOpen(true)
   else if(fresh.kind==='unpublished')setOpen(false)
  }catch{
   if(alive.current){
    setStatus({phase:'error',agreement:null,
     error:'دریافت وضعیت از سرور ممکن نشد. پذیرش جدید غیرفعال است.'})
    setOpen(false)
   }
  }
 }
 const close=()=>{
  if(postingRef.current)return
  if(dialogRef.current?.open)dialogRef.current.close()
  setOpen(false);setChecked(false);setNote('')
  requestAnimationFrame(()=>triggerRef.current?.focus({preventScroll:true}))
 }
 const submit=async()=>{
  if(postingRef.current||!checked||status.phase!=='ready'||
   agreement?.kind!=='published'||agreement.accepted)return
  const captured=agreement
  let coordinates
  try{coordinates=acceptanceCoordinates(captured)}catch{return}
  postingRef.current=true;setPosting(true);setNote('')
  try{
   const receipt=await acceptMyWorkerAgreement(coordinates)
   verifyWorkerAcceptanceReceipt(receipt,coordinates)
   // The transport receipt is not enough; re-read server effective version.
   const actual=parseWorkerAgreementStatus(await getMyWorkerAgreement())
   if(!alive.current)return
   if(isSameAgreement(captured,actual)&&actual.accepted){
    setStatus({phase:'ready',agreement:actual,error:''})
    setChecked(false)
    setNote('پذیرش همین نسخه با موفقیت در سرور ثبت و دوباره بررسی شد.')
   }else{
    setStatus({phase:'ready',agreement:actual,error:''})
    setChecked(false)
    setNote('نسخه جاری تغییر کرده یا رسید هنوز تأیید نشده است. متن جاری را دوباره بررسی کنید.')
   }
  }catch{
   // An uncertain HTTP result may have COMMITTED. NEVER resubmit automatically.
   // Read back the effective version and its own immutable receipt first.
   try{
    const actual=parseWorkerAgreementStatus(await getMyWorkerAgreement())
    if(!alive.current)return
    setStatus({phase:'ready',agreement:actual,error:''})
    setChecked(false)
    setNote(isSameAgreement(captured,actual)&&actual.accepted
     ?'با وجود اختلال ارتباط، ثبت پذیرش همین نسخه در سرور تأیید شد.'
     :'ثبت پذیرش تأیید نشده است. نسخه جاری را بررسی کنید؛ ارسال دوباره فقط با اقدام خودتان انجام می‌شود.')
   }catch{
    if(alive.current){
     setStatus({phase:'error',agreement:null,
      error:'نتیجه پذیرش نامشخص است و امکان بررسی سرور وجود ندارد. فعلاً دوباره ارسال نکنید.'})
     setOpen(false)
    }
   }
  }finally{
   postingRef.current=false
   if(alive.current)setPosting(false)
  }
 }
 return <div className="swtb-agreement-official-entry" data-swtb-official-gate="draft-off">
  <button ref={triggerRef} type="button"
   className="swtb-agreement-official-launch"
   disabled={status.phase==='loading'}
   onClick={()=>{if(agreement?.kind==='published'){setOpen(true);setChecked(false);setNote('')}
    else void reload({show:true})}}
   aria-haspopup="dialog">
   {status.phase==='loading'?'در حال بررسی وضعیت چارچوب رسمی…':
    status.phase==='error'?'بررسی مجدد وضعیت چارچوب رسمی':
    agreement?.kind==='unpublished'?'وضعیت چارچوب رسمی: هنوز منتشر نشده':
    agreement?.accepted?'چارچوب رسمی: پذیرش ثبت‌شده':
    agreement?.required?'چارچوب رسمی: نیازمند تأیید':'مطالعه و تأیید اختیاری چارچوب رسمی'}
  </button>
  {status.phase==='error'&&<p role="alert">{status.error}</p>}
  {status.phase==='ready'&&agreement?.kind==='unpublished'&&
   <p>هنوز نسخه مصوبی برای ثبت پذیرش منتشر نشده است. مطالعه پیش‌نویس جداگانه در دسترس شماست.</p>}
  {open&&status.phase==='ready'&&agreement?.kind==='published'&&
   <dialog ref={dialogRef} className="swtb-agreement-official-modal"
    dir="rtl" aria-labelledby="swtb-agreement-official-heading"
    onKeyDown={trapModalTab}
    onCancel={event=>{if(postingRef.current)event.preventDefault()}}
    onClose={()=>{if(!postingRef.current){setOpen(false);setChecked(false)}}}>
    <header className="swtb-agreement-official-header">
     <div>
      <h2 id="swtb-agreement-official-heading">مطالعه و تأیید نسخه رسمی چارچوب همکاری</h2>
      <p>مبنای پذیرش: نسخه و متن دریافت‌شده از سرور؛ نه پیش‌نویس ذخیره‌شده در مرورگر</p>
     </div>
     <button type="button" disabled={posting} onClick={close}>بستن</button>
    </header>
    <div className="swtb-agreement-official-scroll" tabIndex={0}
     role="region" aria-label="متن کامل نسخه رسمی چارچوب همکاری">
     <ServerAgreementDocument snapshot={agreement}/>
    </div>
    <footer className="swtb-agreement-official-controls">
     {agreement.accepted?<p role="status">
       این نسخه قبلاً در سرور تأیید شده است؛ زمان ثبت: {readableTime(agreement.acceptedAt)}.
      </p>:<>
      <label>
       <input type="checkbox" checked={checked} disabled={posting}
        onChange={event=>setChecked(event.target.checked)}/>
       <span>{boldParts(agreement.document.acceptance)}</span>
      </label>
      <button type="button" onClick={()=>void submit()}
       disabled={!checked||posting}>
       {posting?'در حال ثبت و بررسی…':'تأیید و ثبت پذیرش همین نسخه'}
      </button>
      <p>در صورت عدم تأیید می‌توانید پنجره را ببندید. محدودکردن عملیات فقط پس از فعال‌شدن
       کنترل‌های معتبر سمت سرور و ابلاغ رسمی انجام خواهد شد.</p>
     </>}
     {agreement.upcoming&&<p>نسخه بعدی برای تاریخ {readableTime(agreement.upcoming.effective_at)} برنامه‌ریزی شده است.</p>}
     {note&&<p className="swtb-agreement-official-note" role="status">{note}</p>}
    </footer>
   </dialog>}
 </div>
}
