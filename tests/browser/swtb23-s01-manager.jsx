import React,{useState} from 'react'
import {createRoot} from 'react-dom/client'
import WorkerSecureLinkReissue from '../../src/components/WorkerSecureLinkReissue'
import '../../src/styles.css'
window.__s01={phase:'reserved',ref:'synthetic-ref',calls:[],reissues:[],defer:false,resolve:null}
function Fixture(){
 const [worker,setWorker]=useState('synthetic-a')
 const s=window.__s01
 const supportRpc=async(name,args)=>{
  s.calls.push([name,args])
  if(name==='ops_s01_cancel_reserved'){
   if(args.p_worker_id!==worker||args.p_support_ref!==s.ref||s.phase!=='reserved')return {data:{ok:false},error:null}
   s.phase='none';return {data:{ok:true},error:null}
  }
  const result={data:{ok:true,phase:s.phase,support_ref:s.ref},error:null}
  if(s.defer)return new Promise(resolve=>{s.resolve=()=>resolve(result)})
  return result
 }
 return <main dir="rtl"><button onClick={()=>setWorker('synthetic-b')}>تغییر پرونده آزمایشی</button><WorkerSecureLinkReissue workerId={worker} workerState="active" saving={false} supportRpc={supportRpc} onReissue={id=>s.reissues.push(id)}/></main>
}
createRoot(document.getElementById('root')).render(<Fixture/>)
