import test from 'node:test'
import assert from 'node:assert/strict'
import {isTransientIdentityTransportError} from '../src/lib/opsAuthError.mjs'

test('only transport errors trigger signed-session retry path',()=>{
 const transient=[
  {name:'AuthRetryableFetchError',message:'request failed'},
  {name:'TypeError',message:'Failed to fetch'},
  {name:'TypeError',message:'NetworkError when attempting to fetch resource.'},
  {name:'Error',message:'net::ERR_CONNECTION_RESET'},
 ]
 for(const err of transient) assert.equal(isTransientIdentityTransportError(err),true)
 for(const err of [
  null,undefined,'failed to fetch',
  {name:'AuthSessionMissingError',message:'Auth session missing!'},
  {name:'AuthApiError',message:'Invalid JWT',status:401},
  {name:'AuthApiError',message:'User not authorized',status:403},
  {name:'Error',message:'Unknown account'},
 ])assert.equal(isTransientIdentityTransportError(err),false)
})
