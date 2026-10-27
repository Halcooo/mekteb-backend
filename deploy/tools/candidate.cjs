// Execute reviewed compiled commands only, through authenticated cPanel.
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {randomBytes}=require('node:crypto');
const {spawnSync}=require('node:child_process');
const candidate=path.join(__dirname,'candidate');
const target='mektebpa_rehearsal_20261027';
const live=path.join(os.homedir(),'api.mekteb-pazaric.com');
const dotenv=require(path.join(candidate,'node_modules/dotenv'));
const configFile=path.join(__dirname,'rehearsal.env');
function rehearsalConfig(){
 const restore=JSON.parse(fs.readFileSync(path.join(__dirname,'restore-report.json'),'utf8'));
 if(restore.database!==target||restore.restoreVerified!==true)throw new Error('A verified clone restore is required');
 if(!fs.existsSync(configFile)){
  const sourceFile=fs.readFileSync(path.join(live,'.env'),'utf8');
  const source=dotenv.parse(sourceFile);
  if(source.DB_NAME!=='mektebpa_mekteb_db')throw new Error('Unexpected production source');
  const settings={NODE_ENV:'production',DB_PORT:source.DB_PORT||'3306',DB_NAME:target,JWT_SECRET:randomBytes(48).toString('hex'),JWT_REFRESH_SECRET:randomBytes(48).toString('hex'),JWT_EXPIRE:'15m',JWT_REFRESH_EXPIRE:'30d',FRONTEND_URL:'https://mekteb-pazaric.com',UPLOAD_DIRECTORY:path.join(__dirname,'rehearsal-uploads'),PUSH_WORKER_MODE:'external',TRUST_PROXY_HOPS:'0',WEB_PUSH_PUBLIC_KEY:'',WEB_PUSH_PRIVATE_KEY:'',WEB_PUSH_SUBJECT:''};
  // Preserve the original dotenv quoting of existing DB credentials exactly.
  fs.writeFileSync(configFile,sourceFile+'\n'+Object.entries(settings).map(([key,value])=>key+'='+JSON.stringify(value)).join('\n'),{mode:0o600,flag:'wx'});
 }
 const config=dotenv.parse(fs.readFileSync(configFile));
 if(config.DB_NAME!==target||config.WEB_PUSH_PUBLIC_KEY||config.WEB_PUSH_PRIVATE_KEY||config.PUSH_WORKER_MODE!=='external')throw new Error('Unsafe rehearsal configuration');
 return {...process.env,...config,MEKTEB_ENV_FILE:configFile};
}
function run(args,env,cwd=candidate,operation=process.argv[2]){
 const result=spawnSync(process.execPath,args,{cwd,env,encoding:'utf8',timeout:180000,maxBuffer:2*1024*1024});
 fs.writeFileSync(path.join(__dirname,'rehearsal-'+operation+'-result.json'),JSON.stringify({checkedAt:new Date().toISOString(),operation,node:process.version,status:result.status,stdout:result.stdout,stderr:result.stderr},null,2),{mode:0o600});
 if(result.stdout)process.stdout.write(result.stdout);
 if(result.stderr)process.stderr.write(result.stderr);
 if(result.error||result.status!==0)throw new Error('Candidate command failed; exit='+(result.status??'timeout'));
}
try{
 const command=process.argv[2];
 if(command==='install'){
  if(!process.env.npm_execpath)throw new Error('Use the cPanel npm script interface');
  if(!fs.existsSync(path.join(candidate,'package-lock.json')))throw new Error('Upload the reviewed candidate first');
  run([process.env.npm_execpath,'ci','--omit=dev','--no-audit','--no-fund'],process.env);
 }else{
  const env=rehearsalConfig();
  if(command==='verify'){
   run(['dist/cli/preflight.js'],env,candidate,'verify-preflight');
   run([path.join(__dirname,'smoke.cjs')],env,candidate,'verify-smoke');
  }else{
  const commands={plan:['dist/cli/migrate.js','legacy-plan'],upgrade:['dist/cli/migrate.js','upgrade-legacy','--confirm-backup-restored','--confirm-writes-paused'],migrate:['dist/cli/migrate.js','up'],check:['dist/cli/preflight.js'],smoke:[path.join(__dirname,'smoke.cjs')]};
  if(!commands[command])throw new Error('Unknown candidate operation');
  run(commands[command],env);
  }
 }
}catch(error){console.error(error.code?'Candidate failed ('+error.code+')':error.message);process.exitCode=1;}
