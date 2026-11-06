import {useEffect,useMemo,useState} from 'react'
import ManagerSettingsDialog from './ManagerSettingsDialog'
import {
 getOperationsTermDashboard,getTermAccessOverview,
 setWorkerTermMembership,setTermAccessMode,
} from '../lib/operationsV2'

const number=new Intl.NumberFormat('fa-IR')
const eligibilityText={
 eligible:'مجاز به همکاری',not_eligible:'فاقد مجوز همکاری',unknown:'هنوز تعیین‌تکلیف نشده',
}
const globalState={active:'فعال',paused:'تعلیق',inactive:'غیرفعال'}
const termState={draft:'پیش‌نویس',active:'فعال',closed:'بسته‌شده'}
const reasonValid=value=>value.trim().length>=5&&value.trim().length<=500

export default function TermMembershipPanel({workers=[],refreshRevision=0,focusedReview=false}){
 const [terms,setTerms]=useState([])
 const [termId,setTermId]=useState('')
 const [termLoading,setTermLoading]=useState(true)
 const [termError,setTermError]=useState('')
 const [snapshot,setSnapshot]=useState({status:'idle',data:null})
 const [revision,setRevision]=useState(0)
 const [decision,setDecision]=useState(null)
 const [nextState,setNextState]=useState('eligible')
 const [reason,setReason]=useState('')
 const [modeEditor,setModeEditor]=useState(null)
 const [modeReason,setModeReason]=useState('')
 const [ack,setAck]=useState(false)
 const [saving,setSaving]=useState(false)
 const [writeError,setWriteError]=useState('')
 const [notice,setNotice]=useState('')
 const [query,setQuery]=useState('')
 const [eligibilityFilter,setEligibilityFilter]=useState('all')
 useEffect(()=>{
  let alive=true
  setTermLoading(true);setTermError('')
  getOperationsTermDashboard().then(r=>{
   if(!alive)return
   if(r?.ok!==true||!Array.isArray(r.terms))throw Error('invalid_terms')
   setTerms(r.terms)
   setTermId(old=>r.terms.some(t=>t.id===old)?old:
     (r.term?.id||r.terms.find(t=>t.state==='active')?.id||r.terms[0]?.id||''))
  }).catch(()=>{if(alive){setTerms([]);setTermError('دریافت فهرست نیمسال‌ها تأیید نشد.')}})
   .finally(()=>{if(alive)setTermLoading(false)})
  return()=>{alive=false}
 },[refreshRevision,revision])
 useEffect(()=>{
  let alive=true
  setSnapshot({status:termId?'loading':'idle',data:null})
  if(!termId)return()=>{alive=false}
  getTermAccessOverview(termId).then(r=>{
   if(!alive)return
   if(r?.ok!==true||!Array.isArray(r.workers)
      ||!['observe','enforced'].includes(r.enforcement_mode))throw Error('invalid_access_overview')
   setSnapshot({status:'ready',data:r})
  }).catch(()=>{if(alive){
    setSnapshot({status:'error',data:null});setDecision(null);setModeEditor(null)
  }})
  return()=>{alive=false}
 },[termId,revision,refreshRevision])
 const selected=terms.find(t=>t.id===termId)||null
 const access=snapshot.data
 const labels=useMemo(()=>new Map(workers.map(w=>[w.id,w.name])),[workers])
 const rows=useMemo(()=>[...(access?.workers||[])].sort((a,b)=>{
  const priority=x=>x.global_state==='active'&&x.eligibility==='unknown'?0:
   x.global_state==='active'?1:2
  return priority(a)-priority(b)||((labels.get(a.worker_id)||'').localeCompare(labels.get(b.worker_id)||'','fa'))
 }),[access,labels])
 const scopedRows=useMemo(()=>{
  if(!focusedReview)return rows
  const q=query.trim().toLocaleLowerCase('fa')
   .replace(/[يى]/g,'ی').replace(/ك/g,'ک')
  return rows.filter(row=>{
   if(eligibilityFilter!=='all'&&row.eligibility!==eligibilityFilter)return false
   const name=(labels.get(row.worker_id)||'').toLocaleLowerCase('fa')
    .replace(/[يى]/g,'ی').replace(/ك/g,'ک')
   return !q||name.includes(q)
  })
 },[rows,labels,query,eligibilityFilter,focusedReview])
 const startDecision=row=>{
  setDecision(row);setNextState(row.eligibility==='unknown'?'eligible':row.eligibility)
  setReason('');setWriteError('');setNotice('')
 }
 const submitDecision=async event=>{
  event.preventDefault()
  if(saving||snapshot.status!=='ready'||!access||!decision||
     !access.workers.some(row=>row.worker_id===decision.worker_id&&
       row.eligibility===decision.eligibility)||selected?.state==='closed'||
     !termId||nextState===decision.eligibility||
     (decision.eligibility!=='unknown'&&!reasonValid(reason)))return
  setSaving(true);setWriteError('')
  try{
   const r=await setWorkerTermMembership({
    workerId:decision.worker_id,termId,eligibility:nextState,reason:reason.trim()||null,
   })
   if(r?.ok!==true||r?.eligibility!==nextState)throw Error('unconfirmed_write')
   setDecision(null);setRevision(v=>v+1)
   setNotice('تصمیم عضویت ثبت شد؛ وضعیت از سرور بازخوانی می‌شود.')
  }catch{setWriteError('ثبت تصمیم تأیید نشد. وضعیت نیمسال و مجوز مدیر را بازبینی کنید.')}
  finally{setSaving(false)}
 }
 const submitMode=async event=>{
  event.preventDefault()
  if(saving||snapshot.status!=='ready'||!access||selected?.state!=='active'||
    !modeEditor||modeEditor===currentMode||
    (modeEditor==='enforced'&&!canEnable)||!termId||modeReason.trim().length<10||
    modeReason.trim().length>500||!ack)return
  setSaving(true);setWriteError('')
  try{
   const r=await setTermAccessMode({termId,mode:modeEditor,reason:modeReason.trim()})
   if(r?.ok!==true||r.enforcement_mode!==modeEditor)throw Error('unconfirmed_write')
   setModeEditor(null);setRevision(v=>v+1)
   setNotice('وضعیت کنترل ثبت شد؛ پیش از واگذاری بعدی، وضعیت جدید بازخوانی می‌شود.')
  }catch{setWriteError('تغییر حالت کنترل تأیید نشد. ممکن است حساب فعالی تعیین‌تکلیف نشده باشد؛ بازخوانی کنید.')}
  finally{setSaving(false)}
 }
 const openMode=next=>{
  setModeEditor(next);setModeReason('');setAck(false);setWriteError('');setNotice('')
 }
 const canEnable=selected?.state==='active'&&access?.active_without_decision===0
 const currentMode=access?.enforcement_mode||'observe'
 return <section className={"report-panel ow-membership"+(focusedReview?" swtb22-membership-focus":"")} aria-label="مجوز همکاری دانشجوکاران در نیمسال">
   <div className="ow-term-heading">
     <div><h2>مجوز همکاری در نیمسال</h2>
       <p className="ow-muted">وضعیت حساب و مجوز همکاری هر نیمسال مستقل هستند؛ سوابق و گزارش‌های قبلی حذف نمی‌شوند.</p>
     </div>
     <button type="button" className="report-btn report-btn--light"
       onClick={()=>setRevision(v=>v+1)} disabled={saving}>بازخوانی</button>
   </div>
   <label className="report-field ow-worker-selector"><span>نیمسال</span>
     <select aria-label="انتخاب نیمسال برای مجوز همکاری" value={termId}
       disabled={termLoading||saving}
       onChange={e=>{setTermId(e.target.value);setDecision(null);setModeEditor(null);setNotice('')}}>
       {terms.map(t=><option key={t.id} value={t.id}>{t.label} · {termState[t.state]||t.state}</option>)}
     </select>
   </label>
   {termLoading&&<p role="status" className="ow-muted">در حال دریافت نیمسال‌ها…</p>}
   {termError&&<p role="alert" className="report-alert report-alert--error">{termError}</p>}
   {snapshot.status==='loading'&&<p role="status" className="ow-muted">در حال بررسی مجوزها…</p>}
   {snapshot.status==='error'&&<p role="alert" className="report-alert report-alert--error">
     دریافت وضعیت مجوزها تأیید نشد؛ برای ایمنی، عملیات مدیریتی غیرفعال است.
   </p>}
   {notice&&<p role="status" className="ops-alert-success">{notice}</p>}
   {selected&&snapshot.status==='ready'&&access&&<>
     <div className="ow-membership-head">
       <div><strong>{selected.label}</strong><small>{termState[selected.state]||selected.state} ·
         کنترل واگذاری: {currentMode==='enforced'?'اجرایی':'فقط مشاهده'}</small></div>
       <span className={'ow-term-status-pill '+(currentMode==='enforced'?'ow-term-status-pill--active':'')}>
        {currentMode==='enforced'?'کنترل فعال':'کنترل غیرفعال'}</span>
     </div>
     <div className="ow-membership-metrics">
       <article><small>حساب فعال</small><b>{number.format(access.active_workers)}</b></article>
       <article><small>تعیین‌تکلیف‌نشده</small><b>{number.format(access.active_without_decision)}</b></article>
       <article><small>فعال اما غیرمجاز</small><b>{number.format(access.active_not_eligible)}</b></article>
       <article><small>وظایف قبلی نیازمند بررسی</small><b>{number.format(access.legacy_noneligible_planned_tasks)}</b></article>
     </div>
     <p className="ow-muted ow-membership-explainer">تعریف عضویت به‌تنهایی هیچ محدودیتی روی کارهای جدید اعمال نمی‌کند؛
       فقط پس از فعال‌کردن کنترل در سمت سرور، واگذاری‌های تازه برای افراد غیرمجاز یا تعیین‌تکلیف‌نشده مسدود می‌شوند.
       وظایف و ساعات تأییدشده قدیمی حفظ می‌شوند.</p>
     <div className="ow-membership-actions">
       {currentMode==='observe'
        ? <button type="button" className="report-btn report-btn--primary"
           disabled={!canEnable||saving}
           onClick={()=>openMode('enforced')}>فعال‌سازی کنترل واگذاری</button>
        : <button type="button" className="report-btn report-btn--light"
           disabled={saving||selected.state!=='active'}
           onClick={()=>openMode('observe')}>بازگشت به حالت مشاهده</button>}
       {currentMode==='observe'&&!canEnable&&
         <small className="ow-muted">{selected.state!=='active'?'فقط برای نیمسال فعال امکان اعمال کنترل وجود دارد.':
           'ابتدا وضعیت تمام حساب‌های فعال را مشخص کنید.'}</small>}
     </div>
     {focusedReview&&<div className="swtb22-membership-roster-tools" role="group"
       aria-label="مرور و فیلتر مجوزهای نیمسال">
       <label className="report-field"><span>جست‌وجوی دانشجوکار</span>
        <input type="search" value={query} onChange={e=>setQuery(e.target.value)}
         placeholder="نام دانشجوکار" aria-label="جست‌وجوی نام دانشجوکار در مجوزهای نیمسال"/>
       </label>
       <label className="report-field"><span>وضعیت مجوز این نیمسال</span>
        <select value={eligibilityFilter} onChange={e=>setEligibilityFilter(e.target.value)}
         aria-label="فیلتر مجوز همکاری نیمسال">
         <option value="all">همه وضعیت‌ها</option>
         <option value="unknown">تعیین‌تکلیف‌نشده</option>
         <option value="eligible">مجاز به همکاری</option>
         <option value="not_eligible">فاقد مجوز</option>
        </select>
       </label>
       <span className="swtb22-membership-count" role="status">
        {number.format(scopedRows.length)} از {number.format(rows.length)} دانشجوکار
       </span>
       {(query||eligibilityFilter!=='all')&&
        <button type="button" className="report-btn report-btn--light"
          onClick={()=>{setQuery('');setEligibilityFilter('all')}}>پاک‌کردن فیلتر</button>}
      </div>}
     <div className="ow-membership-table-wrap">
       <table className="ow-membership-table">
         <thead><tr><th>دانشجوکار</th><th>وضعیت حساب</th><th>مجوز این نیمسال</th><th>اقدام</th></tr></thead>
         <tbody>{scopedRows.map(row=><tr key={row.worker_id}>
           <td>{labels.get(row.worker_id)||'دانشجوکار ثبت‌شده'}</td>
           <td>{globalState[row.global_state]||row.global_state}</td>
           <td>{eligibilityText[row.eligibility]||'نامشخص'}</td>
           <td><button type="button" className="ow-mini-btn"
             disabled={selected.state==='closed'||saving}
             onClick={()=>startDecision(row)}
             aria-label={`تغییر مجوز همکاری ${labels.get(row.worker_id)||"دانشجوکار"}`}>
             {row.eligibility==='unknown'?'تعیین وضعیت':'تغییر'}
           </button></td>
         </tr>)}</tbody>
       </table>
       {focusedReview&&scopedRows.length===0&&<p className="ow-muted swtb22-membership-empty">
        {rows.length?'هیچ دانشجوکاری با این فیلتر یافت نشد.':'هنوز دانشجوکاری برای این نیمسال ثبت نشده است.'}
       </p>}
     </div>
   </>}
   {decision&&<ManagerSettingsDialog title="تعیین مجوز همکاری" busy={saving}
      onClose={()=>{if(!saving)setDecision(null)}}>
     <form className="ow-compact-form" onSubmit={submitDecision}>
       <strong>{labels.get(decision.worker_id)||'دانشجوکار'}</strong>
       <p className="ow-muted">این تصمیم فقط مربوط به نیمسال انتخاب‌شده است؛ وضعیت حساب و ساعات گذشته تغییر نمی‌کنند.</p>
       <label className="report-field"><span>وضعیت همکاری</span>
         <select value={nextState} disabled={saving} onChange={e=>setNextState(e.target.value)}>
           <option value="eligible">مجاز به همکاری</option>
           <option value="not_eligible">فاقد مجوز همکاری</option>
         </select>
       </label>
       {decision.eligibility!=='unknown'&&nextState!==decision.eligibility&&
        <label className="report-field"><span>دلیل تغییر (برای حسابرسی)</span>
         <input required minLength={5} maxLength={500} value={reason}
           disabled={saving} onChange={e=>setReason(e.target.value)}/>
        </label>}
       {writeError&&<p role="alert" className="report-alert report-alert--error">{writeError}</p>}
       <div className="ow-compact-form-actions">
         <button type="button" className="report-btn report-btn--light" disabled={saving}
           onClick={()=>setDecision(null)}>انصراف</button>
         <button type="submit" className="report-btn report-btn--primary"
           disabled={saving||nextState===decision.eligibility||
             (decision.eligibility!=='unknown'&&!reasonValid(reason))}>ثبت تصمیم</button>
       </div>
     </form>
   </ManagerSettingsDialog>}
   {modeEditor&&<ManagerSettingsDialog title={modeEditor==='enforced'?'فعال‌سازی کنترل واگذاری':'توقف کنترل واگذاری'}
      busy={saving} onClose={()=>{if(!saving)setModeEditor(null)}}>
     <form className="ow-compact-form" onSubmit={submitMode}>
       <p className="ow-muted">{modeEditor==='enforced'
         ?'از این مرحله، ثبت وظیفه جدید برای افراد فاقد مجوز این نیمسال مسدود خواهد شد؛ کارهای قبلی باقی می‌مانند.'
         :'کنترل مجوز ترمی برای واگذاری‌های جدید موقتاً غیرفعال می‌شود؛ تصمیم‌های عضویت و سوابق حفظ خواهند شد.'}</p>
       <label className="report-field"><span>دلیل تصمیم مدیریتی</span>
         <input required minLength={10} maxLength={500} value={modeReason}
           disabled={saving} onChange={e=>setModeReason(e.target.value)}/>
       </label>
       <label className="ow-membership-ack"><input type="checkbox" checked={ack}
         disabled={saving} onChange={e=>setAck(e.target.checked)}/>
         <span>پیامد این تغییر را بررسی کرده‌ام و تأیید می‌کنم.</span></label>
       {writeError&&<p role="alert" className="report-alert report-alert--error">{writeError}</p>}
       <div className="ow-compact-form-actions">
         <button type="button" className="report-btn report-btn--light" disabled={saving}
           onClick={()=>setModeEditor(null)}>انصراف</button>
         <button type="submit" className="report-btn report-btn--primary"
           disabled={saving||!ack||modeReason.trim().length<10||modeReason.trim().length>500}>
           {modeEditor==='enforced'?'فعال‌سازی کنترل':'ثبت تغییر حالت'}
         </button>
       </div>
     </form>
   </ManagerSettingsDialog>}
 </section>
}
