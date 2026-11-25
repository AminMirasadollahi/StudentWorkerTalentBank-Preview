import { defineConfig, loadEnv } from 'vite'
import {resolveRecoveryReviewConfig} from './src/lib/recoveryReviewLifecycle.mjs'
import react from '@vitejs/plugin-react'

export default defineConfig(({mode})=>{
  const config=resolveRecoveryReviewConfig(loadEnv(mode,process.cwd(),'VITE_'))
  if(config.mode==='blocked')throw Error('SWTB22_REVIEW_CONFIG_BLOCKED')
  return {plugins:[react()],base:'/StudentWorkerTalentBank-Preview/'}
})
