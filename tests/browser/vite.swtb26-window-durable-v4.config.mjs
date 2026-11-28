import {defineConfig} from 'vite'
import base from './vite.swtb24-r5.config.mjs'
const original=base.plugins[0]
// Use existing synthetic module exports, but deny ALL legacy calls in this test.
const fake={...original,resolveId(source,importer){
 if(/(^|\/)operationsV2(\.[cm]?js)?$/.test(source))return '\0swtb22-fake-api'
 if(/(^|\/)operations(\.[cm]?js)?$/.test(source))return '\0swtb22-fake-ops'
 if(/supabase/i.test(source))throw Error('LIVE_API_IMPORT_DENIED:'+source)
 return original.resolveId(source,importer)
},load(id){
 const v=original.load(id)
 if(typeof v!=='string')return v
 return v.replace(/export const (getAdminWorkV2|getMyWorkV2|getMyWorkerProfileV2|getAdminWork|getMyWork)=async[^;]*;/g,m=>m) // exact replacements below
  .replace('export const getAdminWorkV2=async()=>{if(globalThis.__qaAssignmentReadFail===true)throw Error("SYNTHETIC_READ_FAILED");return globalThis.__qaAdminWork;}','export const getAdminWorkV2=async()=>{globalThis.__qaLegacyReads++;throw Error("LEGACY_READ_DENIED")}')
  .replace('export const getMyWorkV2=async()=>({});','export const getMyWorkV2=async()=>{globalThis.__qaLegacyReads++;throw Error("LEGACY_READ_DENIED")};')
  .replace('export const getMyWorkerProfileV2=async()=>({});','export const getMyWorkerProfileV2=async()=>{globalThis.__qaLegacyReads++;throw Error("LEGACY_READ_DENIED")};')
  .replace('export const getAdminWork=async()=>globalThis.__qaAdminWork;','export const getAdminWork=async()=>{globalThis.__qaLegacyReads++;throw Error("LEGACY_READ_DENIED")};')
  .replace('export const getMyWork=async()=>({});','export const getMyWork=async()=>{globalThis.__qaLegacyReads++;throw Error("LEGACY_READ_DENIED")};')
}}
export default defineConfig({...base,plugins:[fake,...base.plugins.slice(1)],optimizeDeps:{entries:['tests/browser/swtb26-window-durable-v4-shell.html']},server:{host:'127.0.0.1',port:4186,strictPort:true}})
