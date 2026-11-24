import React from 'react'
import {isWorkHubView,workHubEnabled} from '../lib/managerWorkspaceNav.mjs'

// Navigation controls only. No second workspace, mutation or hidden editor.
// Review fixture must not be enabled for live users until lifetime gates pass.
export default function ManagerWorkHubTabs({navigation,flags,onNavigate}){
 if(!workHubEnabled(flags)||navigation?.section!=='work'||!isWorkHubView(navigation.workView))return null
 return <div className="ow-tabs" role="group" aria-label="بخش‌های مدیریت کارها">
  {[['tasks','وظایف واگذارشده'],['workPool','فرصت‌های قابل انتخاب']].map(([view,label])=>
   <button key={view} type="button" className={'ow-tab'+(navigation.workView===view?' is-selected':'')}
    aria-pressed={navigation.workView===view}
    onClick={()=>{if(navigation.workView!==view)onNavigate({section:'work',view})}}>{label}</button>)}
 </div>
}
