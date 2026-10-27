// Owner-triggered credential rotation. No password is printed or passed in argv.
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {randomBytes,randomUUID}=require('node:crypto');
const {spawnSync}=require('node:child_process');
const deps=path.join(__dirname,'candidate/node_modules');
const dotenv=require(path.join(deps,'dotenv'));
const mysql=require(path.join(deps,'mysql2/promise'));
const shared=path.join(os.homedir(),'mekteb-shared'),filename=path.join(shared,'backend.env');
const config=dotenv.parse(fs.readFileSync(filename));
const reportFile=path.join(__dirname,'credential-rotation-report.json');
const atomic=(file,text)=>{const temporary=file+'.rotate-'+randomUUID();fs.writeFileSync(temporary,text,{mode:0o600,flag:'wx'});fs.renameSync(temporary,file);fs.chmodSync(file,0o600);};
const settings=password=>({host:config.DB_HOST,user:config.DB_USER,password,database:config.DB_NAME,port:Number(config.DB_PORT)});
(async()=>{
 let db,locked=false,passwordChanged=false,nextPassword;const originals=new Map(),updated=[];
 const lock=path.join(shared,'credential-rotation.lock');
 try{
  if(config.DB_NAME!=='mektebpa_mekteb_db'||config.DB_USER!=='mektebpa_root')throw Object.assign(new Error(),{code:'UNEXPECTED_DATABASE_IDENTITY'});
  const mode=process.argv[2];if(!['plan','rotate'].includes(mode))throw Object.assign(new Error(),{code:'UNSUPPORTED_MODE'});
  db=await mysql.createConnection(settings(config.DB_PASS));
  const [identity]=await db.query('SELECT VERSION() AS version,CURRENT_USER() AS account');
  if(!/^10\.11\.\d+-MariaDB/i.test(identity[0].version)||!identity[0].account.startsWith(config.DB_USER+'@'))throw Object.assign(new Error(),{code:'UNEXPECTED_SERVER_ACCOUNT'});
  const files=[filename,path.join(os.homedir(),'api.mekteb-pazaric.com/.env'),path.join(__dirname,'rehearsal.env')].filter(file=>fs.existsSync(file));
  for(const file of files){fs.accessSync(file,fs.constants.W_OK);originals.set(file,fs.readFileSync(file,'utf8'));}
  if(mode==='plan'){console.log(JSON.stringify({ready:true,database:config.DB_NAME,identityVerified:true,privateConfigurationFiles:files.length,passwordChanged:false}));return;}
  fs.writeFileSync(lock,String(process.pid),{flag:'wx',mode:0o600});locked=true;
  const backup=path.join(shared,'backups','credential-rotation-'+Date.now());fs.mkdirSync(backup,{recursive:true,mode:0o700});
  files.forEach((file,index)=>fs.writeFileSync(path.join(backup,'config-'+index+'.env'),originals.get(file),{mode:0o600}));
  nextPassword=randomBytes(36).toString('base64url')+'Aa7!';
  await db.query('SET PASSWORD = PASSWORD(?)',[nextPassword]);passwordChanged=true;
  const probe=await mysql.createConnection(settings(nextPassword));await probe.query('SELECT 1');await probe.end();
  let oldAccepted=false;try{const old=await mysql.createConnection(settings(config.DB_PASS));await old.end();oldAccepted=true;}catch(error){if(error.code!=='ER_ACCESS_DENIED_ERROR')throw error;}
  if(oldAccepted)throw Object.assign(new Error(),{code:'OLD_CREDENTIAL_STILL_ACCEPTED'});
  for(const file of files){atomic(file,originals.get(file).trimEnd()+'\n# Database credential rotated; never commit this file.\nDB_PASS='+JSON.stringify(nextPassword)+'\n');updated.push(file);}
  const active=JSON.parse(fs.readFileSync(path.join(shared,'active-release.json'),'utf8'));
  if(!/^\d{8}T\d{9}Z-cpanel$/.test(active.id))throw Object.assign(new Error(),{code:'INVALID_ACTIVE_RELEASE'});
  const backend=path.join(os.homedir(),'mekteb-releases',active.id,'backend');
  const result=spawnSync(process.execPath,['dist/cli/preflight.js','--require-push'],{cwd:backend,env:{...process.env,...dotenv.parse(fs.readFileSync(filename)),MEKTEB_ENV_FILE:filename},encoding:'utf8',timeout:30000});
  if(result.status!==0)throw Object.assign(new Error(),{code:'NEW_CONFIGURATION_PREFLIGHT_FAILED'});
  const restart=path.join(os.homedir(),'api.mekteb-pazaric.com/tmp');fs.mkdirSync(restart,{recursive:true});fs.writeFileSync(path.join(restart,'restart.txt'),new Date().toISOString());
  const report={completedAt:new Date().toISOString(),success:true,oldCredentialRejected:true,newCredentialVerified:true,configurationUpdated:true,preflightPassed:true,restartRequested:true};
  fs.writeFileSync(reportFile,JSON.stringify(report,null,2),{mode:0o600});console.log(JSON.stringify(report));
 }catch(error){
  let rollbackSucceeded=true;
  if(passwordChanged){try{await db.query('SET PASSWORD = PASSWORD(?)',[config.DB_PASS]);for(const file of updated)atomic(file,originals.get(file));}catch{rollbackSucceeded=false;}}
  const report={completedAt:new Date().toISOString(),success:false,code:error.code||'ROTATION_FAILED',passwordChangeAttempted:passwordChanged,rollbackSucceeded};
  fs.writeFileSync(reportFile,JSON.stringify(report,null,2),{mode:0o600});console.error(JSON.stringify(report));process.exitCode=1;
 }finally{if(db)await db.end();if(locked)fs.unlinkSync(lock);}
})().catch(()=>{console.error('Credential operation failed; inspect the private report');process.exitCode=1;});
