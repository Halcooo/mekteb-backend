// Explicit allowlists: configuration, node_modules, uploads, QA data and SSH keys
// are never copied. Install production dependencies on Linux, not on Windows.
const fs=require('node:fs');
const path=require('node:path');
const {createHash}=require('node:crypto');
const {execFileSync}=require('node:child_process');
const {verifyRelease}=require('./verify-release.cjs');
const backend=path.resolve(__dirname,'..'),frontend=path.resolve(backend,'../mekteb-e-dnevnik');
const api='https://api.mekteb-pazaric.com/backend/api';
function command(cmd,args,cwd,env=process.env){execFileSync(cmd,args,{cwd,env,stdio:'inherit',windowsHide:true});}
function npm(script,cwd,env){
  // npm_execpath is populated by npm run; an explicit CLI is needed on Windows.
  if(!process.env.npm_execpath)throw new Error('Run this command with npm run release:prepare');
  command(process.execPath,[process.env.npm_execpath,'run',script],cwd,env);
}
function copy(from,to){const stat=fs.lstatSync(from);if(stat.isSymbolicLink())throw new Error('Symlinks are not accepted in releases');if(stat.isDirectory()){fs.mkdirSync(to,{recursive:true});for(const name of fs.readdirSync(from))copy(path.join(from,name),path.join(to,name));}else{fs.mkdirSync(path.dirname(to),{recursive:true});fs.copyFileSync(from,to);}}
function walk(root,folder=root){return fs.readdirSync(folder,{withFileTypes:true}).flatMap(entry=>{const name=path.join(folder,entry.name);return entry.isDirectory()?walk(root,name):[{path:path.relative(root,name).replace(/\\/g,'/'),bytes:fs.statSync(name).size,sha256:createHash('sha256').update(fs.readFileSync(name)).digest('hex')}];});}
try{
  const buildEnv={...process.env,VITE_API_URL:api};
  npm('security:check',backend);
  command(process.execPath,[path.join(__dirname,'security-check.cjs'),'--repo',frontend],backend);
  npm('typecheck',backend);npm('test',backend);npm('build',backend);
  npm('test',frontend,buildEnv);npm('lint',frontend,buildEnv);npm('build',frontend,buildEnv);
  const id=new Date().toISOString().replace(/[-:.]/g,'').replace('Z','Z-cpanel');
  const output=path.join(backend,'release',id);fs.mkdirSync(output,{recursive:true});
  for(const name of ['dist','migrations','package.json','package-lock.json','app.js'])copy(path.join(backend,name),path.join(output,'backend',name));
  for(const name of ['runtime.env.example','verify-release.cjs','CPANEL_DEPLOY.md','DEPLOY_RUNBOOK.md','PHONE_TEST.md','check-https.cjs','run-push-cron.sh','cpanel-entry.cjs'])copy(path.join(__dirname,name),path.join(output,'backend/deploy',name));
  copy(path.join(backend,'scripts/push-keys.js'),path.join(output,'backend/scripts/push-keys.js'));
  copy(path.join(frontend,'dist'),path.join(output,'frontend'));
  for(const name of ['Uputstvo-za-efendiju.pdf','Kratko-uputstvo-za-roditelje.pdf'])copy(path.join(frontend,'output/pdf',name),path.join(output,'uputstva',name));
  const files=walk(output).sort((a,b)=>a.path.localeCompare(b.path));
  const forbidden=files.filter(file=>/(^|\/)(node_modules|uploads|tests|\.git|\.deploy-access)(\/|$)/.test(file.path)||(/(^|\/)\.env/.test(file.path))||/\.(key|pem|sql\.gz)$/.test(file.path));
  if(forbidden.length)throw new Error('Forbidden files found in release');
  fs.writeFileSync(path.join(output,'release-manifest.json'),JSON.stringify({format:1,id,createdAt:new Date().toISOString(),frontendOrigin:'https://mekteb-pazaric.com',api,tests:{backend:'passed',frontend:'passed',lint:'passed',builds:'passed'},files},null,2));
  verifyRelease(output);
  const archive=output+'.tar.gz';command('tar',['-czf',archive,'-C',output,'.'],backend);
  fs.writeFileSync(archive+'.sha256',createHash('sha256').update(fs.readFileSync(archive)).digest('hex')+'  '+path.basename(archive)+'\n');
  fs.writeFileSync(path.join(backend,'release','latest.json'),JSON.stringify({id,directory:output,archive,sha256:createHash('sha256').update(fs.readFileSync(archive)).digest('hex')},null,2));
  console.log(`Ready: ${archive}\nVerified ${files.length} files. No secrets or dependencies included.`);
}catch(error){console.error(error.message);process.exitCode=1;}
