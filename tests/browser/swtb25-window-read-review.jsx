import React,{useState} from 'react'
import {createRoot} from 'react-dom/client'
import WindowReadReview from '../../src/components/WindowReadReview.jsx'
import '../../src/typography.css'
import '../../src/styles.css'
import {worker,manager,self} from './windowReadReviewFixtureData.mjs'
function App(){const [role,setRole]=useState('manager');return <><div dir="rtl" style={{padding:12,display:'flex',gap:8}}><button type="button" onClick={()=>setRole('manager')}>نمای مدیر</button><button type="button" onClick={()=>setRole('worker')}>نمای دانشجوکار</button></div><WindowReadReview key={role} role={role} snapshot={role==='manager'?manager:self} workerId={worker} syntheticReviewOnly/></>}
createRoot(document.getElementById('root')).render(<App/>)
