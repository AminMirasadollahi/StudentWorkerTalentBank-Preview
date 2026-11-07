/* SWTB13 — accessible in-app worker guide. Uses native modal top layer:
 * no external CDN, no form submissions, no data/role changes, and no
 * interference with existing task/profile calendar dialogs.
 */
import {useEffect,useLayoutEffect,useRef,useState} from 'react'
import {getWorkerGuideSteps} from './lib/workerGuide.mjs'
import {trapModalTab} from './lib/dialogFocusTrap.mjs'
import './worker-guide.css'

function openModal(node){
 if(node&&!node.open&&typeof node.showModal==='function'){
  try{node.showModal()}catch{/* never steal focus from a real task dialog */}
 }
}
function closeModal(node){
 if(node?.open&&typeof node.close==='function')node.close()
}
const clamp=(value,minimum,maximum)=>Math.max(minimum,Math.min(maximum,value))
const safeRect=(rect,vw,vh)=>({
 x:clamp(rect.left-6,4,Math.max(4,vw-14)),
 y:clamp(rect.top-6,4,Math.max(4,vh-14)),
 w:Math.max(8,Math.min(rect.width+12,vw-12)),
 h:Math.max(8,Math.min(rect.height+12,vh-12)),
})
export function WorkerGuideWelcome({onBegin,onSkip}){
 const modal=useRef(null)
 useLayoutEffect(()=>{
  openModal(modal.current)
  return()=>closeModal(modal.current)
 },[])
 return <dialog className="swtb-guide-welcome" ref={modal} dir="rtl"
   aria-labelledby="swtb-guide-welcome-title" onKeyDown={trapModalTab}
   onCancel={e=>{e.preventDefault();onSkip()}}>
   <div className="swtb-guide-welcome__eyebrow">راهنمای آغاز کار</div>
   <h2 id="swtb-guide-welcome-title" tabIndex={-1}>به پنل دانشجوکار خوش آمدید</h2>
   <p>اینجا می‌توانید وظایف، برنامه حضور، گزارش‌های کار و مشخصات خود را مدیریت کنید.</p>
   <p>با یک راهنمای تصویری کوتاه، بخش‌های اصلی سامانه را بشناسید. هر وقت خواستید نیز می‌توانید از دکمه «راهنمای سامانه» یا «راهنمای این بخش» دوباره استفاده کنید.</p>
   <div className="swtb-guide-welcome__actions">
     <button type="button" className="swtb-guide-button swtb-guide-button--primary"
       onClick={onBegin}>شروع راهنمای سامانه</button>
     <button type="button" className="swtb-guide-button"
       onClick={onSkip}>فعلاً نه</button>
   </div>
 </dialog>
}
export function WorkerGuideSpotlight({scope,currentSection,onNavigate,onClose,includeWorkPool=true}){
 const steps=getWorkerGuideSteps(scope,{includeWorkPool})
 const [index,setIndex]=useState(0)
 const [layout,setLayout]=useState(null)
 const dialog=useRef(null)
 const heading=useRef(null)
 const active=steps[index]
 const activeSection=active?.section
 const activeAnchor=active?.anchor
 const elementSelector=activeAnchor?`[data-swtb-guide="${activeAnchor}"]`:''
 useLayoutEffect(()=>{
  openModal(dialog.current)
  return()=>closeModal(dialog.current)
 },[])
 useLayoutEffect(()=>{
  if(!active||activeSection===currentSection)return
  onNavigate(activeSection)
 },[activeSection,currentSection,onNavigate])
 useLayoutEffect(()=>{
  if(!active||activeSection!==currentSection)return
  let frame=0
  const measure=()=>{
   const node=document.querySelector(elementSelector)
   if(!node||!node.getClientRects().length){
    setLayout({missing:true,vw:window.innerWidth,vh:window.innerHeight})
    return
   }
   let rect=node.getBoundingClientRect()
   // Programmatic guidance may reveal an anchor, but never submits an action.
   if(rect.bottom>window.innerHeight-14||rect.top<10){
    node.scrollIntoView({behavior:'instant',block:'center',inline:'nearest'})
    rect=node.getBoundingClientRect()
   }
   const vw=window.innerWidth,vh=window.innerHeight
   const cut=safeRect(rect,vw,vh)
   const pw=Math.min(356,vw-24),ph=250
   const gap=18
   const leftSpace=rect.left-gap,rightSpace=vw-rect.right-gap
   let left,top
   if(rightSpace>=pw){
    left=rect.right+gap
    top=rect.top+(rect.height-ph)/2
   }else if(leftSpace>=pw){
    left=rect.left-pw-gap
    top=rect.top+(rect.height-ph)/2
   }else {
    left=(vw-pw)/2
    top=rect.bottom+gap+ph<=vh?rect.bottom+gap:rect.top-ph-gap
   }
   left=clamp(left,12,Math.max(12,vw-pw-12))
   top=clamp(top,12,Math.max(12,vh-ph-12))
   setLayout({vw,vh,cut,left,top,pw})
  }
  const scheduled=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(measure)}
  scheduled()
  const target=document.querySelector(elementSelector)
  const observer=typeof ResizeObserver==='function'?new ResizeObserver(scheduled):null
  if(target)observer?.observe(target)
  // Async profile/hour summaries may mount after the section navigation.
  // Retry when that specific target appears instead of showing a permanent
  // "missing element" step. No polling or external service is involved.
  const missing=(!target&&typeof MutationObserver==='function')
    ?new MutationObserver(()=>{
      if(document.querySelector(elementSelector)){missing.disconnect();scheduled()}
     }):null
  if(missing)missing.observe(document.getElementById('ow-b3-main')||document.body,
    {childList:true,subtree:true})
  window.addEventListener('resize',scheduled)
  window.addEventListener('scroll',scheduled,true)
  return()=>{
   cancelAnimationFrame(frame)
   observer?.disconnect()
   missing?.disconnect()
   window.removeEventListener('resize',scheduled)
   window.removeEventListener('scroll',scheduled,true)
  }
 },[scope,index,activeSection,currentSection,elementSelector])
 useLayoutEffect(()=>{
  if(activeSection!==currentSection||!layout?.cut&&!layout?.missing)return
  heading.current?.focus({preventScroll:true})
 },[index,activeSection,currentSection,Boolean(layout?.cut),Boolean(layout?.missing)])
 if(!active)return null
 const last=index===steps.length-1
 const viewportWidth=layout?.vw||window.innerWidth
 const viewportHeight=layout?.vh||window.innerHeight
 const ready=activeSection===currentSection&&Boolean(layout?.cut||layout?.missing)
 const mask=ready&&layout?.cut
   ?`M0 0H${viewportWidth}V${viewportHeight}H0Z M${layout.cut.x} ${layout.cut.y}h${layout.cut.w}v${layout.cut.h}h-${layout.cut.w}Z`
   :`M0 0H${viewportWidth}V${viewportHeight}H0Z`
 const move=delta=>{
  const next=clamp(index+delta,0,steps.length-1)
  if(next===index)return
  const nextStep=steps[next]
  if(nextStep.section!==currentSection)onNavigate(nextStep.section)
  setLayout(null)
  setIndex(next)
 }
 return <dialog ref={dialog} className="swtb-guide-spotlight" dir="rtl"
   aria-labelledby="swtb-guide-step-title"
   onCancel={event=>{event.preventDefault();onClose()}}
   onKeyDown={event=>{
    trapModalTab(event)
    // In RTL, left arrow follows the visual forward direction.
    if(event.target?.tagName==='BUTTON')return
    if(event.key==='ArrowLeft'){event.preventDefault();if(!last)move(1)}
    if(event.key==='ArrowRight'){event.preventDefault();move(-1)}
   }}>
   <svg aria-hidden="true" className="swtb-guide-shade"
     width={viewportWidth} height={viewportHeight}
     viewBox={`0 0 ${viewportWidth} ${viewportHeight}`}>
     <path d={mask} fillRule="evenodd" fill="rgba(10,32,45,.66)"/>
   </svg>
   <section key={`${scope}-${index}`} className="swtb-guide-popover" data-guide-ready={ready?'true':'false'}
     style={layout?.missing?{left:'50%',top:'50%',transform:'translate(-50%,-50%)',visibility:ready?'visible':'hidden'}
      :{left:layout?.left??12,top:layout?.top??12,width:layout?.pw??356,visibility:ready?'visible':'hidden'}}
     aria-label="مرحله راهنما">
     <div className="swtb-guide-popover__top">
       <span>راهنمای {scope==='all'?'سامانه':'این بخش'}</span>
       <button type="button" className="swtb-guide-close"
         aria-label="خروج از راهنما" onClick={onClose}>×</button>
     </div>
     <h2 id="swtb-guide-step-title" tabIndex={-1} ref={heading}>{active.title}</h2>
     <p>{active.description}</p>
     {layout?.missing&&<p className="swtb-guide-error" role="status">
       این قسمت اکنون در دسترس نیست؛ می‌توانید مرحله بعد را ببینید.
     </p>}
     <div className="swtb-guide-popover__footer">
       <span className="swtb-guide-progress" aria-live="polite">
         مرحله {index+1} از {steps.length}
       </span>
       <div className="swtb-guide-popover__actions">
         <button type="button" className="swtb-guide-button" disabled={index===0}
           onClick={()=>move(-1)}>قبلی</button>
         {last
           ?<button type="button" className="swtb-guide-button swtb-guide-button--primary"
              onClick={onClose}>شروع کار با سامانه</button>
           :<button type="button" className="swtb-guide-button swtb-guide-button--primary"
              onClick={()=>move(1)}>بعدی</button>}
       </div>
     </div>
   </section>
 </dialog>
}
