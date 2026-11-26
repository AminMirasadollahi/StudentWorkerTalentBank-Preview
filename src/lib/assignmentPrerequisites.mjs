// V3 adds only the immutable concrete prerequisite set; V2 stays strict.
import {buildDirectAssignmentPayload} from './directAssignmentSession.mjs'
const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x)&&x!=='00000000-0000-0000-0000-000000000000'
export function canonicalAssignmentPrerequisites(ids){
 if(!Array.isArray(ids)||ids.length>20||!Array.from(ids).every(uuid))throw Error('INVALID_ASSIGNMENT_PREREQUISITES')
 const canonical=ids.map(x=>x.toLowerCase()).sort()
 if(new Set(canonical).size!==canonical.length)throw Error('INVALID_ASSIGNMENT_PREREQUISITES')
 return Object.freeze(canonical)
}
export function buildAssignmentRecoveryPayload(draft,requestId,version=2){
 if(version===2)return buildDirectAssignmentPayload(draft,requestId)
 if(version!==3||!draft||!Object.hasOwn(draft,'prerequisiteIds'))throw Error('INVALID_ASSIGNMENT_VERSION')
 const {prerequisiteIds,...ordinary}=draft
 const base=buildDirectAssignmentPayload(ordinary,requestId)
 return Object.freeze({...base,p_prerequisites:canonicalAssignmentPrerequisites(prerequisiteIds)})
}
export function validCanonicalAssignmentPrerequisites(ids){
 try{return JSON.stringify(ids)===JSON.stringify(canonicalAssignmentPrerequisites(ids))}catch{return false}
}
