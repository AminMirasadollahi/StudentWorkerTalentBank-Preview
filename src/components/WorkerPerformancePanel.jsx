import {projectWorkerPerformance} from '../lib/workerPerformance.mjs'
import WorkerInfoHint from './WorkerInfoHint.jsx'

const nf=new Intl.NumberFormat('fa-IR')
const duration=minutes=>{
 if(minutes===null)return 'نیازمند بررسی'
 const hours=Math.floor(minutes/60),remaining=minutes%60
 return hours?nf.format(hours)+' ساعت'+(remaining?' و '+nf.format(remaining)+' دقیقه':''):
  nf.format(remaining)+' دقیقه'
}
function PerformanceBars({items,labelOf}){
 const max=Math.max(1,...items.map(item=>item.minutes))
 return <div className="ow-worker-performance-bars" role="list">
  {items.map(item=><div key={item.key||item.unit} role="listitem"
    className="ow-worker-performance-bar-row"
    aria-label={labelOf(item)+'، '+duration(item.minutes)}>
   <span>{labelOf(item)}</span>
   <div className="ow-worker-performance-bar-track" aria-hidden="true">
    <div style={{width:100*item.minutes/max+'%'}}/>
   </div>
   <strong>{duration(item.minutes)}</strong>
  </div>)}
 </div>
}
// A donut is used ONLY for a few mutually exclusive work-unit shares.
function UnitDonut({items,total,labelOf}){
 const palette=['#087e75','#4b76b9','#b57a28','#8767ac','#447e98']
 let angle=0
 const arcs=[]
 for(let i=0;i<items.length;i++){
  const value=items[i].minutes
  if(total<=0||value<=0)continue
  const next=angle+value/total*360
  arcs.push(palette[i%palette.length]+' '+angle+'deg '+next+'deg')
  angle=next
 }
 const background=total>0&&arcs.length?('conic-gradient('+arcs.join(', ')+')'):'#e3ecef'
 return <div className="ow-worker-unit-donut" aria-label="سهم کارکرد تأییدشده بر اساس واحد">
  <div className="ow-worker-unit-donut-ring" style={{background}}
    aria-hidden="true">
   <div className="ow-worker-unit-donut-hole">
    <strong>{duration(total)}</strong>
    <small>در همین نتایج</small>
   </div>
  </div>
  <ul className="ow-worker-unit-donut-legend">
   {items.map((item,i)=><li key={item.unit} aria-label={
    labelOf(item)+'، '+duration(item.minutes)+
     (total>0?'، '+nf.format(Math.round(item.minutes/total*100))+' درصد':'، بدون سهم')
   }>
    <span className="ow-worker-unit-donut-color" aria-hidden="true"
      style={{background:palette[i%palette.length]}}/>
    <span>{labelOf(item)}</span>
    <strong>{duration(item.minutes)}</strong>
   </li>)}
  </ul>
 </div>
}
export default function WorkerPerformancePanel({rows=[],tasks=[],units={}}){
 const metrics=projectWorkerPerformance(rows,tasks)
 // Zero is a real metric only when all approved-minute rows are valid.
 // The three known work units remain visible as truthful zero-height bars;
 // do not generate invented work dates or approved credits.
 const byUnitMap=new Map(metrics.byUnit.map(row=>[row.unit,row.minutes]))
 const byUnit=[
  ...Object.keys(units).map(unit=>({unit,minutes:byUnitMap.get(unit)||0})),
  ...metrics.byUnit.filter(row=>!Object.hasOwn(units,row.unit)),
 ]
 const readyUnit=metrics.approvedMinutes!==null&&metrics.missingUnitCount===0
 const readyMonth=metrics.approvedMinutes!==null&&metrics.missingWorkDateCount===0
 return <section className="ow-worker-performance" aria-label="عملکرد من در گزارش‌های بارگذاری‌شده">
  <header className="ow-worker-performance-heading">
   <div className="ow-worker-title-inline">
    <h3>عملکرد در نتایج فیلترشده</h3>
    <WorkerInfoHint label="منبع تحلیل عملکرد" text="آمار این بخش فقط از گزارش‌های مجاز و بارگذاری‌شده‌ای محاسبه می‌شود که با فیلترهای بالا تطبیق دارند؛ ممکن است همه سوابق را پوشش ندهد. ساعات تأییدشده قطعیِ همه دوره‌ها در خلاصه بالای صفحه است. زمان برنامه‌ریزی‌شده یا گزارش درخواستی، ساعت تأییدشده نیست."/>
   </div>
  </header>
  <div className="ow-worker-performance-kpis">
   <article><span>زمان تأییدشده در این نتایج</span>
     <strong>{duration(metrics.approvedMinutes)}</strong></article>
   <article><span>کارهای تکمیل‌شده مرتبط</span>
     <strong>{nf.format(metrics.completedTaskCount)}</strong></article>
   <article><span>گزارش‌های منتظر بررسی</span>
     <strong>{nf.format(metrics.pendingCount)}</strong></article>
  </div>
  {(metrics.missingApprovedCount>0||metrics.missingTaskCount>0)&&
   <p role="status" className="ow-worker-performance-warning">
    {metrics.missingApprovedCount>0&&
     <span>{nf.format(metrics.missingApprovedCount)} گزارش تأییدشده مدت معتبر ندارد؛
       جمع و نمودار زمان قابل اتکا نیست. </span>}
    {metrics.missingTaskCount>0&&
     <span>{nf.format(metrics.missingTaskCount)} گزارش، وظیفه مرتبط را در فهرست فعلی ندارد؛
       شمار کارهای تکمیل‌شده ممکن است ناقص باشد.</span>}
   </p>}
  <section className="ow-worker-performance-chart-disclosure" aria-label="نمودارهای کارکرد تأییدشده">
   <h4 className="ow-worker-performance-chart-heading">نمودارهای کارکرد تأییدشده</h4>
   <div className="ow-worker-performance-chart-grid">
    <section aria-label="کارکرد تأییدشده بر اساس واحد">
     <h4>سهم واحدهای انجام کار</h4>
     {readyUnit?<UnitDonut items={byUnit} total={metrics.approvedMinutes}
       labelOf={item=>units[item.unit]||item.unit}/>:
      <p className="ow-worker-chart-unavailable">انتساب واحد یا مقدار تأییدشده برای بعضی گزارش‌ها ناقص است؛ نمودار نمایش داده نمی‌شود.</p>}
    </section>
    <section aria-label="کارکرد تأییدشده بر اساس ماه شمسی">
     <h4>روند ماهانه انجام کار</h4>
     {!readyMonth?<p className="ow-worker-chart-unavailable">
       تاریخ انجام یا مقدار تأییدشده برای بعضی گزارش‌ها ناقص است؛ نمودار نمایش داده نمی‌شود.
      </p>:metrics.byMonth.length>0?
      <PerformanceBars items={metrics.byMonth} labelOf={item=>item.label}/>:
      <div className="ow-worker-performance-zero-month" role="img"
       aria-label="در نتایج فعلی هیچ گزارش تأییدشده‌ای با تاریخ معتبر برای نمودار ماهانه وجود ندارد">
       <div className="ow-worker-performance-zero-axis" aria-hidden="true"/>
       <strong>{nf.format(0)} دقیقه</strong>
       <small>بدون گزارش تأییدشده در این بازه</small>
      </div>}
    </section>
   </div>
  </section>
 </section>
}
