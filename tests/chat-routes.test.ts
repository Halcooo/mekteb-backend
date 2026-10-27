import assert from 'node:assert/strict';
import {test,beforeEach,afterEach,mock} from 'node:test';
import type {AddressInfo} from 'node:net';
import {createApp} from '../src/app';
import {JwtService} from '../src/services/jwtService';
import {UserService} from '../src/services/userService';
import {SessionService} from '../src/services/sessionService';
import {ParentService} from '../src/services/parentService';
import {ChatService,type SendMessageData} from '../src/services/chatService';
import pool from '../src/db';
const sid='11111111-1111-4111-8111-111111111111';
beforeEach(()=>{
 for(const method of ['query','execute','getConnection'] as const)mock.method(pool,method,async()=>{throw Error('Unexpected DB');});
 mock.method(SessionService,'isSessionActive',async()=>true);
 mock.method(UserService,'getUserById',async()=>({id:7,username:'parent',email:'parent@example.test',password:'private',role:'parent',first_name:'Test',last_name:'Parent',created_at:new Date()}));
 mock.method(ParentService,'isStudentConnectedToParentUser',async(_userId:number,studentId:number)=>studentId===11);
});
afterEach(()=>mock.restoreAll());
async function withApi(run:(request:(route:string,method?:string,body?:unknown,authenticated?:boolean)=>Promise<{status:number;body:any}>)=>Promise<void>){
 const server=createApp().listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));
 const token=JwtService.generateAccessToken({userId:7,username:'parent',email:'parent@example.test',role:'parent',sid});
 try{await run(async(route,method='GET',body,authenticated=true)=>{
   const response=await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/backend/api/chat${route}`,{method,headers:{'Content-Type':'application/json',...(authenticated?{Authorization:`Bearer ${token}`}:{})},body:body===undefined?undefined:JSON.stringify(body)});
   return{status:response.status,body:await response.json()};
 });}finally{await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
}
test('chat requires authentication and parent reads stay scoped to connected children',async()=>{
 const messages=mock.method(ChatService,'messages',async()=>({messages:[],hasMore:false,nextCursor:null}));
 const read=mock.method(ChatService,'markRead',async()=>{});
 await withApi(async request=>{
  for(const path of ['/conversations','/11/messages'])assert.equal((await request(path,'GET',undefined,false)).status,401);
  assert.equal((await request('/22/messages')).status,403);
  assert.equal((await request('/22/read','PATCH',{throughId:101})).status,403);
  assert.equal(messages.mock.callCount(),0);assert.equal(read.mock.callCount(),0);
  assert.equal((await request('/11/messages?before=100&limit=30')).status,200);
  assert.deepEqual(messages.mock.calls[0].arguments,[11,{limit:30,before:100,date:undefined}]);
 });
});
test('read acknowledgements accept numeric JSON IDs and never an account ID from the body',async()=>{
 const read=mock.method(ChatService,'markRead',async()=>{});
 await withApi(async request=>{
  assert.equal((await request('/11/read','PATCH',{throughId:101,userId:999})).status,200);
  assert.deepEqual(read.mock.calls[0].arguments,[11,7,101]);
  for(const throughId of ['101',0,-1,1.5,null,{},Number.MAX_SAFE_INTEGER+1])assert.equal((await request('/11/read','PATCH',{throughId})).status,400);
  assert.equal(read.mock.callCount(),1);
 });
});
test('replies use numeric target IDs and authenticated authors while requiring a stable send receipt',async()=>{
 const send=mock.method(ChatService,'send',async (data:SendMessageData)=>({id:102,...data,createdAt:new Date().toISOString()}));
 const body={content:'  Reply  ',date:'2026-10-17',parentCommentId:101,clientMessageId:sid,authorId:999,authorRole:'admin'};
 await withApi(async request=>{
  assert.equal((await request('/11/messages','POST',body)).status,201);
  assert.deepEqual(send.mock.calls[0].arguments[0],{studentId:11,content:'Reply',date:'2026-10-17',parentCommentId:101,clientMessageId:sid,authorId:7,authorRole:'parent'});
  for(const invalid of [{...body,parentCommentId:'101'},{...body,clientMessageId:undefined},{...body,content:' '},{...body,date:'2026-02-31'},{...body,content:'a'.repeat(2001)}])assert.equal((await request('/11/messages','POST',invalid)).status,400);
  assert.equal(send.mock.callCount(),1);
 });
});
test('history pagination rejects partial IDs, oversized pages and ambiguous dates before reads',async()=>{
 const messages=mock.method(ChatService,'messages',async()=>({messages:[],hasMore:false,nextCursor:null}));
 await withApi(async request=>{
  for(const path of ['/11/messages?before=1tail','/11/messages?limit=101','/11/messages?limit=0','/11/messages?date=2026-02-31','/11tail/messages'])assert.equal((await request(path)).status,400,path);
  assert.equal(messages.mock.callCount(),0);
 });
});
