import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import {fileURLToPath} from 'node:url';
const dir=fileURLToPath(new URL('./',import.meta.url));
let protectedSourceTransformed=false;
// QA build only: disable localStorage refresh-session persistence while
// retaining the exact React UI, protected repo file and manager RPC contracts.
function qaVolatileAuth(){
 return {
  name:'swtb17-qa-volatile-auth',enforce:'pre',
  transform(src,id){
   if(!id.replaceAll('\\','/').endsWith('/src/lib/operations.js'))return null;
   const before=['persistSession: true','autoRefreshToken: true','detectSessionInUrl: true'];
   for(const token of before)
    if(src.split(token).length!==2)throw Error('QA_AUTH_SOURCE_CONTRACT_DRIFT_'+token);
   protectedSourceTransformed=true;
   return src.replace('persistSession: true','persistSession: false')
     .replace('autoRefreshToken: true','autoRefreshToken: false')
     .replace('detectSessionInUrl: true','detectSessionInUrl: false');
  },
  generateBundle(){
   if(!protectedSourceTransformed)throw Error('QA_AUTH_TRANSFORM_NOT_APPLIED');
  },
 };
}
export default defineConfig({
 root:dir,
 base:'./',
 plugins:[qaVolatileAuth(),react()],
 build:{outDir:fileURLToPath(new URL('./dist/',import.meta.url)),
   emptyOutDir:true,sourcemap:false,manifest:true},
});
