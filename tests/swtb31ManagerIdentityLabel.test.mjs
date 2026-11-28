import test from 'node:test'
import assert from 'node:assert/strict'
import {managerIdentityLabel} from '../src/lib/managerIdentityLabel.mjs'
test('preserves named identity and distinguishes missing names with full record ID',()=>{
 assert.equal(managerIdentityLabel('  دانشجوکار الف  ','id-a'),'دانشجوکار الف')
 assert.equal(managerIdentityLabel('','id-a'),'نام ثبت نشده · شناسه id-a')
 assert.notEqual(managerIdentityLabel(null,'a-12345678'),managerIdentityLabel('   ','b-12345678'))
 assert.equal(managerIdentityLabel(undefined,undefined),'نام و شناسه در دسترس نیست')
 assert.equal(managerIdentityLabel(12,'id-b'),'نام ثبت نشده · شناسه id-b')
})
