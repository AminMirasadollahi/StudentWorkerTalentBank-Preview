import React,{useEffect,useRef,useState} from 'react'
import {parseTaskPrerequisites,prerequisiteDraft,confirmedPrerequisiteWrite,samePrerequisiteSet} from '../lib/taskPrerequisiteEditor.mjs'
const fa=new Intl.NumberFormat('fa-IR')
const labels={assigned:'واگذارشده',in_progress:'در حال انجام',submitted:'منتظر تأیید',needs_changes:'نیازمند اصلاح',completed:'تکمیل‌شده',cancelled:'لغوشده'}
// Mounted for one selected task only. Existing-task editing, not creation.
export default function TaskPrerequisiteEditor({task,tasks,workerLabel,formatDate,read,write}){
 const [snapshot,setSnapshot]=useState(null),[selected,setSelected]=useState([]),[reason,setReason]=useState('')
 const [query,setQuery]=useState(''),[busy,setBusy]=useState(true),[notice,setNotice]=useState(''),[error,setError]=useState('')
 const generation=useRef(0),lock=useRef(false)
 const load=async({afterWrite=false}={})=>{
  const seq=++generation.current;lock.current=true;setBusy(true);setSnapshot(null);setError('')
  if(!afterWrite)setNotice('')
  try{
   const next=parseTaskPrerequisites(await read(task.id),task.id)
   if(seq!==generation.current)return
   setSnapshot(next);setSelected(next.ids);setReason('')
  }catch{
   if(seq===generation.current)setError(afterWrite?'تغییر ثبت شد، ولی بازخوانی وضعیت فعلی ممکن نشد. فقط وضعیت را دوباره بخوانید.':'خواندن وضعیت پیش‌نیازها کامل نشد. تا بازخوانی موفق، تغییر مجاز نیست.')
  }finally{if(seq===generation.current){lock.current=false;setBusy(false)}}
 }
 useEffect(()=>{void load();return()=>{generation.current++;lock.current=true}},[task.id])
 const draft=prerequisiteDraft(snapshot,selected,reason)
 const changed=Boolean(snapshot&&!samePrerequisiteSet(snapshot.ids,selected))
 const save=async()=>{
  if(lock.current||busy||!draft)return
  lock.current=true;const seq=++generation.current
  setBusy(true);setNotice('');setError('')
  try{
   const response=await write({taskId:task.id,...draft})
   if(seq!==generation.current)return
   if(!confirmedPrerequisiteWrite(response,draft.prerequisites))throw Error('unknown_prerequisite_write')
   setNotice('تغییر پیش‌نیازها ثبت شد.')
   await load({afterWrite:true})
  }catch{
   if(seq!==generation.current)return
   // The server may have committed. No fresh mutation until authoritative read.
   setSnapshot(null);setError('نتیجه تغییر قطعی نیست یا وضعیت وظیفه تغییر کرده است. ابتدا وضعیت فعلی را بازخوانی کنید.')
   lock.current=false;setBusy(false)
  }
 }
 const byId=new Map((tasks||[]).filter(x=>x.id!==task.id).map(x=>[x.id,x]))
 for(const x of snapshot?.items||[])if(!byId.has(x.id))byId.set(x.id,x)
 const normalized=query.trim().toLocaleLowerCase('fa-IR')
 const candidates=[...byId.values()].filter(x=>selected.includes(x.id)||String(x.title||'').toLocaleLowerCase('fa-IR').includes(normalized))
 const toggle=id=>setSelected(prev=>prev.includes(id)?prev.filter(x=>x!==id):prev.length<20?[...prev,id]:prev)
 return <section className="ow-prerequisite-editor" aria-label="پیش‌نیازهای وظیفه موجود">
  <p className="ow-muted">پیش‌نیازهای این وظیفه موجود؛ تغییر فقط پیش از شروع یا ثبت گزارش مجاز است.</p>
  {notice&&<p role="status">{notice}</p>}{error&&<p role="alert">{error}</p>}
  {busy&&<p role="status">در حال بررسی…</p>}
  <button type="button" className="report-btn report-btn--light" disabled={busy} onClick={()=>void load()}>بازخوانی پیش‌نیازها</button>
  {snapshot&&<>
   <ul>{snapshot.items.map(x=><li key={x.id}>{x.title} · {x.satisfied?'تکمیل و تأیید شده':labels[x.state]||'در انتظار تکمیل'}</li>)}</ul>
   {!snapshot.items.length&&<p className="ow-muted">پیش‌نیازی ثبت نشده است.</p>}
   {!snapshot.editable?<p>این وظیفه دیگر از این مسیر قابل ویرایش نیست.</p>:<>
    <label className="report-field"><span>جست‌وجوی وظایف بارگذاری‌شده</span><input type="search" value={query} onChange={e=>setQuery(e.target.value)} disabled={busy}/></label>
    <p className="ow-muted">{fa.format(selected.length)} از ۲۰ پیش‌نیاز · ممکن است فهرست کارها به سوابق بارگذاری‌شده محدود باشد.</p>
    <fieldset disabled={busy} className="ow-prerequisite-options">
     <legend>انتخاب پیش‌نیازها</legend>
     {candidates.map(x=><label key={x.id}><input type="checkbox" checked={selected.includes(x.id)} disabled={!selected.includes(x.id)&&selected.length>=20} onChange={()=>toggle(x.id)}/>
      <span>{x.title} · {formatDate(x.planned_date)}{x.worker_id?' · '+workerLabel(x.worker_id):''}</span></label>)}
    </fieldset>
    {changed&&snapshot.ids.length>0&&<label className="report-field"><span>دلیل تغییر (حداقل ۵ حرف)</span><textarea maxLength={500} value={reason} onChange={e=>setReason(e.target.value)} disabled={busy}/></label>}
    <button type="button" className="report-btn report-btn--primary" disabled={!draft||busy} onClick={()=>void save()}>ثبت تغییر پیش‌نیازها</button>
   </>}
  </>}
 </section>
}
