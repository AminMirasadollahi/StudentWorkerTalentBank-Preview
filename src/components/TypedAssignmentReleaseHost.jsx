// Separate normal-build release entry, selected only by explicit build flags.
import React,{useMemo} from 'react'
import TypedAssignmentManagerHost from './TypedAssignmentManagerHost.jsx'
import {createTypedAssignmentReleaseManagerFixture} from '../lib/typedAssignmentReleaseManagerFixture.mjs'
import {createTypedAssignmentReleaseOwner} from '../lib/dayBatchVerifiedOwner.mjs'
const ownerFactory=(fixture,isVisible)=>createTypedAssignmentReleaseOwner({...fixture,isVisible})
const fetchScoped=(...args)=>globalThis.fetch(...args)
const today=()=>{const p=Object.fromEntries(new Intl.DateTimeFormat('en-US',{calendar:'gregory',numberingSystem:'latn',timeZone:'Asia/Tehran',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).map(x=>[x.type,x.value]));return [p.year,p.month,p.day].join('-')}
const makeId=()=>globalThis.crypto.randomUUID()
export default function TypedAssignmentReleaseHost({auth,actorId,scope,checking,onLogout,children}){
 const fixture=useMemo(()=>{try{return createTypedAssignmentReleaseManagerFixture({env:import.meta.env,auth,actorId,fetchImpl:fetchScoped,makeId,today})}catch{return null}},[auth,actorId])
 if(!fixture)return <main role="alert" dir="rtl">مسیر جدید واگذاری در دسترس نیست؛ ثبت جایگزین انجام نمی‌شود.<button type="button" onClick={onLogout}>خروج</button></main>
 return <TypedAssignmentManagerHost fixture={fixture} ownerFactory={ownerFactory} portMode="typed-release" workspace scope={scope} checking={checking} onLogout={onLogout}>{children}</TypedAssignmentManagerHost>
}
