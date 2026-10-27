import assert from 'node:assert/strict';
import {afterEach,test} from 'node:test';
import webPush from 'web-push';
import {randomBytes} from 'node:crypto';
import {getPushConfig,validatePushSubscription} from '../src/config/webPush';
import {toStudentComment} from '../src/services/commentService';
const saved=Object.fromEntries(['WEB_PUSH_PUBLIC_KEY','WEB_PUSH_PRIVATE_KEY','WEB_PUSH_SUBJECT','WEB_PUSH_ALLOWED_HOSTS'].map(key=>[key,process.env[key]]));
afterEach(()=>{for(const[key,value]of Object.entries(saved)){if(value===undefined)delete process.env[key];else process.env[key]=value;}});
const subscription=(endpoint='https://fcm.googleapis.com/fcm/send/test')=>({endpoint,keys:{p256dh:webPush.generateVAPIDKeys().publicKey,auth:randomBytes(16).toString('base64url')}});
test('message DTO omits internal receipt fingerprints even after deletion',()=>{
 const message=toStudentComment({id:1,student_id:2,author_id:3,author_role:'parent',content:'[deleted]',date:'2026-10-17',created_at:new Date(),request_hash:'private-fingerprint',deleted_at:new Date(),internal_secret:'hidden'});
 assert.ok(!JSON.stringify(message).includes('fingerprint'));assert.ok(!JSON.stringify(message).includes('hidden'));assert.ok(message.deletedAt);
});
test('push is optional, but partial or mismatched VAPID configuration fails closed',()=>{
  for(const key of Object.keys(saved))delete process.env[key];assert.equal(getPushConfig(),null);
  const keys=webPush.generateVAPIDKeys();process.env.WEB_PUSH_PUBLIC_KEY=keys.publicKey;
  assert.throws(getPushConfig,/all three/);
  process.env.WEB_PUSH_PRIVATE_KEY=keys.privateKey;process.env.WEB_PUSH_SUBJECT='https://example.test';
  assert.equal(getPushConfig()?.publicKey,keys.publicKey);
  process.env.WEB_PUSH_PRIVATE_KEY=webPush.generateVAPIDKeys().privateKey;assert.throws(getPushConfig,/Invalid/);
});
test('push endpoints cannot target local networks, credentials, custom ports, non-HTTPS or arbitrary hosts',()=>{
  delete process.env.WEB_PUSH_ALLOWED_HOSTS;
  for(const endpoint of ['http://fcm.googleapis.com/send/test','https://127.0.0.1/push','https://localhost/push','https://169.254.169.254/latest','https://fcm.googleapis.com.evil.test/push','https://fcm.googleapis.com@evil.test/push','https://user:pass@fcm.googleapis.com/send','https://fcm.googleapis.com:8443/send','https://fcm.googleapis.com/send#secret'])assert.throws(()=>validatePushSubscription(subscription(endpoint)),endpoint);
  for(const endpoint of ['https://fcm.googleapis.com/fcm/send/test','https://updates.push.services.mozilla.com/wpush/v2/test','https://web.push.apple.com/test'])assert.equal(validatePushSubscription(subscription(endpoint)).endpoint,endpoint);
});
test('subscription keys must be a valid P-256 point and correctly sized auth secret',()=>{
  const valid=subscription();assert.doesNotThrow(()=>validatePushSubscription(valid));
  for(const keys of [{},{p256dh:'x'.repeat(87),auth:valid.keys.auth},{...valid.keys,auth:'short'},{...valid.keys,p256dh:123}])assert.throws(()=>validatePushSubscription({...valid,keys}));
  for(const input of [undefined,null,[],{endpoint:123},{endpoint:'not a url'},subscription('https://fcm.googleapis.com/'+ 'a'.repeat(2048))])assert.throws(()=>validatePushSubscription(input));
});
