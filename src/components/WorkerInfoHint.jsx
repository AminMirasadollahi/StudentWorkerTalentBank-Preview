/** On-demand explanatory text for noncritical worker UI details.
 * Native details keeps click/keyboard semantics. The native title is a
 * pointer-hover fallback; custom content appears only after explicit toggle.
 * Escape dismisses the open explanation without moving keyboard focus.
 */
export default function WorkerInfoHint({text,label='توضیح بیشتر'}){
 return <details className="ow-worker-info-hint"
  onKeyDown={event=>{
   if(event.key==='Escape'&&event.currentTarget.open){
    event.currentTarget.open=false
    event.stopPropagation()
   }
  }}>
  <summary aria-label={label} title={text}>
   <span aria-hidden="true">i</span>
  </summary>
  <span className="ow-worker-info-content">{text}</span>
 </details>
}
