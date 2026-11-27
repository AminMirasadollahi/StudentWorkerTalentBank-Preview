import {defineConfig} from 'vite'
import react from '@vitejs/plugin-react'
export default defineConfig({base:'/',optimizeDeps:{entries:['tests/browser/swtb25-window-editor-review.html']},plugins:[react(),{name:'deny-live-api',enforce:'pre',resolveId(source){if(/supabase|(^|\/)operations(V2)?(\.[cm]?js)?$/i.test(source))throw Error('LIVE_API_IMPORT_DENIED:'+source)}}],server:{host:'127.0.0.1',port:4183,strictPort:true},logLevel:'warn'})
