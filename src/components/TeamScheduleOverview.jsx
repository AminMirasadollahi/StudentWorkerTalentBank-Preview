import {useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react'
import {plusIsoDays,persianMonthCells,previousPersianMonth,nextPersianMonth} from '../lib/persianMonthCalendar.mjs'
import {persianWeekBounds} from '../lib/weeklyScheduleGrid.mjs'
import {projectTeamDay,projectTeamCalendarDays} from '../lib/teamCalendarProjection.mjs'
import {trapModalTab} from '../lib/dialogFocusTrap.mjs'

const fa=new Intl.NumberFormat('fa-IR')
const pretty=new Intl.DateTimeFormat('fa-IR-u-ca-persian',{
 dateStyle:'medium',timeZone:'UTC',
})
const weekdayLabels=['شنبه','یکشنبه','دوشنبه','سه‌شنبه','چهارشنبه','پنجشنبه','جمعه']
const unitNames={library:'کتابخانه',research:'پژوهش',public_relations:'روابط عمومی'}
const taskStates={
 assigned:'واگذار شده',in_progress:'در حال انجام',submitted:'گزارش ارسال‌شده',
 needs_changes:'نیازمند اصلاح',completed:'تکمیل‌شده',scheduled:'کار ثبت‌شده',unknown:'وضعیت نامشخص',
}
const dayName=iso=>pretty.format(new Date(iso+'T12:00:00Z'))
const presenceName=kind=>kind==='weekly'?'برنامه ثابت'
 :kind==='replacement'?'برنامه اصلاح‌شده'
 :kind==='unavailable'?'عدم حضور ثبت‌شده':'برنامه نامشخص'
const isVisiblePerson=person=>person.hasPlan||person.hasTask||person.kind==='unavailable'
const accessibleName=row=>`${dayName(row.date)}؛ ${fa.format(row.plannedWorkers)} نفر دارای برنامه، ${fa.format(row.taskCount)} کار واگذارشده؛ برای جزئیات انتخاب کنید`

export default function TeamScheduleOverview({data,todayIso,onPlanAssignment,
 audience='manager',onVisibleRangeChange=null,inlineManager=false,onEditWorker=null,
 selectedDay='',onSelectedDayChange=null}){
 const initialDate=inlineManager?(selectedDay||todayIso):todayIso
 const [weekAnchor,setWeekAnchor]=useState(initialDate)
 const [monthAnchor,setMonthAnchor]=useState(initialDate)
 const [selectedDate,setSelectedDate]=useState(inlineManager?initialDate:'')
 const inlineTitleRef=useRef(null)
 const inlineDidMount=useRef(false)
 const [showAll,setShowAll]=useState(Boolean(inlineManager))
 const dateDialogRef=useRef(null)
 const lastDateButtonRef=useRef(null)
 const month=useMemo(()=>persianMonthCells(monthAnchor),[monthAnchor])
 const week=useMemo(()=>persianWeekBounds(weekAnchor),[weekAnchor])
 const weekDays=useMemo(()=>Array.from({length:7},(_,i)=>plusIsoDays(week.start,i)),[week.start])
 const weekRows=useMemo(()=>weekDays.map(date=>projectTeamDay(data,date)),[weekDays,data])
 const monthRows=useMemo(()=>projectTeamCalendarDays(data,month.days),[data,month])
 const dailyByDate=useMemo(()=>new Map(monthRows.map(row=>[row.date,row])),[monthRows])
 const selected=useMemo(()=>selectedDate?projectTeamDay(data,selectedDate):null,[data,selectedDate])
 const people=selected?.people.filter(p=>showAll||isVisiblePerson(p))||[]
 const teamLabel=audience==='worker'?'همکاران':'همه دانشجوکاران'
 useEffect(()=>{
  onVisibleRangeChange?.({weekStart:week.start,weekEnd:week.end,
   monthStart:month.start,monthEnd:month.end})
 },[week.start,week.end,month.start,month.end,onVisibleRangeChange])
 useLayoutEffect(()=>{
  const dialog=dateDialogRef.current
  if(!dialog||inlineManager)return
  if(selectedDate){
   if(!dialog.open&&typeof dialog.showModal==='function'){
    try{dialog.showModal()}catch{return}
   }
   dialog.querySelector('[data-team-calendar-title]')?.focus()
  }else if(dialog.open){
   dialog.close()
   lastDateButtonRef.current?.focus()
  }
 },[selectedDate,inlineManager])
 useLayoutEffect(()=>{
  if(!inlineManager)return
  if(!inlineDidMount.current){inlineDidMount.current=true;return}
  if(selectedDate)inlineTitleRef.current?.focus?.({preventScroll:true})
 },[selectedDate,inlineManager])
 const openDay=(date,event)=>{
  lastDateButtonRef.current=event?.currentTarget||null
  setShowAll(Boolean(inlineManager))
  setSelectedDate(date)
  if(inlineManager)onSelectedDayChange?.(date)
  setWeekAnchor(date)
  if(date<month.start||date>month.end)setMonthAnchor(date)
 }
 const closeDay=()=>setSelectedDate('')
 const moveWeek=delta=>{
  const next=plusIsoDays(week.start,delta*7)
  setWeekAnchor(next)
  if(inlineManager){setMonthAnchor(next);setSelectedDate(next);onSelectedDayChange?.(next);setShowAll(true)}
  else closeDay()
 }
 const moveMonth=delta=>{
  const next=delta<0?previousPersianMonth(monthAnchor):nextPersianMonth(monthAnchor)
  setMonthAnchor(next)
  if(inlineManager){const first=persianMonthCells(next).start
   setWeekAnchor(first);setSelectedDate(first);onSelectedDayChange?.(first);setShowAll(true)}
  else closeDay()
 }
 const backToToday=()=>{
  setMonthAnchor(todayIso);setWeekAnchor(todayIso)
  if(inlineManager){setSelectedDate(todayIso);onSelectedDayChange?.(todayIso);setShowAll(true)}
  else closeDay()
 }
 return <div className={'ow-presence-hub ow-teamcal'+(inlineManager?' swtb22-manager-teamcal':'')} aria-label={`برنامه مشترک هفتگی و ماهانه ${teamLabel}`}>
   <section className="ow-presence-week ow-teamcal-week" aria-label="نمای هفتگی همه دانشجوکاران">
     <div className="ow-presence-section-title">
       <div><h3>برنامه هفتگی · {teamLabel}</h3>
         <small className="ow-muted">بازه {dayName(week.start)} تا {dayName(week.end)}</small></div>
       <div className="ow-month-navigation">
         <button className="ow-mini-btn" type="button" onClick={()=>moveWeek(-1)}>هفته قبل</button>
         <button className="ow-mini-btn" type="button" onClick={backToToday}>این هفته</button>
         <button className="ow-mini-btn" type="button" onClick={()=>moveWeek(1)}>هفته بعد</button>
       </div>
     </div>
     <div className="ow-teamcal-weekdays">
       {weekRows.map((row,index)=>{
        const active=row.people.filter(isVisiblePerson)
        return <button type="button" key={row.date}
          className={'ow-teamcal-week-row'+(row.date===todayIso?' is-today':'')+(inlineManager&&row.date===selectedDate?' is-selected':'')}
          aria-pressed={inlineManager?row.date===selectedDate:undefined}
          aria-label={accessibleName(row)}
          onClick={event=>openDay(row.date,event)}>
          <span className="ow-teamcal-week-date"><strong>{weekdayLabels[index]}</strong>
            <small>{dayName(row.date)}</small></span>
          <span className="ow-teamcal-week-content">
            <span className="ow-teamcal-counts">
              {fa.format(row.plannedWorkers)} نفر دارای برنامه · {fa.format(row.taskCount)} کار
            </span>
            <span className="ow-teamcal-chip-list" aria-hidden="true">
              {active.slice(0,3).map(p=><span className="ow-teamcal-chip"
                key={p.workerId} title={p.name}>{p.name}</span>)}
              {active.length>3&&<small>+{fa.format(active.length-3)} نفر</small>}
              {!active.length&&<small>برنامه ثبت‌شده‌ای وجود ندارد؛ وضعیت سایرین نامشخص است.</small>}
            </span>
          </span>
        </button>
       })}
     </div>
     <small className="ow-muted">برای دیدن نام افراد، بازه‌های حضور برنامه‌ریزی‌شده و وظایف همان روز، روی ردیف کلیک کنید.</small>
   </section>

   <section className="ow-presence-month ow-teamcal-month" aria-label="تقویم ماهانه همه دانشجوکاران">
     <div className="ow-presence-section-title ow-month-heading">
       <h3>تقویم ماهانه · {month.title}</h3>
       <div className="ow-month-navigation">
         <button className="ow-mini-btn" type="button" onClick={()=>moveMonth(-1)}>ماه قبل</button>
         <button className="ow-mini-btn" type="button" onClick={backToToday}>امروز</button>
         <button className="ow-mini-btn" type="button" onClick={()=>moveMonth(1)}>ماه بعد</button>
       </div>
     </div>
     <div className="ow-month-weekdays" aria-hidden="true">
       {['ش','ی','د','س','چ','پ','ج'].map((name,i)=><span key={i}>{name}</span>)}
     </div>
     <div className="ow-month-grid ow-teamcal-month-grid" role="group" aria-label={month.title}>
       {month.days.map((day,index)=>{
        if(!day)return <span key={'blank-'+index} className="ow-month-blank"/>
        const row=dailyByDate.get(day.date)
        return <button type="button" key={day.date}
          className={'ow-month-day ow-teamcal-day'+(day.date===todayIso?' is-today':'')+(inlineManager&&day.date===selectedDate?' is-selected':'')}
          aria-pressed={inlineManager?day.date===selectedDate:undefined}
          aria-label={accessibleName(row)}
          title={accessibleName(row)}
          onClick={event=>openDay(day.date,event)}>
          <b>{fa.format(day.day)}</b>
          {row.plannedWorkers>0&&<small className="ow-teamcal-day-planned">{fa.format(row.plannedWorkers)} نفر</small>}
          {row.taskCount>0&&<small className="ow-day-task">{fa.format(row.taskCount)} کار</small>}
          {!row.plannedWorkers&&!row.taskCount&&row.explicitlyUnavailable>0&&
            <small>تغییر حضور</small>}
         </button>
       })}
     </div>
     <small className="ow-muted">نمای خلاصه هر تاریخ؛ تعداد افراد نشان‌دهنده برنامه ثبت‌شده است، نه حضور قطعی یا ساعت تأییدشده.</small>
   </section>

   {inlineManager
    ?<aside id="swtb22-presence-day-inspector" className="swtb22-presence-day-inspector"
      role="region" aria-label="جزئیات روز و اشخاص انتخاب‌شده">
      {selected&&<div className="ow-teamcal-detail">
       <div className="ow-presence-section-title ow-presence-date-dialog__head">
         <h3 id="ow-teamcal-day-title" tabIndex={-1} data-team-calendar-title ref={inlineManager?inlineTitleRef:undefined}>
           برنامه گروهی · {dayName(selected.date)}</h3>
         <button className="ow-mini-btn" type="button" onClick={inlineManager?backToToday:closeDay}>{inlineManager?'بازگشت به امروز':'بستن'}</button>
       </div>
       <p className="ow-muted">
         {fa.format(selected.plannedWorkers)} نفر دارای برنامه ·
         {' '}{fa.format(selected.assignedWorkers)} نفر دارای کار ·
         {' '}{fa.format(selected.taskCount)} وظیفه
       </p>
       <label className="ow-teamcal-show-all">
         <input type="checkbox" checked={showAll}
           onChange={event=>setShowAll(event.target.checked)}/>
         نمایش افراد با برنامه نامشخص نیز
       </label>
       <div className="ow-teamcal-person-list">
         {people.map(p=><article className="ow-teamcal-person" key={p.workerId}>
           <div><strong>{p.name}</strong><small>{unitNames[p.unit]||'واحد اولیه نامشخص'}</small></div>
           <p><b>{presenceName(p.kind)}:</b>{' '}
             {p.windows.length?<span dir="ltr">{p.windows.map(w=>w.start+'–'+w.end).join('، ')}</span>:
              p.kind==='unknown'?'برنامه ثبت نشده است':'بازه حضور ثبت نشده است'}
           </p>
           {inlineManager&&onEditWorker&&<div className="swtb22-presence-person-actions">
            <button type="button" className="report-btn report-btn--light"
             disabled={selected.date<todayIso}
             onClick={()=>onEditWorker(p.workerId,selected.date)}>
             ویرایش برنامه همین تاریخ
            </button>

           </div>}
           {p.tasks.length>0&&<div className="ow-teamcal-person-tasks">
             {p.tasks.map((task,i)=><div key={task.id||i}>
               <strong>{task.title}</strong>
               <small>{unitNames[task.unit]||task.unit||'واحد نامشخص'}
                 {' · '}{taskStates[task.state]||taskStates.unknown}</small>
             </div>)}
           </div>}
         </article>)}
         {!people.length&&<p className="ow-muted">برای این تاریخ برنامه یا وظیفه‌ای ثبت نشده است. نبود اطلاعات به معنای غیبت نیست.</p>}
         {inlineManager&&selected.date<todayIso&&<p className="ow-muted">
           نمایش برنامه روزهای گذشته امکان‌پذیر است؛ ویرایش استثنا و واگذاری جدید در این تاریخ از این مسیر مجاز نیست.
         </p>}
       </div>
       {onPlanAssignment&&<div className="ow-teamcal-dialog-actions">
         <button type="button" className="report-btn report-btn--primary"
           onClick={()=>{
             const date=selected.date
             if(!inlineManager)closeDay()
             onPlanAssignment(date)
           }} disabled={inlineManager&&selected.date<todayIso}>+ تعریف کار در این تاریخ</button>
       </div>}
     </div>}
     </aside>
    :<dialog ref={dateDialogRef} dir="rtl" className="ow-presence-date-dialog ow-teamcal-dialog"
      aria-labelledby="ow-teamcal-day-title" onKeyDown={trapModalTab}
      onCancel={event=>{event.preventDefault();closeDay()}}
      onClose={()=>{if(selectedDate)closeDay()}}>
      {selected&&<div className="ow-teamcal-detail">
       <div className="ow-presence-section-title ow-presence-date-dialog__head">
         <h3 id="ow-teamcal-day-title" tabIndex={-1} data-team-calendar-title ref={inlineManager?inlineTitleRef:undefined}>
           برنامه گروهی · {dayName(selected.date)}</h3>
         <button className="ow-mini-btn" type="button" onClick={inlineManager?backToToday:closeDay}>{inlineManager?'بازگشت به امروز':'بستن'}</button>
       </div>
       <p className="ow-muted">
         {fa.format(selected.plannedWorkers)} نفر دارای برنامه ·
         {' '}{fa.format(selected.assignedWorkers)} نفر دارای کار ·
         {' '}{fa.format(selected.taskCount)} وظیفه
       </p>
       <label className="ow-teamcal-show-all">
         <input type="checkbox" checked={showAll}
           onChange={event=>setShowAll(event.target.checked)}/>
         نمایش افراد با برنامه نامشخص نیز
       </label>
       <div className="ow-teamcal-person-list">
         {people.map(p=><article className="ow-teamcal-person" key={p.workerId}>
           <div><strong>{p.name}</strong><small>{unitNames[p.unit]||'واحد اولیه نامشخص'}</small></div>
           <p><b>{presenceName(p.kind)}:</b>{' '}
             {p.windows.length?<span dir="ltr">{p.windows.map(w=>w.start+'–'+w.end).join('، ')}</span>:
              p.kind==='unknown'?'برنامه ثبت نشده است':'بازه حضور ثبت نشده است'}
           </p>
           {inlineManager&&onEditWorker&&<div className="swtb22-presence-person-actions">
            <button type="button" className="report-btn report-btn--light"
             disabled={selected.date<todayIso}
             onClick={()=>onEditWorker(p.workerId,selected.date)}>
             ویرایش برنامه همین تاریخ
            </button>

           </div>}
           {p.tasks.length>0&&<div className="ow-teamcal-person-tasks">
             {p.tasks.map((task,i)=><div key={task.id||i}>
               <strong>{task.title}</strong>
               <small>{unitNames[task.unit]||task.unit||'واحد نامشخص'}
                 {' · '}{taskStates[task.state]||taskStates.unknown}</small>
             </div>)}
           </div>}
         </article>)}
         {!people.length&&<p className="ow-muted">برای این تاریخ برنامه یا وظیفه‌ای ثبت نشده است. نبود اطلاعات به معنای غیبت نیست.</p>}
         {inlineManager&&selected.date<todayIso&&<p className="ow-muted">
           نمایش برنامه روزهای گذشته امکان‌پذیر است؛ ویرایش استثنا و واگذاری جدید در این تاریخ از این مسیر مجاز نیست.
         </p>}
       </div>
       {onPlanAssignment&&<div className="ow-teamcal-dialog-actions">
         <button type="button" className="report-btn report-btn--primary"
           onClick={()=>{
             const date=selected.date
             if(!inlineManager)closeDay()
             onPlanAssignment(date)
           }} disabled={inlineManager&&selected.date<todayIso}>+ تعریف کار در این تاریخ</button>
       </div>}
     </div>}
     </dialog>}
 </div>
}
