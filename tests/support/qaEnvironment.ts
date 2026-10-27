// Explicit, disposable QA environment. Never loads application .env files.
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID,randomBytes} from 'node:crypto';
import mysql,{type RowDataPacket,type ResultSetHeader} from 'mysql2/promise';
import bcrypt from 'bcrypt';
import webPush from 'web-push';
import http from 'node:http';

export const QA_PASSWORD='Qa-only-password-2026';
export async function createQaEnvironment(httpPort=0){
  const directory=process.env.MEKTEB_TEST_MYSQL_DIRECTORY;
  const port=Number(process.env.MEKTEB_TEST_MYSQL_PORT);
  if(!directory||!Number.isSafeInteger(port)||port<10000||port>65535)throw Error('A marked isolated MySQL instance is required');
  if((await fs.readFile(path.join(directory,'test-instance-marker'),'utf8')).trim()!=='isolated-mekteb-test')throw Error('Invalid QA marker');
  const admin=await mysql.createConnection({host:'127.0.0.1',port,user:'root',password:''});
  const normalize=(value:string)=>path.resolve(value).replace(/[\\/]+$/,'').toLowerCase();
  const [identity]=await admin.query<RowDataPacket[]>('SELECT @@datadir AS dir,@@port AS port');
  if(normalize(identity[0].dir)!==normalize(path.join(directory,'data'))||Number(identity[0].port)!==port){await admin.end();throw Error('Not the isolated QA instance');}
  const database='mekteb_qa_'+randomUUID().replace(/-/g,'');
  const keys=webPush.generateVAPIDKeys();
  Object.assign(process.env,{NODE_ENV:'test',DB_HOST:'127.0.0.1',DB_PORT:String(port),DB_USER:'root',DB_PASS:'',DB_NAME:database,JWT_SECRET:randomBytes(48).toString('hex'),JWT_REFRESH_SECRET:randomBytes(48).toString('hex'),JWT_EXPIRE:'15m',JWT_REFRESH_EXPIRE:'30d',FRONTEND_URL:'http://127.0.0.1:5177',WEB_PUSH_PUBLIC_KEY:keys.publicKey,WEB_PUSH_PRIVATE_KEY:keys.privateKey,WEB_PUSH_SUBJECT:'mailto:qa@example.test'});
  await admin.query(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  process.env.MEKTEB_TEST_UPLOAD_DIRECTORY=path.join(directory,database+'-uploads');
  const pool=(await import('../../src/db')).default;
  const {MigrationSystem}=await import('../../src/utils/MigrationSystem');
  await new MigrationSystem(pool).runMigrations();
  const password=await bcrypt.hash(QA_PASSWORD,12);
  const accounts:Record<string,number>={};
  for(const [username,role,first,last]of [['efendija_demo','admin','Efendija','Demo'],['vlasnik_demo','admin','Vlasnik','Demo'],['ucitelj_demo','teacher','Učitelj','Demo'],['roditelj_demo','parent','Lejla','Demo'],['drugi_roditelj_demo','parent','Adnan','Primjer'],['stari_roditelj_demo','user','Stari','Roditelj']]){
    const[result]=await pool.execute<ResultSetHeader>('INSERT INTO users(username,email,password,role,first_name,last_name)VALUES(?,?,?,?,?,?)',[username,username+'@example.test',password,role,first,last]);accounts[username]=result.insertId;
  }
  const {StudentService}=await import('../../src/services/studentService');
  const students=[];
  for(let i=1;i<=120;i++){
    const[firstName,lastName]=i===1?['Amina','Demo']:i===2?['Harun','Demo']:i===3?['Lejla','Primjer']:i===4?['Dženana Šeherzada','Čengić Demo']:['Učenik',`Primjer ${String(i).padStart(3,'0')}`];
    students.push(await StudentService.createStudent({firstName,lastName,dateOfBirth:i===4?'2016-02-29':'2015-04-12',gradeLevel:String(i%4+1)}));
  }
  for(const[user,student]of [[accounts.roditelj_demo,students[0].id],[accounts.roditelj_demo,students[1].id],[accounts.drugi_roditelj_demo,students[0].id],[accounts.drugi_roditelj_demo,students[2].id],[accounts.stari_roditelj_demo,students[3].id]])await pool.execute('INSERT INTO parent_students(user_id,student_id)VALUES(?,?)',[user,student]);
  for(const[date,status]of [['2026-10-17','PRESENT'],['2026-10-18','LATE'],['2026-10-24','ABSENT'],['2026-10-25','EXCUSED']])await pool.execute('INSERT INTO attendance(student_id,date,status)VALUES(?,?,?)',[students[0].id,date,status]);
  for(let i=0;i<12;i++)await pool.execute('INSERT INTO attendance(student_id,date,status)VALUES(?,?,?)',[students[i].id,'2026-10-27',['PRESENT','ABSENT','LATE','EXCUSED'][i%4]]);
  const lines=['Selam alejkum. Možete li nam javiti šta da ponovimo kod kuće?','Alejkumu selam. Ove sedmice ponavljamo kratke sure. Dovoljno je deset minuta svaki dan.','Hvala vam. Javit ćemo se ako bude trebala pomoć.'];
  for(let i=0;i<120;i++)for(let j=0;j<(i===0?106:3);j++){
    const author=j%2?accounts.efendija_demo:accounts.roditelj_demo;
    const[result]=await pool.execute<ResultSetHeader>('INSERT INTO student_comments(student_id,author_id,author_role,content,date,created_at)VALUES(?,?,?,?,?,TIMESTAMPADD(SECOND,?,CURRENT_TIMESTAMP))',[students[i].id,author,j%2?'admin':'parent',j<3?lines[j]:`Primjer ranije poruke ${j+1}.`,'2026-10-27',-500+j]);
    if(j===2)for(const recipient of [accounts.efendija_demo,accounts.vlasnik_demo,accounts.ucitelj_demo])await pool.execute('INSERT INTO notifications(recipient_user_id,actor_user_id,type,title,message,student_id,comment_id,comment_date)VALUES(?,?,\'COMMENT_ADDED\',\'Nova poruka\',\'Imate novu poruku.\',?,?,\'2026-10-27\')',[recipient,author,students[i].id,result.insertId]);
  }
  await pool.execute('INSERT INTO news(title,text,created_by)VALUES(?,?,?)',['Dobrodošli u naš mekteb','Dragi roditelji, ovdje možete pratiti novosti i važne obavijesti.\n\nRadujemo se zajedničkom učenju i druženju.',accounts.efendija_demo]);
  const {createApp}=await import('../../src/app');
  const {NotificationHub}=await import('../../src/services/notificationHub');
  const faults=new Set<string>(),app=createApp();
  const server=http.createServer((req,res)=>{
    const kind=req.method==='POST'&&req.url?.includes('/images')?'upload':req.url?.includes('/attendance')&&req.method==='POST'?'attendance':req.url?.includes('/news')&&req.method==='POST'?'news':undefined;
    if(kind&&faults.delete(kind)){res.writeHead(503,{'Content-Type':'application/json','Access-Control-Allow-Origin':'http://127.0.0.1:5177','Access-Control-Allow-Credentials':'true'});res.end(JSON.stringify({success:false,error:'QA_SIMULATED_OUTAGE'}));return;}
    app(req,res);
  });NotificationHub.init(server);
  await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(httpPort,'127.0.0.1',resolve);});
  const address=server.address() as {port:number};
  let stopped=false;
  return {pool,admin,accounts,students,database,server,faults,base:`http://127.0.0.1:${address.port}/backend/api`,async stop(){if(stopped)return;stopped=true;NotificationHub.close();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));await pool.end();await admin.query(`DROP DATABASE \`${database}\``);await admin.end();}};
}
