// Anonymous post-deploy checks only. Never accepts passwords or access tokens.
const assert=require('node:assert/strict');
const WebSocket=require('ws');
const fs=require('node:fs');
const frontend='https://mekteb-pazaric.com',api='https://api.mekteb-pazaric.com/backend/api';
const results=[];
async function check(name,fn){try{await fn();results.push({name,status:'passed'});console.log(`PASS ${name}`);}catch(error){results.push({name,status:'failed',detail:error.message});console.error(`FAIL ${name}: ${error.message}`);}}
async function get(url,options={}){const r=await fetch(url,{...options,redirect:'manual',signal:AbortSignal.timeout(15_000)});assert.ok(![301,302,303,307,308].includes(r.status),'Unexpected redirect; check the canonical URL and proxy');return r;}
async function main(){
  for(const option of process.argv.slice(2))if(option!=='--allow-polling')throw new Error('Option: --allow-polling');
  await check('HTTPS frontend and deep link',async()=>{for(const route of ['/','/messages']){const r=await get(frontend+route);assert.equal(r.status,200);assert.match(r.headers.get('content-type')??'',/text\/html/);assert.match(await r.text(),/id="root"/);}});
  await check('Service worker JavaScript and fresh-cache policy',async()=>{const r=await get(frontend+'/sw.js');assert.equal(r.status,200);assert.match(r.headers.get('content-type')??'',/(javascript|ecmascript)/);assert.match(r.headers.get('cache-control')??'',/no-cache|no-store|max-age=0/);assert.match(await r.text(),/push/);});
  await check('Manifest and install icons',async()=>{const r=await get(frontend+'/manifest.webmanifest');assert.equal(r.status,200);const data=await r.json();assert.equal(data.scope,'/');assert.equal(data.display,'standalone');for(const icon of data.icons){const url=new URL(icon.src,frontend);assert.equal(url.origin,frontend);const image=await get(url);assert.equal(image.status,200);assert.match(image.headers.get('content-type')??'',/^image\//);}});
  await check('Database health',async()=>{const r=await get(api+'/health');assert.equal(r.status,200);assert.equal((await r.json()).status,'healthy');});
  await check('Credentialed CORS preflight',async()=>{const r=await get(api+'/auth/refresh',{method:'OPTIONS',headers:{Origin:frontend,'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'content-type,x-csrf-protection'}});assert.equal(r.status,204);assert.equal(r.headers.get('access-control-allow-origin'),frontend);assert.equal(r.headers.get('access-control-allow-credentials'),'true');assert.match(r.headers.get('access-control-allow-headers')??'',/x-csrf-protection/i);});
  await check('CSRF rejects an untrusted origin',async()=>{const r=await get(api+'/auth/refresh',{method:'POST',headers:{Origin:'https://untrusted.invalid','X-CSRF-Protection':'1','Content-Type':'application/json'},body:'{}'});assert.equal(r.status,403);});
  await check('Private routes reject anonymous requests',async()=>{for(const route of ['/students','/notifications','/push/config'])assert.equal((await get(api+route,{headers:{Origin:frontend}})).status,401);});
  await check('WebSocket upgrade and authentication gate',()=>new Promise((resolve,reject)=>{
    const socket=new WebSocket('wss://api.mekteb-pazaric.com/backend/ws/notifications',{origin:frontend});
    const timer=setTimeout(()=>{socket.terminate();reject(new Error('WebSocket test timed out'));},10_000);
    socket.once('open',()=>socket.send(JSON.stringify({type:'authenticate'})));
    socket.once('close',code=>{clearTimeout(timer);try{assert.equal(code,1008);resolve();}catch(error){reject(error);}});
    socket.once('error',error=>{clearTimeout(timer);reject(new Error(error.message));});
  }));
  const failures=results.filter(result=>result.status==='failed'&&!(process.argv.includes('--allow-polling')&&result.name.startsWith('WebSocket')));
  fs.writeFileSync('https-check-results.json',JSON.stringify({checkedAt:new Date().toISOString(),frontend,api,results,note:'Real device delivery and authenticated browser cookie/session checks are separate.'},null,2));
  if(failures.length)process.exitCode=1;
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
