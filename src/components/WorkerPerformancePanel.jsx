import {projectWorkerPerformance} from '../lib/workerPerformance.mjs'

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
export default function WorkerPerformancePanel({rows=[],tasks=[],units={}}){
 const metrics=projectWorkerPerformance(rows,tasks)
 const monthlyReady=metrics.approvedMinutes!==null&&
  metrics.missingWorkDateCount===0&&metrics.byMonth.filter(x=>x.minutes>0).length>=2
 const unitsReady=metrics.approvedMinutes!==null&&
  metrics.missingUnitCount===0&&metrics.byUnit.filter(x=>x.minutes>0).length>=2
 return <section className="ow-worker-performance" aria-label="عملکرد من در گزارش‌های بارگذاری‌شده">
  <header className="ow-worker-performance-heading">
   <h3>عملکرد من</h3>
   <p>خلاصه فقط براساس {nf.format(metrics.reportCount)} گزارش موجود و فیلترشده در همین صفحه است؛
     جمع قطعی تمام‌دوره را در خلاصه سروری بالا ببینید.</p>
  </header>
  <div className="ow-worker-performance-kpis">
   <article><span>زمان تأییدشده در همین نتایج</span>
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
  <details className="ow-worker-performance-chart-disclosure">
   <summary>نمودارهای کارکرد تأییدشده</summary>
   <div className="ow-worker-performance-chart-grid">
    <section aria-label="روند ماهانه کارکرد تأییدشده">
     <h4>به تفکیک ماه شمسی</h4>
     {monthlyReady?<PerformanceBars items={metrics.byMonth} labelOf={item=>item.label}/>:
      <p>برای رسم روند، دو ماه دارای کارکرد تأییدشده و تاریخ معتبر لازم است.</p>}
    </section>
    <section aria-label="کارکرد تأییدشده بر اساس واحد">
     <h4>به تفکیک واحد انجام کار</h4>
     {unitsReady?<PerformanceBars items={metrics.byUnit}
       labelOf={item=>units[item.unit]||item.unit}/>:
      <p>برای مقایسه، دو واحد دارای زمان تأییدشده و انتساب معتبر لازم است.</p>}
    </section>
   </div>
   <p className="ow-worker-performance-note">
    نمودارها از برنامه حضور یا زمان درخواستی ساخته نمی‌شوند؛ فقط زمان تأییدشده مدیر
    در گزارش‌های بارگذاری‌شده ملاک است. نبود نمودار به معنای نبود فعالیت نیست.
   </p>
  </details>
 </section>
}
