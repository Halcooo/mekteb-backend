// Short-lived loopback HTTP verification on the fixed rehearsal DB only.
// Push transport is replaced BEFORE loading the application. No provider calls.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const {randomUUID,randomBytes}=require('node:crypto');
const candidate=path.join(__dirname,'candidate');
const load=name=>require(path.join(candidate,name));
const webPush=load('node_modules/web-push');
let mockDeliveries=0;
webPush.sendNotification=async(_subscription,payload)=>{const data=JSON.parse(payload);assert.equal(data.body,'Imate novu poruku u aplikaciji.');assert.ok(!payload.includes('Želimo'));mockDeliveries++;return {statusCode:201,body:'',headers:{}};};
const keys=webPush.generateVAPIDKeys();
Object.assign(process.env,{WEB_PUSH_PUBLIC_KEY:keys.publicKey,WEB_PUSH_PRIVATE_KEY:keys.privateKey,WEB_PUSH_SUBJECT:'https://mekteb-pazaric.com/'});
const pool=load('dist/db').default;
const {MigrationSystem}=load('dist/utils/MigrationSystem');
const {legacyDataFingerprint}=load('dist/utils/legacyUpgrade');
const {createApp}=load('dist/app');
const {PushService}=load('dist/services/pushService');
const steps=[];const users=[];let studentId,server,before,phase='database identity';
const record=name=>{steps.push({scenario:name,passed:true});console.log('PASS: '+name);};
const fingerprint=async()=>{const db=await pool.getConnection();try{return await legacyDataFingerprint(db);}finally{db.release();}};
(async()=>{
 try{
  const [identity]=await pool.query('SELECT DATABASE() AS name,VERSION() AS version');
  assert.equal(identity[0].name,'mektebpa_rehearsal_20261027');
  phase='migration status';const status=await new MigrationSystem(pool).status();assert.deepEqual(status.pending,[]);assert.deepEqual(status.issues,[]);
  const [empty]=await pool.query('SELECT (SELECT COUNT(*) FROM push_subscriptions)+(SELECT COUNT(*) FROM push_deliveries) AS n');assert.equal(Number(empty[0].n),0,'Rehearsal must not contain real subscriptions');
  phase='fingerprint';before=await fingerprint();
  phase='loopback startup';
  server=createApp().listen(0,'127.0.0.1');await new Promise((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject);});
  const base='http://127.0.0.1:'+server.address().port+'/backend/api';
  // Native HTTP avoids undici's WebAssembly memory requirements on shared hosts.
  const call=(route,method='GET',body,token,cookie)=>new Promise((resolve,reject)=>{
   const request=http.request(base+route,{method,headers:{Origin:'https://mekteb-pazaric.com','X-CSRF-Protection':'1','Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{}),...(cookie?{Cookie:cookie}:{})}},response=>{
    let text='';response.setEncoding('utf8');response.on('data',chunk=>{text+=chunk;if(text.length>200000)request.destroy(new Error('Unexpected response size'));});
    response.on('end',()=>{try{const cookieHeader=response.headers['set-cookie']?.[0];resolve({status:response.statusCode,data:JSON.parse(text),cookie:cookieHeader?.split(';')[0],cookieHeader});}catch(error){reject(error);}});response.on('error',reject);
   });request.setTimeout(15000,()=>request.destroy(new Error('Loopback timeout')));request.on('error',reject);request.end(body===undefined?undefined:JSON.stringify(body));
  });
  phase='HTTP health';assert.equal((await call('/health')).status,200);phase='anonymous access';assert.equal((await call('/chat/conversations')).status,401);
  record('MariaDB migrations, health and anonymous access gate');
  phase='login';const bcrypt=load('node_modules/bcrypt');const password=randomBytes(24).toString('hex'),prefix='qa_'+randomBytes(5).toString('hex');
  const sessions={};
  for(const role of ['admin','teacher','parent']){
   const username=prefix+'_'+role;
   const [result]=await pool.execute('INSERT INTO users(username,email,password,role,first_name,last_name)VALUES(?,?,?,?,?,?)',[username,username+'@example.test',await bcrypt.hash(password,12),role,'QA','Probni']);users.push(result.insertId);
   const login=await call('/auth/login','POST',{username,password});assert.equal(login.status,200);
   for(const flag of ['__Secure-mekteb_refresh=','HttpOnly','Secure','SameSite=Lax','Path=/backend/api/auth'])assert.ok(login.cookieHeader.includes(flag));
   sessions[role]={...login.data,cookie:login.cookie};
  }
  phase='refresh';const refreshed=await call('/auth/refresh','POST',{},undefined,sessions.parent.cookie);assert.equal(refreshed.status,200);assert.notEqual(refreshed.cookie,sessions.parent.cookie);sessions.parent={...refreshed.data,cookie:refreshed.cookie};
  record('Login for three roles, Secure HttpOnly cookie and durable refresh rotation');
  phase='student and inbox';const created=await call('/students','POST',{firstName:'Željko',lastName:'QA učenik',dateOfBirth:'2016-02-29',gradeLevel:'2'},sessions.teacher.accessToken);assert.equal(created.status,201);studentId=created.data.data.id;assert.equal(created.data.data.dateOfBirth,'2016-02-29');
  await pool.execute('INSERT INTO parent_students(user_id,student_id)VALUES(?,?)',[users[2],studentId]);
  const conversations=await call('/chat/conversations','GET',undefined,sessions.teacher.accessToken);assert.equal(conversations.status,200);assert.ok(conversations.data.data.conversations.some(c=>c.studentId===studentId));
  const children=await call('/parent/students','GET',undefined,sessions.parent.accessToken);assert.equal(children.status,200);assert.equal(children.data.data.length,1);
  record('Teacher inbox, parent ownership and calendar birthday');
  phase='push subscription';const subscription={endpoint:'https://fcm.googleapis.com/fcm/send/mekteb-qa-'+randomUUID(),keys:{p256dh:webPush.generateVAPIDKeys().publicKey,auth:randomBytes(16).toString('base64url')}};
  assert.equal((await call('/push/subscription','POST',subscription,sessions.parent.accessToken)).status,200);
  const receipt={content:'Želimo sreću učenicima. Čuvamo podatke.',date:'2026-10-27',clientMessageId:randomUUID()};
  phase='chat send';const sends=await Promise.all([1,2].map(()=>call('/chat/'+studentId+'/messages','POST',receipt,sessions.teacher.accessToken)));assert.ok(sends.every(r=>r.status===201));assert.equal(sends[0].data.data.id,sends[1].data.data.id);
  const id=sends[0].data.data.id;
  const history=await call('/chat/'+studentId+'/messages','GET',undefined,sessions.parent.accessToken);assert.equal(history.status,200);assert.equal(history.data.data.messages[0].content,receipt.content);assert.equal(history.data.data.messages[0].date,'2026-10-27');
  const notifications=await call('/notifications','GET',undefined,sessions.parent.accessToken);assert.equal(notifications.status,200);
  const [saved]=await pool.query('SELECT COUNT(*) AS n FROM notifications WHERE recipient_user_id=? AND comment_id=?',[users[2],id]);assert.equal(Number(saved[0].n),1);
  record('Concurrent idempotent chat, Bosnian text and one in-app notification');
  phase='queue claims';const claimed=await Promise.all([PushService.processBatch(),PushService.processBatch()]);assert.equal(claimed.reduce((a,b)=>a+b,0),1);assert.equal(mockDeliveries,1);
  const [delivery]=await pool.query('SELECT status FROM push_deliveries');assert.equal(delivery[0].status,'sent');
  record('MariaDB SKIP LOCKED concurrent queue claims; transport mocked, zero external push traffic');
  phase='read/logout';assert.equal((await call('/chat/'+studentId+'/read','PATCH',{throughId:id},sessions.parent.accessToken)).status,200);
  const [read]=await pool.query('SELECT is_read FROM notifications WHERE recipient_user_id=? AND comment_id=?',[users[2],id]);assert.equal(Number(read[0].is_read),1);
  assert.equal((await call('/auth/logout','POST',{},undefined,sessions.parent.cookie)).status,200);
  assert.equal((await call('/users/profile','GET',undefined,sessions.parent.accessToken)).status,401);
  record('Read marker, logout and revoked session denial');
 }finally{
  try{
  if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
  if(studentId){await pool.execute('DELETE FROM notifications WHERE student_id=?',[studentId]);await pool.execute('DELETE FROM students WHERE id=?',[studentId]);}
  for(const id of users)await pool.execute('DELETE FROM users WHERE id=?',[id]);
  if(before){assert.deepEqual(await fingerprint(),before);record('All original copied records unchanged after synthetic test cleanup');}
  }finally{await pool.end();}
 }
 const report={checkedAt:new Date().toISOString(),node:process.version,database:'MariaDB 10.11.10 rehearsal',passed:true,steps,realPush:false,productionChanged:false};
 fs.writeFileSync(path.join(__dirname,'smoke-report.json'),JSON.stringify(report,null,2),{mode:0o600});console.log(JSON.stringify(report));
})().catch(error=>{const detail=typeof error.actual==='number'&&typeof error.expected==='number'?'; actual='+error.actual+' expected='+error.expected:'';console.error('Rehearsal smoke failed; phase='+phase+'; '+(error.code||error.name||'RUNTIME')+(error.cause?.code?'; cause='+error.cause.code:'')+detail+'; completed scenarios='+steps.length);process.exitCode=1;});
