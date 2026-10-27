import '../config/environment';
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import type {RowDataPacket} from 'mysql2/promise';
import pool from '../db';
import {assertProductionEnvironment,assertSupportedDatabaseVersion} from '../config/deployment';
import {getAllowedOrigins} from '../config/environment';
import {getPushConfig} from '../config/webPush';
import {JwtService} from '../services/jwtService';
import {MigrationSystem} from '../utils/MigrationSystem';

async function main(){
  try{
    process.chdir(path.resolve(__dirname,'../..'));
    if(process.argv.slice(2).some(arg=>!['--config-only','--require-push'].includes(arg)))throw new Error('Options: --config-only --require-push');
    const [major,minor]=process.versions.node.split('.').map(Number);
    if(major<22||(major===22&&minor<14))throw new Error('Node.js 22.14 or newer is required');
    assertProductionEnvironment();JwtService.assertConfiguration();getAllowedOrigins();
    const push=getPushConfig();
    if(process.argv.includes('--require-push')&&!push)throw new Error('Configure Web Push before the phone test');
    const upload=path.resolve(process.env.UPLOAD_DIRECTORY!);
    const withinCode=path.relative(process.cwd(),upload);
    if(!withinCode.startsWith('..'+path.sep)&&!path.isAbsolute(withinCode))throw new Error('Keep UPLOAD_DIRECTORY outside the application release');
    await fs.mkdir(upload,{recursive:true,mode:0o700});
    const probe=path.join(upload,`.write-check-${randomUUID()}`);
    await fs.writeFile(probe,'write check',{flag:'wx',mode:0o600});await fs.unlink(probe);
    console.log(`[Preflight] production configuration valid; push=${push?'configured':'disabled'}; worker=${process.env.PUSH_WORKER_MODE??'inline'}; upload directory writable`);
    if(process.argv.includes('--config-only'))return;
    const [rows]=await pool.query<RowDataPacket[]>('SELECT VERSION() AS version');
    assertSupportedDatabaseVersion(String(rows[0].version));
    const status=await new MigrationSystem(pool).status();
    if(status.pending.length||status.issues.length)throw new Error('Database has pending migrations or schema issues; run the reviewed migration procedure');
    const connection=await pool.getConnection();
    try{await connection.beginTransaction();await connection.query('SELECT id FROM push_deliveries LIMIT 1 FOR UPDATE SKIP LOCKED');await connection.rollback();}finally{connection.release();}
    console.log(`[Preflight] database ready; migrations=${status.applied.length}; queue locking supported`);
  }finally{await pool.end();}
}
main().catch(error=>{console.error(error?.code?`[Preflight] failed (${error.code})`:error instanceof Error?error.message:'[Preflight] failed');process.exitCode=1;});
