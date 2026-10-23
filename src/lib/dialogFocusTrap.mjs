/**
 * Keep keyboard focus in a native modal even in Chromium builds where Tab
 * from its last control may transiently place document.activeElement on BODY.
 * Only called on the dialog's own keydown event; never intercepts other views.
 * showModal() remains responsible for the browser top layer and inert backdrop.
 */
export function trapModalTab(event) {
 if(event.key!=='Tab' || event.defaultPrevented) return
 const dialog=event.currentTarget
 if(!(dialog instanceof HTMLDialogElement) || !dialog.open) return
 const nodes=Array.from(dialog.querySelectorAll(
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),'+
  'textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'
 )).filter(node=>node.getClientRects().length>0 &&
   !node.closest('[inert]') && !node.getAttribute('aria-hidden'))
 if(nodes.length===0) {
  event.preventDefault()
  dialog.focus()
  return
 }
 const first=nodes[0],last=nodes[nodes.length-1]
 const current=dialog.ownerDocument.activeElement
 if(event.shiftKey && (current===first || current===dialog)) {
  event.preventDefault();last.focus()
 }else if(!event.shiftKey && (current===last || current===dialog)) {
  event.preventDefault();first.focus()
 }
}
