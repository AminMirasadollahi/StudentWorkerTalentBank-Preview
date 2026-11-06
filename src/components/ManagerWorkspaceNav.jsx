import {useState} from 'react'
import {currentManagerDestination,visibleManagerGroups} from '../lib/managerWorkspaceNav.mjs'

// The whole manager navigation is one landmark. Buttons only select an
// already-authorized view; authorization remains inside OpsApp and the RPCs.
export default function ManagerWorkspaceNav({
 navigation,onNavigate,workPoolEnabled=true,termMembershipEnabled=true,
}){
 const [collapsed,setCollapsed]=useState(false)
 const flags={workPoolEnabled,termMembershipEnabled}
 const groups=visibleManagerGroups(flags)
 const current=currentManagerDestination(navigation,flags)
 return <aside className={'swtb22-manager-sidebar'+(collapsed?' is-collapsed':'')}
   aria-label="راهبری فضای مدیریت">
  <div className="swtb22-manager-brand">
   <div><strong>مدیریت دانشجوکارها</strong>
    <small>دانشکده علوم انسانی شهید رجایی بابل</small></div>
   <button type="button" className="swtb22-manager-collapse"
    aria-label={collapsed?'گسترش فهرست مدیریت':'جمع‌کردن فهرست مدیریت'}
    aria-expanded={!collapsed} aria-controls="swtb22-manager-route-list" onClick={()=>setCollapsed(v=>!v)}>
    {collapsed?'◀':'☰'}
   </button>
  </div>
  <nav id="swtb22-manager-route-list" aria-label="بخش‌های فضای مدیریت" className="swtb22-manager-nav">
   {groups.map(group=><div className="swtb22-manager-nav-group" key={group.id}>
    <h2 id={'swtb22-group-'+group.id}>{group.title}</h2>
    {group.items.map(item=><button type="button" key={item.id}
      className="swtb22-manager-nav-item"
      data-swtb22-route={item.id} title={item.label}
      aria-current={item.id===current?.id?'page':undefined}
      onClick={()=>onNavigate(item)}>
      <span className="swtb22-manager-nav-mark" aria-hidden="true"/>
      <span className="swtb22-manager-nav-label">{item.label}</span>
    </button>)}
   </div>)}
  </nav>
  <div className="swtb22-manager-sidebar-foot">
   <span>فضای مدیریت</span>
   <small>محتوای این بخش بر اساس مجوز حساب نمایش داده می‌شود.</small>
  </div>
 </aside>
}
