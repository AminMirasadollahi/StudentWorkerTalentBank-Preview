import {useEffect,useState} from 'react'
import {windowReadReviewScope} from '../lib/windowReadReviewPort.mjs'
import WindowReadReview from './WindowReadReview.jsx'
function ScopedRead({scope,section}){
 const [result,setResult]=useState({state:'loading'})
 useEffect(()=>{
  let active=true
  scope.port.read(scope.context).then(snapshot=>{if(active)setResult({state:'ready',snapshot})}).catch(()=>{if(active)setResult({state:'denied'})})
  return()=>{active=false}
 },[scope.port,scope.key])
 if(result.state==='loading')return <p role="status">در حال دریافت اطلاعات معتبر آزمایشی…</p>
 if(result.state!=='ready')return <p role="alert">دریافت قرارداد معتبر ممکن نشد؛ اطلاعات قبلی نمایش داده نمی‌شود.</p>
 return <WindowReadReview role={scope.context.role} workerId={scope.context.workerId} snapshot={result.snapshot} syntheticReviewOnly section={section} embedded/>
}
export default function WindowReadReviewSlot({request,role,workerId=null,refreshRevision=0,section}){
 const scope=windowReadReviewScope(request,role,workerId,refreshRevision)
 if(!scope)return <p role="alert">مجوز نمای آزمایشی تأیید نشده است.</p>
 // A new identity, revision, or role remounts the data-bearing subtree.
 return <ScopedRead key={scope.key+':'+section} scope={scope} section={section}/>
}
