import test from 'node:test'
import assert from 'node:assert/strict'
import {buildOriginalWorkerNameIndex,selectManagerWorkerProfiles} from '../src/lib/managerWorkerProfileSearch.mjs'
const workers=[
 {id:'A',application_id:'APP-A',name:'نام فعلی الف'},
 {id:'B',application_id:'APP-B',name:'نام فعلی ب'},
]
const candidates=[
 {id:'APP-A',worker_id:'A',full_name:'نام اوليه كهن',worker_effective_full_name:'نام فعلی الف'},
 {id:'APP-B',worker_id:'B',full_name:'نام ثبت دوم'},
 {id:'APP-C',worker_id:null,full_name:'داوطلب بدون حساب'},
]
const history=[
 {worker_id:'A',field_code:'full_name',review_state:'approved',proposed_value:'نام میانی الف'},
 {worker_id:'A',field_code:'full_name',review_state:'pending',proposed_value:'نام پیشنهادی'},
 {worker_id:'A',field_code:'full_name',review_state:'rejected',proposed_value:'نام رد شده'},
 {worker_id:'A',field_code:'major',review_state:'approved',proposed_value:'رشته نمونه'},
 {worker_id:'C',field_code:'full_name',review_state:'approved',proposed_value:'خارج از دامنه'},
]
test('current, registration and available approved names resolve the same authorized worker',()=>{
 const {names,complete}=buildOriginalWorkerNameIndex(workers,candidates)
 assert.equal(complete,true)
 const find=q=>selectManagerWorkerProfiles(workers,history,names,q).map(r=>[r.worker.id,r.matchKind])
 assert.deepEqual(find('نام فعلی الف'),[['A','current']])
 assert.deepEqual(find('اولیه کهن'),[['A','original']])
 assert.deepEqual(find('میانی الف'),[['A','approved_history']])
 for(const q of ['نام پیشنهادی','نام رد شده','رشته نمونه','خارج از دامنه','داوطلب بدون حساب'])assert.deepEqual(find(q),[])
 assert.deepEqual(find('').map(x=>x[0]),['A','B'])
})
test('both identifiers must match; duplicate, ambiguous, missing and foreign rows cannot add aliases',()=>{
 const bad=[
  {id:'APP-B',worker_id:'A',full_name:'نام بیگانه'},
  {id:'APP-A',worker_id:'B',full_name:'نام نادرست'},
 ]
 const x=buildOriginalWorkerNameIndex(workers,bad)
 assert.equal(x.complete,false);assert.equal(x.names.size,0)
 const duplicate=buildOriginalWorkerNameIndex(workers,[...candidates,{...candidates[0]}])
 assert.equal(duplicate.complete,false);assert.equal(duplicate.names.has('A'),false)
 assert.equal(duplicate.names.has('B'),true)
 assert.equal(buildOriginalWorkerNameIndex(workers,null).complete,false)
})
test('available approved names still work without original snapshot; input is not mutated',()=>{
 const before=JSON.stringify({workers,candidates,history})
 const rows=selectManagerWorkerProfiles(workers,history,new Map(),'میانی')
 assert.equal(rows[0].worker,workers[0])
 assert.equal(rows[0].matchKind,'approved_history')
 assert.equal(JSON.stringify({workers,candidates,history}),before)
})
