import assert from 'node:assert/strict';
import {test} from 'node:test';
import {randomUUID} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createQaEnvironment,QA_PASSWORD} from '../support/qaEnvironment';

test('Full functional HTTP audit on isolated MySQL',async t=>{
 const qa=await createQaEnvironment();t.after(()=>qa.stop());
 const evidence:{scenario:string;status:string;detail?:string}[]=[];
 const covered=new Set<string>();
 const origin='http://127.0.0.1:5177';
 const call=async(route:string,method='GET',body?:unknown,token?:string,cookie?:string)=>{
  covered.add(`${method} ${route.split('?')[0]}`);
  const response=await fetch(qa.base+route,{method,headers:{Origin:origin,'X-CSRF-Protection':'1',...(body instanceof FormData?{}:{'Content-Type':'application/json'}),...(token?{Authorization:`Bearer ${token}`} :{}),...(cookie?{Cookie:cookie}:{})},body:body===undefined?undefined:body instanceof FormData?body:JSON.stringify(body)});
  const text=await response.text();let data:any;try{data=JSON.parse(text);}catch{data=text;}
  return {status:response.status,data,headers:response.headers,cookie:response.headers.get('set-cookie')?.split(';')[0]};
 };
 const scenario=async(name:string,fn:()=>Promise<void>)=>{await t.test(name,async()=>{try{await fn();evidence.push({scenario:name,status:'passed'});}catch(error){evidence.push({scenario:name,status:'failed',detail:(error as Error).message});throw error;}});};
 t.after(async()=>{await fs.writeFile(path.resolve('../mekteb-e-dnevnik/docs/qa-http-results.json'),JSON.stringify({date:'27.10.2026.',environment:'marked isolated MySQL; synthetic data only',cases:evidence,coveredRequests:[...covered].sort()},null,2));});
 const sessions:Record<string,any>={};
 for(const username of Object.keys(qa.accounts)){const r=await call('/auth/login','POST',{username,password:QA_PASSWORD});assert.equal(r.status,200);sessions[username]={...r.data,cookie:r.cookie};}
 const admin=sessions.efendija_demo.accessToken,owner=sessions.vlasnik_demo.accessToken,teacher=sessions.ucitelj_demo.accessToken,parent=sessions.roditelj_demo.accessToken,other=sessions.drugi_roditelj_demo.accessToken,legacy=sessions.stari_roditelj_demo.accessToken;
 const sid=qa.students[0].id,privateSid=qa.students[1].id,foreignSid=qa.students[2].id;
 await scenario('AUTH-01 registration, validation and role injection',async()=>{
  const r=await call('/auth/register','POST',{firstName:'Test',lastName:'Roditelj',username:'new_parent',email:'new@example.test',password:QA_PASSWORD,role:'admin'});assert.equal(r.status,201);assert.equal(r.data.user.role,'parent');
  assert.equal((await call('/auth/register','POST',{username:'new_parent'})).status,400);
  assert.equal((await call('/auth/login','POST',{username:'new_parent',password:'wrong'})).status,401);
 });
 await scenario('ACL-01 every protected route rejects anonymous and insufficient roles',async()=>{
  for(const route of ['/students','/attendance','/comments','/users','/users/profile','/parent/students','/notifications','/push/config','/chat/conversations','/auth/sessions'])assert.equal((await call(route)).status,401,route);
  for(const token of [teacher,parent,legacy])assert.equal((await call('/attendance','GET',undefined,token)).status,403);
  for(const token of [teacher,parent,legacy])assert.equal((await call('/users','GET',undefined,token)).status,403);
  assert.equal((await call('/students','GET',undefined,parent)).status,403);
  assert.equal((await call('/parent/students','GET',undefined,teacher)).status,403);
  for(const method of ['POST','PUT','DELETE'])assert.equal((await call('/news'+(method==='POST'?'':'/1'),method,method==='DELETE'?undefined:{title:'x',text:'x'},teacher)).status,403);
 });
 await scenario('ADM-01 two admins and teacher see every student and conversation page',async()=>{
  for(const token of [admin,owner,teacher]){
   const ids=[];for(let page=1;page<=3;page++){const r=await call(`/chat/conversations?page=${page}`,'GET',undefined,token);assert.equal(r.status,200);ids.push(...r.data.data.conversations.map((c:any)=>c.studentId));}
   assert.equal(new Set(ids).size,120);assert.equal(ids.length,120);
   assert.equal((await call('/students?limit=1000','GET',undefined,token)).data.data.length,120);
  }
 });
 await scenario('STU-01 search, pagination, stats, grade and parent filters',async()=>{
  const first=await call('/students?page=1&limit=10','GET',undefined,admin),last=await call('/students?page=12&limit=10','GET',undefined,admin);assert.equal(first.data.pagination.totalItems,120);assert.equal(last.data.data.length,10);
  assert.equal((await call('/students?search=D%C5%BEenana','GET',undefined,admin)).data.data[0].firstName,'Dženana Šeherzada');
  for(const route of ['/students/search?q=Amina','/students/stats','/students/grade/2',`/students/parent/${qa.accounts.roditelj_demo}`])assert.equal((await call(route,'GET',undefined,admin)).status,200,route);
  assert.equal((await call('/students?page=0','GET',undefined,admin)).status,400);
  const connected=(await call(`/students/${sid}`,'GET',undefined,admin)).data.data;assert.match(connected.parentName,/Lejla Demo/);assert.match(connected.parentName,/Adnan Primjer/);
 });
 await scenario('STU-02 student CRUD, date-only birthday and invalid dates',async()=>{
  const created=await call('/students','POST',{firstName:'Test',lastName:'Brisanje',dateOfBirth:'2016-02-29',gradeLevel:'2'},teacher);assert.equal(created.status,201);const id=created.data.data.id;
  assert.equal(created.data.data.dateOfBirth,'2016-02-29');
  assert.equal((await call(`/students/${id}`,'PUT',{firstName:'Izmjena'},owner)).status,200);
  assert.equal((await call(`/students/${id}`,'GET',undefined,admin)).data.data.firstName,'Izmjena');
  assert.equal((await call(`/students/${id}`,'PUT',{dateOfBirth:'2026-02-30'},admin)).status,400);
  assert.equal((await call(`/students/${id}`,'DELETE',undefined,admin)).status,200);assert.equal((await call(`/students/${id}`,'GET',undefined,admin)).status,404);
 });
 await scenario('PROF-01 own profile updates and role/email protection',async()=>{
  assert.equal((await call('/users/profile','GET',undefined,parent)).status,200);
  const id=qa.accounts.roditelj_demo;assert.equal((await call(`/users/${id}`,'PUT',{firstName:'Novo',lastName:'Ime',role:'admin',email:'changed@example.test'},parent)).status,200);
  const r=await call('/users/profile','GET',undefined,parent);assert.equal(r.data.role,'parent');assert.equal(r.data.email,'roditelj_demo@example.test');assert.ok(!JSON.stringify(r.data).includes('password'));
  assert.equal((await call(`/users/${qa.accounts.efendija_demo}`,'PUT',{first_name:'x'},parent)).status,403);assert.equal((await call('/users','GET',undefined,admin)).status,200);
 });
 await scenario('PAR-01 own children, shared child, invitation connect/disconnect and denial',async()=>{
  const children=await call('/parent/students','GET',undefined,parent);assert.equal(children.data.data.length,2);assert.ok(!JSON.stringify(children.data).includes('parentKey'));
  assert.equal((await call(`/parent/students/${foreignSid}/attendance`,'GET',undefined,parent)).status,403);
  assert.equal((await call(`/chat/${foreignSid}/messages`,'GET',undefined,parent)).status,403);
  const target=qa.students[8];assert.equal((await call('/parent/connect','POST',{parentKey:target.parentKey},parent)).status,200);
  assert.equal((await call(`/parent/students/${target.id}`,'DELETE',undefined,parent)).status,200);
  assert.equal((await call(`/chat/${target.id}/messages`,'GET',undefined,parent)).status,403);
  assert.equal((await call('/parent/students','GET',undefined,legacy)).data.data.length,1);
  assert.equal((await call(`/chat/${privateSid}/messages`,'GET',undefined,other)).status,403);
 });
 await scenario('ATT-01 attendance writes, all statuses, filters, deletion and uniqueness',async()=>{
  const record=await call('/attendance','POST',{student_id:sid,date:'2026-10-26',status:'PRESENT'},admin);assert.equal(record.status,201);const id=record.data.data.id;
  for(const status of ['LATE','EXCUSED','ABSENT'])assert.equal((await call(`/attendance/${id}`,'PUT',{status},admin)).status,200);
  assert.equal((await call('/attendance','POST',{student_id:sid,date:'2026-10-26',status:'PRESENT'},owner)).status,201);
  for(const route of [`/attendance/${id}`,'/attendance?date=2026-10-26','/attendance/date/2026-10-26',`/attendance/student/${sid}?startDate=2026-10-17&endDate=2026-10-27`,`/attendance/student/${sid}/stats`,'/attendance/grade/2?date=2026-10-27'])assert.equal((await call(route,'GET',undefined,admin)).status,200,route);
  assert.equal((await call(`/attendance/${id}`,'DELETE',undefined,admin)).status,200);
  const concurrent=await Promise.all([admin,owner].map(token=>call('/attendance','POST',{student_id:sid,date:'2026-10-20',status:'LATE'},token)));assert.ok(concurrent.every(r=>r.status===201));assert.equal(concurrent[0].data.data.id,concurrent[1].data.data.id);
  await call(`/attendance/${concurrent[0].data.data.id}`,'DELETE',undefined,admin);
 });
 await scenario('ATT-02 missing attendance is unrecorded, not absent; bulk and accurate summary',async()=>{
  const r=await call('/attendance/date/2026-10-27/summary','GET',undefined,admin);assert.equal(r.data.data.totals.absentCount,3);assert.equal(r.data.data.totals.unrecordedCount,108);
  const bulk=await call('/attendance/bulk','POST',{attendanceList:[{student_id:qa.students[20].id,date:'2026-10-26',status:'LATE'}]},admin);assert.equal(bulk.status,201);
  const stats=await call(`/parent/students/${sid}/attendance/stats`,'GET',undefined,parent);assert.equal(stats.status,200);assert.equal(stats.data.data.totalDays,5);
  const staffStats=(await call(`/attendance/student/${sid}/stats`,'GET',undefined,admin)).data.data;assert.equal(staffStats.attendanceRate,60);
  assert.equal((await call(`/parent/students/${sid}/attendance`,'GET',undefined,parent)).status,200);
  const invalid=await call('/attendance/bulk','POST',{attendanceList:[{student_id:sid,date:'2026-10-19',status:'PRESENT'},{student_id:999999,date:'2026-10-19',status:'PRESENT'}]},admin);assert.equal(invalid.status,500);
  assert.equal((await call('/attendance/date/2026-10-19','GET',undefined,admin)).data.data.length,0,'bulk changes roll back together');
 });
 await scenario('CHAT-02 idempotent sending and both administrators see the committed message',async()=>{
  const receipt={content:'Provjerena poruka',date:'2026-10-27',clientMessageId:randomUUID()};
  const first=await call(`/chat/${sid}/messages`,'POST',receipt,parent),repeat=await call(`/chat/${sid}/messages`,'POST',receipt,parent);assert.equal(first.status,201);assert.equal(first.data.data.id,repeat.data.data.id);
  assert.equal((await call(`/chat/${sid}/messages`,'POST',{...receipt,content:'Different'},parent)).status,409);
  for(const token of [admin,owner])assert.ok((await call(`/chat/${sid}/messages`,'GET',undefined,token)).data.data.messages.some((m:any)=>m.id===first.data.data.id));
 });
 await scenario('CHAT-03 cursor history, replies and legacy daily comments',async()=>{
  const first=await call(`/chat/${sid}/messages?limit=50`,'GET',undefined,parent);const second=await call(`/chat/${sid}/messages?before=${first.data.data.nextCursor}&limit=50`,'GET',undefined,parent);assert.equal(first.data.data.messages.length,50);assert.equal(second.data.data.messages.length,50);assert.equal(new Set([...first.data.data.messages,...second.data.data.messages].map((m:any)=>m.id)).size,100);
  const target=first.data.data.messages[0];const reply=await call(`/chat/${sid}/messages`,'POST',{content:'Citirani odgovor',date:target.date,parentCommentId:target.id,clientMessageId:randomUUID()},admin);assert.equal(reply.status,201);
  for(const route of [`/comments?studentId=${sid}`,'/comments/daily/2026-10-27',`/comments/student/${sid}?date=2026-10-27`,`/comments/thread/${target.id}`])assert.equal((await call(route,'GET',undefined,admin)).status,200,route);
  const legacyBody={studentId:sid,content:'Komentar preko kompatibilne rute',date:'2026-10-27',clientMessageId:randomUUID()};
  assert.equal((await call('/comments','POST',legacyBody,parent)).status,403,'legacy parent route only permits replies');
  const legacyCreated=await call('/comments','POST',legacyBody,admin);assert.equal(legacyCreated.status,201);
  assert.equal((await call('/comments','POST',{...legacyBody,parentCommentId:legacyCreated.data.data.id,content:'Roditeljski odgovor',clientMessageId:randomUUID()},parent)).status,201);
  assert.ok((await call(`/chat/${sid}/messages`,'GET',undefined,admin)).data.data.messages.some((m:any)=>m.id===legacyCreated.data.data.id));
  assert.equal((await call(`/chat/conversations/${sid}`,'GET',undefined,parent)).data.data.studentId,sid);
  assert.equal((await call(`/chat/conversations/${foreignSid}`,'GET',undefined,parent)).status,404);
 });
 await scenario('CHAT-04 own edits, moderation, soft delete and read acknowledgement',async()=>{
  const created=await call(`/chat/${sid}/messages`,'POST',{content:'Za izmjenu',date:'2026-10-27',clientMessageId:randomUUID()},teacher);const id=created.data.data.id;
  assert.equal((await call(`/comments/${id}`,'PUT',{content:'Nedopušteno'},parent)).status,403);
  assert.equal((await call(`/comments/${id}`,'PUT',{content:'Uređeno'},teacher)).status,200);
  assert.equal((await call(`/comments/${id}`,'DELETE',undefined,owner)).status,200);
  const tombstone=(await call(`/chat/${sid}/messages`,'GET',undefined,admin)).data.data.messages.find((m:any)=>m.id===id);assert.ok(tombstone.deletedAt);assert.notEqual(tombstone.content,'Uređeno');
  assert.equal((await call(`/chat/${sid}/read`,'PATCH',{throughId:id},admin)).status,200);
 });
 await scenario('NOT-01 owned notifications, counts, filters, individual/all read',async()=>{
  const list=await call('/notifications?limit=50&unreadOnly=true','GET',undefined,owner);assert.equal(list.status,200);const notification=list.data.data[0];assert.ok(notification);
  assert.equal((await call(`/notifications/${notification.id}`,'GET',undefined,parent)).status,404);
  assert.equal((await call(`/notifications/${notification.id}`,'GET',undefined,owner)).status,200);
  assert.equal((await call(`/notifications/${notification.id}/read`,'PATCH',{},owner)).status,200);
  assert.equal((await call('/notifications/read-all','PATCH',{},owner)).status,200);
  assert.equal((await call('/notifications/unread-count','GET',undefined,owner)).data.data.count,0);
 });
 await scenario('NEWS-01/02 public news, strict input, CRUD and image lifecycle',async()=>{
  assert.equal((await call('/news')).status,200);assert.equal((await call('/news?page=abc')).status,400);
  const created=await call('/news','POST',{title:'Proba objave',text:'Prvi red\nDrugi red'},admin);assert.equal(created.status,201);const id=created.data.data.id;
  assert.equal((await call(`/news/${id}`,'PUT',{title:'Uređen naslov'},admin)).status,200);
  assert.equal((await call(`/news/${id}`)).data.data.text,'Prvi red\nDrugi red');
  assert.equal((await call(`/news/author/${qa.accounts.efendija_demo}`)).status,200);
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a4X0AAAAASUVORK5CYII=','base64');
  const form=new FormData();form.append('images',new Blob([png],{type:'image/png'}),'qa.png');const upload=await call(`/news/${id}/images`,'POST',form,admin);assert.equal(upload.status,201);assert.equal(typeof upload.data.data[0].id,'number');
  const images=(await call(`/news/${id}/images`)).data.data;assert.equal(images.length,1);assert.equal((await call(images[0].url.replace('/api',''))).status,200);
  const fake=new FormData();fake.append('images',new Blob(['not an image'],{type:'image/png'}),'fake.png');assert.equal((await call(`/news/${id}/images`,'POST',fake,admin)).status,400);
  const missing=new FormData();missing.append('images',new Blob([png],{type:'image/png'}),'missing.png');assert.equal((await call('/news/999999/images','POST',missing,admin)).status,404);
  assert.equal((await fs.readdir(process.env.MEKTEB_TEST_UPLOAD_DIRECTORY!)).length,1,'failed uploads must not leave orphaned files');
  assert.equal((await call(`/news/images/${images[0].id}`,'DELETE',undefined,admin)).status,200);
  const five=new FormData();for(let i=0;i<5;i++)five.append('images',new Blob([png],{type:'image/png'}),`qa${i}.png`);assert.equal((await call(`/news/${id}/images`,'POST',five,admin)).status,201);
  const sixth=new FormData();sixth.append('images',new Blob([png],{type:'image/png'}),'sixth.png');assert.equal((await call(`/news/${id}/images`,'POST',sixth,admin)).status,400);
  assert.equal((await call(`/news/${id}`,'DELETE',undefined,admin)).status,200);assert.equal((await call(`/news/${id}`)).status,404);
  assert.equal((await fs.readdir(process.env.MEKTEB_TEST_UPLOAD_DIRECTORY!)).length,0,'deleting an article also removes its images');
 });
 await scenario('PUSH-01 valid config and invalid destination rejection',async()=>{
  assert.equal((await call('/push/config','GET',undefined,parent)).data.data.enabled,true);
  assert.equal((await call('/push/subscription','POST',{endpoint:'http://127.0.0.1/private'},parent)).status,400);
  assert.equal((await call('/push/subscription','DELETE',undefined,parent)).status,200);
 });
 await scenario('AUTH-02/03/04 owned sessions, refresh, revocation and logout all',async()=>{
  const list=await call('/auth/sessions','GET',undefined,admin);assert.equal(list.status,200);assert.ok(!JSON.stringify(list.data).includes('refresh_hash'));
  assert.equal((await call(`/auth/sessions/${sessions.efendija_demo.sessionId}`,'DELETE',undefined,parent)).status,404);
  const refreshed=await call('/auth/refresh','POST',{},undefined,sessions.efendija_demo.cookie);assert.equal(refreshed.status,200);
  assert.equal((await call('/auth/logout','POST',{},undefined,refreshed.cookie)).status,200);assert.equal((await call('/users/profile','GET',undefined,admin)).status,401);
  assert.equal((await call('/auth/logout-all','POST',{},owner,sessions.vlasnik_demo.cookie)).status,200);
 });
 await scenario('API-01 health, unknown resources and malformed identifiers',async()=>{
  assert.equal((await call('/health')).data.status,'healthy');assert.equal((await call('/not-a-route')).status,404);
  assert.equal((await call('/students/1abc','GET',undefined,teacher)).status,400);
  assert.equal((await call('/news/1abc')).status,400);
 });
});
