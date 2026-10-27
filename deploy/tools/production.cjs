// Account-specific deploy operations. Select only through authenticated cPanel.
// Existing backend code/config remains in place for rollback; new runtime is versioned.
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const https=require('node:https');
const {createHash}=require('node:crypto');
const {spawnSync,execFileSync}=require('node:child_process');
const accountHome=os.homedir(),live=path.join(accountHome,'api.mekteb-pazaric.com'),shared=path.join(accountHome,'mekteb-shared');
const dotenv=require(path.join(__dirname,'candidate/node_modules/dotenv'));
const incoming=JSON.parse(fs.readFileSync(path.join(__dirname,'incoming-release.json'),'utf8'));
if(!/^\d{8}T\d{9}Z-cpanel$/.test(incoming.id))throw new Error('Invalid release id');
const release=path.join(accountHome,'mekteb-releases',incoming.id),backend=path.join(release,'backend');
const hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const save=(name,data)=>fs.writeFileSync(path.join(__dirname,name+'.json'),JSON.stringify(data,null,2),{mode:0o600});
function env(){const settings=dotenv.parse(fs.readFileSync(path.join(shared,'backend.env')));if(settings.DB_NAME!=='mektebpa_mekteb_db'||settings.PUSH_WORKER_MODE!=='external')throw new Error('Production configuration identity mismatch');return {...process.env,...settings,MEKTEB_ENV_FILE:path.join(shared,'backend.env')};}
function cli(args,label){const result=spawnSync(process.execPath,args,{cwd:backend,env:env(),encoding:'utf8',timeout:120000,maxBuffer:2*1024*1024});save('production-'+label+'-result',{checkedAt:new Date().toISOString(),status:result.status,stdout:result.stdout,stderr:result.stderr});if(result.stdout)process.stdout.write(result.stdout);if(result.stderr)process.stderr.write(result.stderr);if(result.error||result.status!==0)throw new Error('Production '+label+' failed');}
function verifyRelease(){require(path.join(backend,'deploy/verify-release.cjs')).verifyRelease(release);}
async function compareBackup(){
 const config=env();const mysql=require(path.join(backend,'node_modules/mysql2/promise'));
 const pool=mysql.createPool({host:config.DB_HOST,user:config.DB_USER,password:config.DB_PASS,database:config.DB_NAME,port:Number(config.DB_PORT),dateStrings:['DATE'],connectionLimit:1});
 const {legacyDataFingerprint,planLegacyUpgrade}=require(path.join(backend,'dist/utils/legacyUpgrade'));
 try{
  const connection=await pool.getConnection();try{
   const [identity]=await connection.query('SELECT DATABASE() AS name');if(identity[0].name!=='mektebpa_mekteb_db')throw new Error('Wrong source');
   await connection.beginTransaction();const actual=await legacyDataFingerprint(connection);await connection.rollback();
   const expected=JSON.parse(JSON.parse(fs.readFileSync(path.join(__dirname,'rehearsal-upgrade-result.json'),'utf8')).stdout).fingerprint;
   if(JSON.stringify(actual)!==JSON.stringify(expected))throw new Error('Production changed since the restored backup; take and rehearse a fresh backup');
   const plan=await planLegacyUpgrade(connection);save('production-backup-comparison',{checkedAt:new Date().toISOString(),recordsMatchRestoredBackup:true,plannedStatements:plan.length,fingerprint:actual});
   console.log('Production records match the restored backup; reviewed legacy plan has '+plan.length+' statements');
  }finally{connection.release();}
 }finally{await pool.end();}
}
function copyImages(){
 const source=path.join(live,'uploads/news-images'),target=path.join(shared,'news-images');let count=0;
 for(const item of fs.readdirSync(source,{withFileTypes:true})){
  if(!item.isFile())throw new Error('Review non-file image entry before copying');
  const from=path.join(source,item.name),to=path.join(target,item.name);
  if(fs.existsSync(to)){if(hash(to)!==hash(from))throw new Error('Shared image collision; stop');}else fs.copyFileSync(from,to,fs.constants.COPYFILE_EXCL);
  if(hash(to)!==hash(from))throw new Error('Shared image hash mismatch');count++;
 }
 return count;
}
function httpsStatus(){return new Promise((resolve,reject)=>{const request=https.get('https://api.mekteb-pazaric.com/backend/api/health',response=>{response.resume();resolve(response.statusCode);});request.setTimeout(15000,()=>request.destroy(new Error('Health timeout')));request.on('error',reject);});}
async function stage(){
 const archive=path.join(__dirname,'incoming-release.tar.gz');if(hash(archive)!==incoming.sha256)throw new Error('Archive checksum mismatch');
 fs.mkdirSync(path.dirname(release),{recursive:true,mode:0o700});
 if(!fs.existsSync(release)){fs.mkdirSync(release,{mode:0o700});execFileSync('tar',['-xzf',archive,'-C',release]);}
 verifyRelease();
 const installed=spawnSync(process.execPath,[process.env.npm_execpath,'ci','--omit=dev','--no-audit','--no-fund'],{cwd:backend,env:process.env,encoding:'utf8',timeout:180000});
 if(installed.status!==0)throw new Error('Release dependency installation failed');console.log('Versioned release dependencies installed');
 for(const name of ['', 'news-images','logs','backups'])fs.mkdirSync(path.join(shared,name),{recursive:true,mode:0o700});
 const configFile=path.join(shared,'backend.env');
 if(!fs.existsSync(configFile)){
  const sourceText=fs.readFileSync(path.join(live,'.env'),'utf8'),source=dotenv.parse(sourceText);
  if(source.DB_NAME!=='mektebpa_mekteb_db')throw new Error('Unexpected source DB');
  const template=fs.readFileSync(path.join(__dirname,'production-template.env'),'utf8').split(/\r?\n/).filter(line=>!/^\s*(?:DB_HOST|DB_USER|DB_PASS|DB_NAME|DB_PORT|UPLOAD_DIRECTORY|PUSH_WORKER_MODE)\s*=/.test(line)).join('\n');
  fs.writeFileSync(configFile,sourceText+'\n'+template+'\nDB_PORT='+JSON.stringify(source.DB_PORT||'3306')+'\nUPLOAD_DIRECTORY='+JSON.stringify(path.join(shared,'news-images'))+'\nPUSH_WORKER_MODE=external\n',{flag:'wx',mode:0o600});
 }
 const images=copyImages();
 const snapshot=path.join(shared,'backups','pre-'+incoming.id);fs.mkdirSync(snapshot,{recursive:true,mode:0o700});
 for(const [from,to]of [[path.join(live,'.env'),'backend.env'],[path.join(live,'package.json'),'backend-package.json'],[path.join(live,'index.js'),'backend-index.js'],[path.join(accountHome,'public_html/api.mekteb-pazaric.com/.htaccess'),'api.htaccess'],[path.join(accountHome,'public_html/.htaccess'),'frontend.htaccess'],[path.join(accountHome,'public_html/index.html'),'frontend-index.html']])if(!fs.existsSync(path.join(snapshot,to)))fs.copyFileSync(from,path.join(snapshot,to));
 const oldModules=path.join(snapshot,'node_modules-22');if(!fs.existsSync(oldModules))fs.cpSync(fs.realpathSync(path.join(live,'node_modules')),oldModules,{recursive:true,dereference:true});
 cli(['dist/cli/preflight.js','--config-only','--require-push'],'config');await compareBackup();
 const report={preparedAt:new Date().toISOString(),id:incoming.id,sha256:incoming.sha256,release,images,node:process.version,nodeExecutable:process.execPath,flock:fs.existsSync('/usr/bin/flock'),active:false};save('production-stage-report',report);console.log(JSON.stringify(report));
}
async function migrate(){
 if(process.argv[3]!=='--confirm-api-stopped')throw new Error('Explicit API write pause required');
 const status=await httpsStatus();if(![404,503].includes(status))throw new Error('API is not demonstrably stopped; no production DDL run');
 verifyRelease();await compareBackup();copyImages();
 cli(['dist/cli/migrate.js','upgrade-legacy','--confirm-backup-restored','--confirm-writes-paused'],'legacy');
 cli(['dist/cli/migrate.js','up'],'migrations');cli(['dist/cli/preflight.js','--require-push'],'preflight');
 save('production-migration-complete',{completedAt:new Date().toISOString(),id:incoming.id,verified:true});
}
function redirect(domain){return '<IfModule mod_rewrite.c>\nRewriteEngine On\nRewriteCond %{REQUEST_URI} !^/\\.well-known/acme-challenge/\nRewriteCond %{HTTPS} !=on\nRewriteRule ^ https://'+domain+'%{REQUEST_URI} [R=302,L,NE]\n</IfModule>\n';}
function activate(){
 const migration=JSON.parse(fs.readFileSync(path.join(__dirname,'production-migration-complete.json'),'utf8'));if(migration.id!==incoming.id||!migration.verified)throw new Error('Verified production migration required');
 verifyRelease();
 const entry=path.join(live,'app-current.cjs');fs.copyFileSync(path.join(backend,'deploy/cpanel-entry.cjs'),entry);fs.chmodSync(entry,0o600);
 const pointer=path.join(shared,'active-release.json'),temporary=pointer+'.tmp';fs.writeFileSync(temporary,JSON.stringify({id:incoming.id}),{mode:0o600});fs.renameSync(temporary,pointer);
 const frontend=path.join(release,'frontend'),publicRoot=path.join(accountHome,'public_html');
 for(const item of fs.readdirSync(frontend)){if(item==='.htaccess')continue;fs.cpSync(path.join(frontend,item),path.join(publicRoot,item),{recursive:true});}
 fs.writeFileSync(path.join(publicRoot,'.htaccess'),redirect('mekteb-pazaric.com')+fs.readFileSync(path.join(frontend,'.htaccess'),'utf8'));
 const apiAccess=path.join(publicRoot,'api.mekteb-pazaric.com/.htaccess'),existing=fs.readFileSync(apiAccess,'utf8');if(!existing.includes('RewriteRule ^ https://api.mekteb-pazaric.com'))fs.writeFileSync(apiAccess,redirect('api.mekteb-pazaric.com')+existing);
 save('production-files-active',{activatedAt:new Date().toISOString(),id:incoming.id,previousCodePreserved:true});console.log('Release pointer and matching frontend active; select app-current.cjs in the existing Node application and start it');
}
(async()=>{const command=process.argv[2];if(command==='stage')await stage();else if(command==='compare')await compareBackup();else if(command==='migrate')await migrate();else if(command==='activate')activate();else if(command==='worker')cli([path.join(live,'app-current.cjs'),'worker'],'worker');else throw new Error('Unknown deploy operation');})().catch(error=>{console.error(error.code?'Deploy operation failed ('+error.code+')':error.message);process.exitCode=1;});
