/* SWTB22 isolated visual harness: fake only, never the real Supabase client. */
import {defineConfig} from 'vite'
import react from '@vitejs/plugin-react'
const api=[
 'export const getOperationsTermDashboard=async()=>({ok:true,terms:[{id:"fake-term",label:"نیمسال نمونه",state:"active"}]});',
 'export const getManagerWorkPool=async()=>({ok:true,templates:[',
 '{id:"gen",title:"ثبت مشخصات منابع",unit:"library",kind:"general",state:"active",estimated_minutes:60},',
 '{id:"desk",title:"پاسخ‌گویی میز امانت",unit:"library",kind:"library_desk",state:"active",estimated_minutes:60}],',
 'opportunities:globalThis.__qaGeneralOffers||[]});',
 'export const getManagerDeskWorkPool=async()=>({ok:true,scope:"manager_desk_offers",offers:globalThis.__qaDeskOffers||[]});',
 ...['createWorkTemplate','createWorkOpportunity','setWorkOpportunityState',
    'createDeskWorkTemplate','createDeskWorkOffer','setDeskWorkOfferState'].map(name=>
   `export const ${name}=async()=>{globalThis.__qaWriteAttempts++;throw Error("NO_WRITES")};`),
].join('\n')
const fake={
 name:'swtb22-work-pool-fake-data',enforce:'pre',
 resolveId(source,importer){
  const from=(importer||'').split('?')[0].replaceAll('\\','/')
  if((from.endsWith('/src/components/WorkPoolManagerPanel.jsx')||
     from.endsWith('/src/components/DeskWorkPoolManagerSection.jsx'))&&
     source==='../lib/operationsV2')return '\0swtb22-fake-api'
 },
 load(id){if(id==='\0swtb22-fake-api')return api},
}
export default defineConfig({
 base:'/',plugins:[fake,react()],
 server:{host:'127.0.0.1',port:4179,strictPort:true},
 logLevel:'warn',
})
