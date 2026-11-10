/* SWTB15 — pure client contract for proposed (NOT YET INSTALLED) PR37–40 RPCs.
 * Never calculate a replacement digest in the browser: the server's immutable
 * version UUID + digest are the only acceptable acceptance arguments.
 */
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const SHA256=/^[0-9a-f]{64}$/
const plain=x=>x!==null && typeof x==='object' && !Array.isArray(x)
const own=(obj,keys)=>Object.keys(obj).every(k=>keys.includes(k))
const nonempty=(s,max=12000)=>typeof s==='string' && s.trim().length>0 && s.length<=max
function invalid(detail){throw new Error('worker_agreement_invalid_server_document:'+detail)}
function text(value,label,required=true){
 if(!required && (value===undefined || value===null || value==='')) return ''
 if(!nonempty(value))invalid(label)
 return value
}
function paragraphs(arr,label){
 if(!Array.isArray(arr)||arr.length<1||arr.length>20||!arr.every(p=>nonempty(p,6000)))invalid(label)
 return arr
}
function officialDocument(doc,versionLabel){
 if(!plain(doc))invalid('document')
 const keys=['status','version','title','institution','studyNote','readingEstimate',
  'intro','sections','quotaExample','showTimeConcepts','acceptance','notice','approval']
 if(!own(doc,keys))invalid('unknown_root_content')
 if(doc.status!=='approved'||doc.version!==versionLabel)invalid('not_approved_matching_version')
 const title=text(doc.title,'title'),intro=text(doc.intro,'intro')
 const acceptance=text(doc.acceptance,'acceptance')
 // No browser-mediated legal acknowledgement without a cited human approval.
 if(!plain(doc.approval)||!own(doc.approval,['reference','authority','approved_on'])||
  !nonempty(doc.approval.reference,160)||!nonempty(doc.approval.authority,160)||
  !nonempty(doc.approval.approved_on,100)||
  Number.isNaN(Date.parse(doc.approval.approved_on)))invalid('approval_authority')
 if(!Array.isArray(doc.sections)||doc.sections.length!==7)invalid('seven_sections')
 const ids=new Set()
 const expectedIds=['learning','choice','presence','library-routine',
  'continuity','privacy','finance']
 const sections=doc.sections.map((s,index)=>{
  if(!plain(s)||!own(s,['id','title','paragraphs','icon','detailParagraphs']))invalid('section_fields_'+index)
  const id=text(s.id,'section_id',true),heading=text(s.title,'section_title')
  if(ids.has(id)||id!==expectedIds[index])invalid('missing_or_unexpected_section_order')
  ids.add(id)
  const body=paragraphs(s.paragraphs,'section_paragraphs_'+id)
  if(s.detailParagraphs!==undefined)paragraphs(s.detailParagraphs,'detail_paragraphs_'+id)
  if(s.icon!==undefined && !nonempty(s.icon,30))invalid('section_icon_'+id)
  return {...s,id,title:heading,paragraphs:body}
 })
 if(doc.quotaExample===undefined)invalid('missing_quota_example')
 if(doc.quotaExample!==undefined){
  const q=doc.quotaExample
  const qkeys=['quota','totalApproved','individualApproved','proportionalPercent',
    'payAllocation','preamble','note']
  if(!plain(q)||!own(q,qkeys))invalid('quota_schema')
  for(const k of ['quota','totalApproved','individualApproved','proportionalPercent','payAllocation']){
   if(typeof q[k]!=='number'||!Number.isFinite(q[k])||q[k]<0)invalid('quota_number_'+k)
  }
  if(q.totalApproved<=0||Math.abs(q.individualApproved/q.totalApproved*100-q.proportionalPercent)>0.001
   ||Math.abs(q.quota*q.proportionalPercent/100-q.payAllocation)>0.001)invalid('quota_example_math')
  text(q.preamble,'quota_preamble');text(q.note,'quota_note')
 }
 for(const k of ['institution','studyNote','notice']) if(doc[k]!==undefined)text(doc[k],k,false)
 if(doc.readingEstimate!==undefined &&
  !(nonempty(doc.readingEstimate,100) ||
    (typeof doc.readingEstimate==='number'&&Number.isFinite(doc.readingEstimate)&&doc.readingEstimate>=0)))
  invalid('reading_estimate')
 if(doc.showTimeConcepts!==undefined&&doc.showTimeConcepts!==false)
  invalid('unsupported_local_time_concepts')
 // Legacy RC7 draft text still calls itself unapproved. Never sign that
 // text under a new server version without the owner explicitly replacing it.
 if(/هنوز نامزد تصویب|هنوز فاقد ثبت پذیرش|تأیید معتبر آن فقط پس از تصویب/.test(
  [title,intro,doc.notice||'',acceptance].join(' ')))invalid('historical_draft_disclaimer')
 return {...doc,title,intro,acceptance,sections}
}
export function parseWorkerAgreementStatus(raw){
 if(!plain(raw))invalid('status_payload')
 if(raw.status==='unpublished'){
  if(raw.required!==false||raw.accepted!==false)invalid('unpublished_contradiction')
  return {kind:'unpublished',required:false,accepted:false}
 }
 if(raw.status!=='published')invalid('unknown_status')
 if(!UUID.test(raw.version_id)||!SHA256.test(raw.digest)||!nonempty(raw.version_label,32))
  invalid('identity_or_digest')
 if(typeof raw.required!=='boolean'||typeof raw.accepted!=='boolean')invalid('flags')
 const doc=officialDocument(raw.document,raw.version_label)
 if(raw.accepted && (!nonempty(raw.accepted_at,100)||Number.isNaN(Date.parse(raw.accepted_at))))
  invalid('accepted_at')
 if(!raw.accepted && raw.accepted_at!=null)invalid('unexpected_accepted_at')
 if(raw.published_at!=null && (typeof raw.published_at!=='string'||
  Number.isNaN(Date.parse(raw.published_at))))invalid('published_at')
 if(raw.upcoming!==null&&raw.upcoming!==undefined){
  if(!plain(raw.upcoming)||!UUID.test(raw.upcoming.version_id)||
   !nonempty(raw.upcoming.version_label,32)||!nonempty(raw.upcoming.effective_at,100)||
   Number.isNaN(Date.parse(raw.upcoming.effective_at)))invalid('upcoming')
 }
 return {kind:'published',versionId:raw.version_id,versionLabel:raw.version_label,
  digest:raw.digest,document:doc,required:raw.required,accepted:raw.accepted,
  acceptedAt:raw.accepted_at||null,publishedAt:raw.published_at||null,
  changeSummary:typeof raw.change_summary==='string'?raw.change_summary:'',
  upcoming:raw.upcoming||null}
}
export function acceptanceCoordinates(status){
 if(status?.kind!=='published'||status.accepted!==false)invalid('cannot_accept_status')
 return Object.freeze({versionId:status.versionId,digest:status.digest})
}
export function verifyWorkerAcceptanceReceipt(receipt,submitted){
 if(!plain(receipt)||receipt.ok!==true||receipt.version_id!==submitted.versionId||
  receipt.digest!==submitted.digest||!UUID.test(receipt.receipt_id)||
  !nonempty(receipt.accepted_at,100)||Number.isNaN(Date.parse(receipt.accepted_at)))
  invalid('receipt_not_authoritative')
 return Object.freeze({receiptId:receipt.receipt_id,acceptedAt:receipt.accepted_at})
}
export function isSameAgreement(a,b){
 return !!a&&!!b&&a.kind==='published'&&b.kind==='published'&&
  a.versionId===b.versionId&&a.digest===b.digest
}
