// Private cPanel CLI; no HTTP endpoint and no user-selected database name.
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const zlib=require('node:zlib');
const {createHash}=require('node:crypto');
const live=path.join(os.homedir(),'api.mekteb-pazaric.com');
const source=require(path.join(live,'node_modules/dotenv')).parse(fs.readFileSync(path.join(live,'.env')));
const mysql=require(path.join(live,'node_modules/mysql2/promise'));
const target='mektebpa_rehearsal_20261027';
const expectedTables=['attendance','messages','news','news_images','notifications','parent_students','student_comments','students','users'];
async function connect(){
 if(source.DB_NAME!=='mektebpa_mekteb_db'||target===source.DB_NAME)throw new Error('Source/target guard failed');
 const db=await mysql.createConnection({host:source.DB_HOST,user:source.DB_USER,password:source.DB_PASS,port:Number(source.DB_PORT)||3306,database:target,multipleStatements:true,dateStrings:true,charset:'utf8mb4'});
 const [identity]=await db.query('SELECT DATABASE() AS name');
 if(identity[0].name!==target){await db.end();throw new Error('Target identity mismatch');}
 return db;
}
async function restore(){
 if(process.argv[2]!=='--confirm-empty-rehearsal')throw new Error('Explicit empty-rehearsal confirmation required');
 const input=fs.readFileSync(path.join(__dirname,'rehearsal-source.sql.gz'));
 const digest=createHash('sha256').update(input).digest('hex');
 const record=JSON.parse(fs.readFileSync(path.join(__dirname,'rehearsal-source-record.json'),'utf8'));
 if(digest!==record.sha256)throw new Error('Backup checksum mismatch');
 let sql=zlib.gunzipSync(input).toString('utf8');
 sql=sql.replace(/^\/\*M!999999\\- enable the sandbox mode \*\/\r?\n/,'');
 if(/^\s*(?:USE\b|(?:CREATE|DROP|ALTER)\s+(?:DATABASE|SCHEMA)\b)/im.test(sql)||/\b(?:OUTFILE|INFILE|LOAD_FILE|DEFINER|DELIMITER)\b/i.test(sql))throw new Error('Unexpected dump scope or program');
 const created=[...sql.matchAll(/^CREATE TABLE `([a-z_]+)`/gm)].map(x=>x[1]).sort();
 if(JSON.stringify(created)!==JSON.stringify(expectedTables))throw new Error('Unexpected source table set');
 // Empty-only restore needs no DROP privilege and never deletes an existing table.
 sql=sql.replace(/^DROP TABLE IF EXISTS `[a-z_]+`;\r?\n/gm,'');
 const db=await connect();
 try{
  const [tables]=await db.query('SHOW TABLES');
  if(tables.length)throw new Error('Restore refused: target is not empty');
  await db.query(sql);
  const counts={};for(const table of expectedTables){const [rows]=await db.query('SELECT COUNT(*) AS n FROM `'+table+'`');counts[table]=Number(rows[0].n);}
  if(expectedTables.some(table=>counts[table]!==record.counts[table]))throw new Error('Restored counts differ from source audit');
  const report={restoredAt:new Date().toISOString(),database:target,sha256:digest,counts,restoreVerified:true,productionChanged:false};
  fs.writeFileSync(path.join(__dirname,'restore-report.json'),JSON.stringify(report,null,2),{mode:0o600});
  console.log(JSON.stringify(report));
 }finally{await db.end();}
}
restore().catch(error=>{console.error(error.code?'Rehearsal failed ('+error.code+')':error.message);process.exitCode=1;});
