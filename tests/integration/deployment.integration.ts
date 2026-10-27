// Production entry points against the marked disposable database, never hosting.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import {createQaEnvironment,QA_PASSWORD} from '../support/qaEnvironment';

test('compiled cPanel app, migration CLI, preflight and cron load only the explicit private production configuration',async t=>{
 const qa=await createQaEnvironment();
 const username='qa_runtime_'+randomBytes(6).toString('hex'),password=randomBytes(32).toString('hex');
 let child:ReturnType<typeof spawn>|undefined;
 t.after(async()=>{if(child&&child.exitCode===null){const closed=new Promise(resolve=>child!.once('exit',resolve));child.kill();await closed;}await qa.admin.query('DROP USER IF EXISTS ?@?', [username,'127.0.0.1']);await qa.stop();});
 await qa.admin.query('CREATE USER ?@? IDENTIFIED BY ?', [username,'127.0.0.1',password]);
 await qa.admin.query(`GRANT ALL ON \`${qa.database}\`.* TO ?@?`,[username,'127.0.0.1']);
 const directory=process.env.MEKTEB_TEST_MYSQL_DIRECTORY!;
 const filename=path.join(directory,'production-fixture.env');
 const values={NODE_ENV:'production',DB_HOST:'127.0.0.1',DB_PORT:process.env.DB_PORT,DB_USER:username,DB_PASS:password,DB_NAME:qa.database,JWT_SECRET:process.env.JWT_SECRET,JWT_REFRESH_SECRET:process.env.JWT_REFRESH_SECRET,JWT_EXPIRE:'15m',JWT_REFRESH_EXPIRE:'30d',FRONTEND_URL:'https://mekteb-pazaric.com',UPLOAD_DIRECTORY:path.join(directory,'runtime-uploads'),PUSH_WORKER_MODE:'external',WEB_PUSH_PUBLIC_KEY:process.env.WEB_PUSH_PUBLIC_KEY,WEB_PUSH_PRIVATE_KEY:process.env.WEB_PUSH_PRIVATE_KEY,WEB_PUSH_SUBJECT:process.env.WEB_PUSH_SUBJECT};
 await fs.writeFile(filename,Object.entries(values).map(([key,value])=>`${key}=${value}`).join('\n'),{mode:0o600});
 const env={...process.env};for(const key of Object.keys(values))delete env[key];
 env.NODE_ENV='production';env.MEKTEB_ENV_FILE=filename;
 // A stale default .env must not be consulted, nor may tsx be required at runtime.
 const run=promisify(execFile);
 const status=await run(process.execPath,['dist/cli/migrate.js','status'],{env,windowsHide:true});assert.deepEqual(JSON.parse(status.stdout).pending,[]);
 const preflight=await run(process.execPath,['dist/cli/preflight.js','--require-push'],{env,windowsHide:true});assert.match(preflight.stdout,/database ready/);
 const worker=await run(process.execPath,['dist/push-worker.js'],{env,windowsHide:true});assert.match(worker.stdout,/claimed=0/);
 assert.ok(![status.stdout,preflight.stdout,worker.stdout].join('').includes(password));
 const reserve=net.createServer();await new Promise<void>(resolve=>reserve.listen(0,'127.0.0.1',resolve));const port=(reserve.address() as net.AddressInfo).port;await new Promise<void>(resolve=>reserve.close(()=>resolve()));
 child=spawn(process.execPath,['app.js'],{env:{...env,PORT:String(port)},windowsHide:true,stdio:['ignore','pipe','pipe']});
 const started=new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Runtime startup timed out')),15_000);child!.stdout!.on('data',bytes=>{if(bytes.toString().includes('Backend listening')){clearTimeout(timer);resolve();}});child!.once('exit',()=>{clearTimeout(timer);reject(new Error('Runtime exited before startup'));});});
 await started;
 const base=`http://127.0.0.1:${port}/backend/api`;
 assert.equal((await (await fetch(base+'/health')).json() as {status:string}).status,'healthy');
 const login=await fetch(base+'/auth/login',{method:'POST',headers:{Origin:'https://mekteb-pazaric.com','Content-Type':'application/json','X-CSRF-Protection':'1'},body:JSON.stringify({username:'efendija_demo',password:QA_PASSWORD})});
 assert.equal(login.status,200);const cookie=login.headers.get('set-cookie')!;
 for(const attribute of ['__Secure-mekteb_refresh=','HttpOnly','Secure','SameSite=Lax','Path=/backend/api/auth'])assert.ok(cookie.includes(attribute));
 const [queue]=await qa.pool.query('SELECT COUNT(*) AS total FROM push_deliveries');assert.equal((queue as {total:number}[])[0].total,0,'no provider traffic is created by runtime checks');
 console.log('PASS: production env outside release, compiled CLI without tsx, writable shared uploads, external cron and secure cookie contract');
});
