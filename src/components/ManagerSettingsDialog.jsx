import {useEffect,useId,useRef} from 'react'
import {createPortal} from 'react-dom'

/** Native modal keeps the rest of the application inert and traps keyboard focus.
 * Test-only fallback covers JSDOM environments without HTMLDialogElement.showModal.
 */
export default function ManagerSettingsDialog({title,onClose,busy=false,children}){
 const id=useId()
 const ref=useRef(null)
 useEffect(()=>{
  const element=ref.current
  const opener=document.activeElement
  if(typeof element.showModal==='function')element.showModal()
  else element.setAttribute('open','')
  element.querySelector('[data-manager-dialog-title]')?.focus()
  return ()=>{
   if(element.open&&typeof element.close==='function')element.close()
   else element.removeAttribute('open')
   if(opener?.isConnected&&typeof opener.focus==='function')opener.focus()
  }
 },[])
 const onKeyDown=e=>{
  if(e.key==='Escape'&&typeof ref.current?.showModal!=='function'){
   e.preventDefault()
   if(!busy)onClose()
   return
  }
  if(e.key!=='Tab')return
  // Native <dialog> already loops focus. Fallback makes JSDOM tests deterministic.
  if(typeof ref.current?.showModal==='function')return
  const focusable=[...ref.current.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]')]
   .filter(el=>el.getAttribute('aria-hidden')!=='true')
  if(!focusable.length){e.preventDefault();return}
  const first=focusable[0],last=focusable[focusable.length-1]
  if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}
  else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}
 }
 return createPortal(<dialog ref={ref} className="ow-manager-dialog" dir="rtl"
  aria-modal="true" aria-labelledby={id} onKeyDown={onKeyDown}
  onCancel={e=>{e.preventDefault();if(!busy)onClose()}}>
  <div className="ow-manager-dialog-head">
   <h2 id={id} tabIndex={-1} data-manager-dialog-title>{title}</h2>
   <button className="report-btn report-btn--light" type="button" onClick={onClose} disabled={busy}>بستن</button>
  </div>
  <div className="ow-manager-dialog-content">{children}</div>
 </dialog>,document.body)
}
