/* SWTB14 — REVIEW-ONLY modal. Must NOT issue policy acceptance, lock worker
 * operations, or claim to be the canonical server-published agreement. */
import {useEffect,useRef} from 'react'
import {trapModalTab} from '../lib/dialogFocusTrap.mjs'
import WorkerAgreementReview from './WorkerAgreementReview.jsx'
import {workerAgreementApprovalCandidate} from '../lib/workerAgreementApprovalCandidate.mjs'
import './worker-agreement-modal.css'

export default function WorkerAgreementModalPreview({open,onClose}){
 const dialogRef=useRef(null)
 const isReadingEdition=workerAgreementApprovalCandidate.version==='1.0-rc6'&&workerAgreementApprovalCandidate.status==='draft'
 useEffect(()=>{
  const dialog=dialogRef.current
  if(!open||!dialog)return
  if(typeof dialog.showModal==='function'){
   try{if(!dialog.open)dialog.showModal()}catch{
    // A non-modal preview fallback is still browseable in older test browsers.
    dialog.setAttribute('open','')
   }
  }else dialog.setAttribute('open','')
  return()=>{
   try{if(typeof dialog.close==='function'&&dialog.open)dialog.close()}
   catch{}
  }
 },[open])
 if(!open)return null
 const handleNativeClose=()=>{
  // StrictMode may run effect cleanup and immediately showModal again.
  // A delayed 'close' event from that internal cleanup MUST NOT dismiss
  // the newly opened preview.
  if(dialogRef.current?.open)return
  onClose?.()
 }
 const close=()=>{
  const dialog=dialogRef.current
  if(dialog?.open&&typeof dialog.close==='function'){
   dialog.close() // native 'close' event owns the single onClose notification
   return
  }
  onClose?.() // older non-modal fallback
 }
 return <dialog ref={dialogRef} className="swtb-policy-modal"
   onClose={handleNativeClose} onKeyDown={trapModalTab}
   aria-labelledby="swtb-policy-modal-heading" dir="rtl">
   <div className="swtb-policy-modal-head">
    <div>
     <h2 id="swtb-policy-modal-heading">چارچوب همکاری دانشجوکاران</h2>
     <p>{isReadingEdition?'نسخه ۱.۰ برای مطالعه · تأیید و ثبت پذیرش رسمی هنوز فعال نشده است':`نسخه ${workerAgreementApprovalCandidate.version} · برای مطالعه و بازبینی`}</p>
    </div>
    <button type="button" className="swtb-policy-modal-close" onClick={close}
     aria-label="بستن پیش‌نمایش چارچوب همکاری">بستن ×</button>
   </div>
   <div className="swtb-policy-modal-body" role="region" tabIndex={0}
     aria-label="متن کامل چارچوب همکاری؛ با کلیدهای جهت‌دار قابل پیمایش است">
    <WorkerAgreementReview policy={workerAgreementApprovalCandidate}/>
   </div>
 </dialog>
}
