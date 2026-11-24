import {useRef,useSyncExternalStore} from 'react'
const empty=()=>null
const noop=()=>()=>{}
export function useWorkPoolFence(fence){
 const owner=useRef(Symbol('pool-owner')).current
 const lock=useSyncExternalStore(fence?.subscribe??noop,fence?.getSnapshot??empty,empty)
 return {owner,lock,blockedByOther:Boolean(lock&&lock.owner!==owner)}
}
