import {test} from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {assertProductionEnvironment,assertSupportedDatabaseVersion} from '../src/config/deployment';
import {runPushPass} from '../src/services/pushRunner';
import {startPushWorker} from '../src/services/pushService';

const production=()=>({NODE_ENV:'production',DB_HOST:'localhost',DB_PORT:'3306',DB_USER:'fixture',DB_PASS:'private-fixture',DB_NAME:'fixture',JWT_SECRET:'fixture-key',JWT_REFRESH_SECRET:'fixture-pepper',FRONTEND_URL:'https://mekteb-pazaric.com',UPLOAD_DIRECTORY:path.resolve('temporary-upload-fixture'),PUSH_WORKER_MODE:'external'});
test('database preflight accepts reviewed MySQL/MariaDB versions and refuses other families',()=>{
 for(const version of ['8.0.43','8.4.0','10.11.10-MariaDB','10.11.11-MariaDB-log'])assert.doesNotThrow(()=>assertSupportedDatabaseVersion(version));
 for(const version of ['5.7.44','10.5.0-MariaDB','8.0.1-MariaDB','11.0.0-MariaDB','unknown'])assert.throws(()=>assertSupportedDatabaseVersion(version));
});
test('production preflight rejects missing settings, bad paths and worker modes without revealing secrets',()=>{
 assert.doesNotThrow(()=>assertProductionEnvironment(production()));
 for(const change of [{DB_PASS:''},{UPLOAD_DIRECTORY:'relative/uploads'},{DB_PORT:'3306x'},{DB_PORT:'65536'},{PUSH_WORKER_MODE:'wrong'},{TRUST_PROXY_HOPS:'true'}])assert.throws(()=>assertProductionEnvironment({...production(),...change}));
 try{assertProductionEnvironment({...production(),DB_NAME:''});assert.fail();}catch(error){assert.ok(!String(error).includes('private-fixture'));}
});
test('cron pass drains existing work and stops at an empty batch',async()=>{
 const counts=[10,3,0];let calls=0;
 assert.deepEqual(await runPushPass(async()=>{calls++;return counts.shift()!;}),{batches:3,claimed:13});assert.equal(calls,3);
});
test('cron pass bounds runtime, max batches, signal shutdown and propagates failures for retry',async()=>{
 let time=0;const batch=async()=>{time+=10;return 10;};
 assert.deepEqual(await runPushPass(batch,{now:()=>time,budgetMs:15}),{batches:2,claimed:20});
 assert.deepEqual(await runPushPass(async()=>10,{maxBatches:2}),{batches:2,claimed:20});
 assert.deepEqual(await runPushPass(async()=>10,{stopped:()=>true}),{batches:0,claimed:0});
 await assert.rejects(runPushPass(async()=>{throw new Error('database down');}));
});
test('external worker mode never starts a request-process timer',async()=>{
 const previous=process.env.PUSH_WORKER_MODE;process.env.PUSH_WORKER_MODE='external';
 try{await startPushWorker()();}finally{if(previous===undefined)delete process.env.PUSH_WORKER_MODE;else process.env.PUSH_WORKER_MODE=previous;}
});
