import test from 'node:test'
import assert from 'node:assert/strict'
import {parseTaskPrerequisites,prerequisiteDraft,confirmedPrerequisiteWrite} from '../src/lib/taskPrerequisiteEditor.mjs'
const raw={task_id:'a',editable:true,prerequisites:[{id:'b',title:'B',state:'cancelled',satisfied:false}]}
const state=parseTaskPrerequisites(raw,'a')
test('exact task read and duplicate denial',()=>{assert.deepEqual(state.ids,['b']);assert.throws(()=>parseTaskPrerequisites(raw,'other'));assert.throws(()=>parseTaskPrerequisites({...raw,prerequisites:[raw.prerequisites[0],raw.prerequisites[0]]},'a'))})
test('stale expected set retained and reason required for modifications',()=>{assert.equal(prerequisiteDraft(state,['b','c'],''),null);assert.equal(prerequisiteDraft(state,['b'],'unchanged'),null);assert.deepEqual(prerequisiteDraft(state,['c'],'new predecessor'),{expected:['b'],prerequisites:['c'],reason:'new predecessor'});assert.equal(prerequisiteDraft({...state,editable:false},['c'],'new predecessor'),null)})
test('initial selection and receipt exact set',()=>{assert.deepEqual(prerequisiteDraft({editable:true,ids:[]},['c','b'],''),{expected:[],prerequisites:['b','c'],reason:null});assert.equal(confirmedPrerequisiteWrite({ok:true,changed:true,prerequisite_ids:['c','b']},['b','c']),true);assert.equal(confirmedPrerequisiteWrite({ok:true,changed:true,prerequisite_ids:['c']},['b','c']),false)})
