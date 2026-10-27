// A backup/restore drill using only the guarded disposable QA fixture database.
const {spawnSync}=require('node:child_process');
const {randomUUID}=require('node:crypto');
const {writeFile}=require('node:fs/promises');
const path=require('node:path');
const assert=require('node:assert/strict');

(async()=>{
  const {createQaEnvironment,QA_PASSWORD}=await import('../tests/support/qaEnvironment.ts');
  const qa=await createQaEnvironment();
  const restored=`mekteb_restore_${randomUUID().replace(/-/g,'')}`;
  const bin='C:/Program Files/MySQL/MySQL Server 8.0/bin';
  const backup=path.join(process.env.MEKTEB_TEST_MYSQL_DIRECTORY,'qa-backup.sql');
  const common=['--no-defaults','--protocol=TCP','--host=127.0.0.1',`--port=${process.env.MEKTEB_TEST_MYSQL_PORT}`,'--user=root'];
  let created=false;
  try{
    const headers={Origin:'http://127.0.0.1:5177','X-CSRF-Protection':'1','Content-Type':'application/json'};
    const login=await fetch(qa.base+'/auth/login',{method:'POST',headers,body:JSON.stringify({username:'efendija_demo',password:QA_PASSWORD})});
    assert.equal(login.status,200);
    const cookie=login.headers.get('set-cookie').split(';')[0];
    const refresh=await fetch(qa.base+'/auth/refresh',{method:'POST',headers:{...headers,Cookie:cookie},body:'{}'});
    assert.equal(refresh.status,200);
    const dump=spawnSync(path.join(bin,'mysqldump.exe'),[...common,'--single-transaction','--set-gtid-purged=OFF',`--result-file=${backup}`,qa.database],{encoding:'utf8',windowsHide:true});
    assert.equal(dump.status,0,dump.stderr);
    await qa.admin.query(`CREATE DATABASE ${restored}`);created=true;
    const result=spawnSync(path.join(bin,'mysql.exe'),[...common,restored,'--execute',`source ${backup.replace(/\\/g,'/')}`],{encoding:'utf8',windowsHide:true});
    assert.equal(result.status,0,result.stderr);
    const [tables]=await qa.admin.query('SELECT TABLE_NAME AS name FROM information_schema.tables WHERE table_schema=? AND table_type="BASE TABLE" ORDER BY TABLE_NAME',[qa.database]);
    const checked=[];
    for(const {name} of tables){
      assert.match(name,/^[a-z_]+$/i);
      const [before]=await qa.admin.query(`SELECT * FROM ${qa.database}.${name} ORDER BY 1`);
      const [after]=await qa.admin.query(`SELECT * FROM ${restored}.${name} ORDER BY 1`);
      assert.deepEqual(after,before,`Restored rows differ: ${name}`);
      checked.push({table:name,rows:before.length,status:'identical'});
    }
    await writeFile(path.join(__dirname,'../../mekteb-e-dnevnik/docs/qa-backup-results.json'),JSON.stringify({date:'27.10.2026.',environment:'marked isolated MySQL; synthetic data only',method:'mysqldump single transaction; restore into separate empty database; compare every row',tables:checked,status:'passed'},null,2));
    console.log(`PASS: restored ${checked.length} tables and compared every row; production was not accessed.`);
  }finally{
    if(created)await qa.admin.query(`DROP DATABASE ${restored}`);
    await qa.stop();
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
