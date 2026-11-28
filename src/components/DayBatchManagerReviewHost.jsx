// Detached review entry; production release has a separate wrapper and gate.
import React from 'react'
import TypedAssignmentManagerHost from './TypedAssignmentManagerHost.jsx'
import {createDayBatchVerifiedOwner} from '../lib/dayBatchVerifiedOwner.mjs'
const ownerFactory=(fixture,isVisible)=>createDayBatchVerifiedOwner({...fixture,mode:'review',isVisible})
export default function DayBatchManagerReviewHost(props){
 const {fixture,workspace=false}=props
 const staging=fixture?.mode==='staging-review'
 if(staging&&(!import.meta.env.DEV||!workspace||typeof fixture.readWork!=='function'||typeof fixture.readCandidates!=='function')||!staging&&fixture?.mode!=='synthetic-review')return <p role="status">مسیر بررسی در دسترس نیست.</p>
 return <TypedAssignmentManagerHost {...props} ownerFactory={ownerFactory} portMode="synthetic-review"/>
}
