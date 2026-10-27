import './config/environment';
import pool from './db';
import {getPushConfig} from './config/webPush';
import {PushService} from './services/pushService';
import {runPushPass} from './services/pushRunner';

let stopped=false;
process.once('SIGTERM',()=>{stopped=true;});
process.once('SIGINT',()=>{stopped=true;});
async function main(){
  try{
    if(!getPushConfig())throw new Error('Web Push is not configured');
    const result=await runPushPass(()=>PushService.processBatch(),{stopped:()=>stopped});
    console.log(`[Push worker] completed batches=${result.batches} claimed=${result.claimed}`);
  }finally{await pool.end();}
}
main().catch(()=>{console.error('[Push worker] failed; queued jobs are retained for retry');process.exitCode=1;});
