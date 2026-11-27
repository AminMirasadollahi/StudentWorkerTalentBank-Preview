import {defineConfig} from 'vite'
import react from '@vitejs/plugin-react'
export default defineConfig({base:'/',plugins:[react(),{name:'deny-live-api',enforce:'pre',resolveId(source){if(/supabase|(^|\/)operations(V2)?(\.[cm]?js)?$/i.test(source))throw Error('LIVE_API_IMPORT_DENIED:'+source)}}],server:{host:'127.0.0.1',port:4181,strictPort:true},logLevel:'warn'})
