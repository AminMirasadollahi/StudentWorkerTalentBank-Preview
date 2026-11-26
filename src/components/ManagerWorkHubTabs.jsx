import React from 'react'
import {isWorkHubView,workHubEnabled,r5IaEnabled,managerR5SubViews,currentManagerDestination} from '../lib/managerWorkspaceNav.mjs'

// Navigation controls only. No second workspace, mutation or hidden editor.
// Review fixture must not be enabled for live users until lifetime gates pass.
export default function ManagerWorkHubTabs({navigation,flags,onNavigate}){
 if(r5IaEnabled(flags)){
  const children=managerR5SubViews(navigation,flags)
  if(children.length<2)return null
  const parent=currentManagerDestination(navigation,flags)
  return <div className="ow-tabs" role="group" aria-label={'بخش‌های '+parent.label}>
   {children.map(item=>{
    const active=item.section===navigation.section&&item.view===(item.section==='work'?navigation.workView:navigation.candidateView)
    return <button key={item.id} type="button" className={'ow-tab'+(active?' is-selected':'')}
     aria-pressed={active} onClick={()=>{if(!active)onNavigate(item)}}>{item.id==='tasks'?'وظایف واگذارشده':item.id==='workPool'?'فرصت‌های قابل انتخاب':item.label}</button>
   })}
  </div>
 }
 if(!workHubEnabled(flags)||navigation?.section!=='work'||!isWorkHubView(navigation.workView))return null
 return <div className="ow-tabs" role="group" aria-label="بخش‌های مدیریت کارها">
  {[['tasks','وظایف واگذارشده'],['workPool','فرصت‌های قابل انتخاب']].map(([view,label])=>
   <button key={view} type="button" className={'ow-tab'+(navigation.workView===view?' is-selected':'')}
    aria-pressed={navigation.workView===view}
    onClick={()=>{if(navigation.workView!==view)onNavigate({section:'work',view})}}>{label}</button>)}
 </div>
}
