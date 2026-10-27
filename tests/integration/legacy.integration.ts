// Opt-in; exact datadir/marker verification before creating or dropping a QA DB.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import mysql,{type RowDataPacket} from 'mysql2/promise';
import {MigrationSystem,splitMigrationSql} from '../../src/utils/MigrationSystem';
import {legacyDataFingerprint} from '../../src/utils/legacyUpgrade';

test('reviewed legacy bridge refuses bad data, preserves all records and adopts only verified history',async()=>{
 const directory=process.env.MEKTEB_TEST_MYSQL_DIRECTORY,port=Number(process.env.MEKTEB_TEST_MYSQL_PORT);
 if(!directory||!Number.isSafeInteger(port)||port<10000||port>65535)throw Error('A marked isolated MySQL instance is required');
 assert.equal((await fs.readFile(path.join(directory,'test-instance-marker'),'utf8')).trim(),'isolated-mekteb-test');
 const admin=await mysql.createConnection({host:'127.0.0.1',port,user:'root',password:''});
 const normalize=(value:string)=>path.resolve(value).replace(/[\\/]+$/,'').toLowerCase();
 const [identity]=await admin.query<RowDataPacket[]>('SELECT @@datadir AS dir,@@port AS port');
 assert.equal(normalize(identity[0].dir),normalize(path.join(directory,'data')));assert.equal(Number(identity[0].port),port);
 const database='mekteb_test_legacy_'+randomUUID().replace(/-/g,'');
 await admin.query(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4`);
 const pool=mysql.createPool({host:'127.0.0.1',port,user:'root',password:'',database,dateStrings:true});
 try{
  const fixture=await fs.readFile(path.resolve('tests/fixtures/legacy-schema.sql'),'utf8');
  for(const statement of splitMigrationSql(fixture))await pool.query(statement);
  await pool.execute("INSERT INTO users(id,username,email,password,role,first_name,last_name)VALUES(1,'legacy','legacy@example.test','hashed-fixture','admin','Dženan','Čengić')");
  await pool.execute("INSERT INTO students(id,parent_id,first_name,last_name,date_of_birth,grade_level,parent_key)VALUES(1,1,'Šejla','Žunić','2016-02-29','1','2026-1027-AB12')");
  await pool.execute("INSERT INTO attendance(student_id,date,status)VALUES(1,'2026-10-27','PRESENT')");
  await pool.execute("INSERT INTO news(id,title,text,created_by)VALUES(1,'Čas','Čestitamo!','1')");
  await pool.execute('INSERT INTO news_images(news_id,image_path,original_name,file_size,mime_type)VALUES(1,?,?,12,?)',['x'.repeat(350)+'.png','slika.png','image/png']);
  await pool.execute("INSERT INTO student_comments(id,student_id,author_id,author_role,content,date)VALUES(1,1,1,'admin','Sačuvana poruka','2026-10-27')");
  await pool.execute('INSERT INTO parent_students(user_id,student_id)VALUES(1,1)');
  await pool.execute("INSERT INTO notifications(recipient_user_id,actor_user_id,type,title,message,student_id,comment_id,comment_date)VALUES(1,1,'COMMENT_ADDED','Poruka','Legacy message',1,1,'2026-10-27')");
  await pool.execute("INSERT INTO messages(sender_id,receiver_id,message)VALUES(1,1,'Preserve unrelated legacy messages')");
  const system=new MigrationSystem(pool);
  await assert.rejects(system.runMigrations(),/baseline adoption/);
  const beforeConnection=await pool.getConnection();const before=await legacyDataFingerprint(beforeConnection);beforeConnection.release();
  const plan=await system.legacyUpgradePlan();assert.ok(plan.length>20);assert.ok(plan.every(sql=>/^ALTER TABLE /.test(sql)));assert.ok(!plan.some(sql=>/VARCHAR\(255\).*image_path/.test(sql)));
  await pool.execute("INSERT INTO attendance(student_id,date,status)VALUES(1,'2026-10-27','ABSENT')");
  await assert.rejects(system.upgradeLegacySchema(true,true),/duplicateAttendance/);
  const [untouched]=await pool.query<RowDataPacket[]>("SELECT CHARACTER_MAXIMUM_LENGTH AS width FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='users' AND COLUMN_NAME='username'");assert.equal(Number(untouched[0].width),50,'all quality checks precede DDL');
  await pool.execute('DELETE FROM attendance WHERE id=2');
  await assert.rejects(system.upgradeLegacySchema(false,true),/verified restore/);
  const upgraded=await system.upgradeLegacySchema(true,true);assert.equal(upgraded.recordsPreserved,true);assert.equal(upgraded.adopted.length,5);assert.deepEqual(upgraded.fingerprint,before);
  assert.deepEqual((await system.status()).pending,['005_create_auth_sessions.sql','006_chat_and_web_push.sql']);
  await assert.rejects(system.upgradeLegacySchema(true,true),/unrecorded schema/);
  await assert.rejects(pool.execute("INSERT INTO attendance(student_id,date,status)VALUES(1,'2026-10-27','ABSENT')"));
  await assert.rejects(pool.execute("INSERT INTO student_comments(student_id,author_id,author_role,content,date)VALUES(1,1,'admin','','2026-10-27')"));
  await assert.rejects(pool.execute('INSERT INTO parent_students(user_id,student_id)VALUES(99,1)'));
  assert.deepEqual(await system.runMigrations(),['005_create_auth_sessions.sql','006_chat_and_web_push.sql']);
  assert.deepEqual((await system.status()).issues,[]);
  await pool.execute("INSERT INTO notifications(recipient_user_id,type,title,message)VALUES(1,'COMMENT_ADDED','Čestitamo','Želimo sreću učenicima')");
  const [saved]=await pool.query<RowDataPacket[]>('SELECT message FROM notifications ORDER BY id DESC LIMIT 1');assert.equal(saved[0].message,'Želimo sreću učenicima');
  const [image]=await pool.query<RowDataPacket[]>('SELECT image_path FROM news_images');assert.equal(image[0].image_path.length,354);
  console.log('PASS: legacy conflicts stop before DDL, long paths/Bosnian text/all nine tables survive, 000..004 verified adoption and 005..006 applied');
 }finally{await pool.end();await admin.query(`DROP DATABASE \`${database}\``);await admin.end();}
});
