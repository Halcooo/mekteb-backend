// Run only through the authenticated cPanel "Run JS script" interface.
// Database access is SELECT-only; stdout and report never include row contents.
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const live=process.env.MEKTEB_LIVE_ROOT||path.join(os.homedir(),'api.mekteb-pazaric.com');
require(path.join(live,'node_modules/dotenv')).config({path:path.join(live,'.env'),quiet:true});
const mysql=require(path.join(live,'node_modules/mysql2/promise'));
const tables=['users','students','attendance','news','news_images','student_comments','parent_students','notifications','messages'];
(async()=>{
 const db=await mysql.createConnection({host:process.env.DB_HOST,user:process.env.DB_USER,password:process.env.DB_PASS,database:process.env.DB_NAME,port:Number(process.env.DB_PORT),dateStrings:true});
 try{
  const [server]=await db.query('SELECT VERSION() AS version,DATABASE() AS databaseName');
  const counts={};for(const table of tables){const [rows]=await db.query(`SELECT COUNT(*) AS total FROM \`${table}\``);counts[table]=Number(rows[0].total);}
  const checks={
   duplicateAttendance:"SELECT COUNT(*) AS total FROM (SELECT student_id,date FROM attendance GROUP BY student_id,date HAVING COUNT(*)>1) x",
   duplicateImagePaths:"SELECT COUNT(*) AS total FROM (SELECT image_path FROM news_images GROUP BY image_path HAVING COUNT(*)>1) x",
   orphanStudentParent:'SELECT COUNT(*) AS total FROM students s LEFT JOIN users u ON u.id=s.parent_id WHERE s.parent_id IS NOT NULL AND u.id IS NULL',
   orphanAttendance:'SELECT COUNT(*) AS total FROM attendance a LEFT JOIN students s ON s.id=a.student_id WHERE s.id IS NULL',
   invalidNewsAuthor:"SELECT COUNT(*) AS total FROM news n LEFT JOIN users u ON n.created_by REGEXP '^[0-9]+$' AND u.id=CAST(n.created_by AS UNSIGNED) WHERE u.id IS NULL",
   orphanImages:'SELECT COUNT(*) AS total FROM news_images i LEFT JOIN news n ON n.id=i.news_id WHERE n.id IS NULL',
   nullStudentGrade:'SELECT COUNT(*) AS total FROM students WHERE grade_level IS NULL',
   nullUserTimestamp:'SELECT COUNT(*) AS total FROM users WHERE created_at IS NULL',
   nullStudentTimestamp:'SELECT COUNT(*) AS total FROM students WHERE created_at IS NULL',
   nullAttendanceRequired:'SELECT COUNT(*) AS total FROM attendance WHERE status IS NULL OR created_at IS NULL OR updated_at IS NULL',
   nullImageTimestamp:'SELECT COUNT(*) AS total FROM news_images WHERE uploaded_at IS NULL'
  };
  const quality={};for(const [name,sql]of Object.entries(checks)){const [rows]=await db.query(sql);quality[name]=Number(rows[0].total);}
  const [columns]=await db.query('SELECT TABLE_NAME AS tableName,COLUMN_NAME AS columnName,COLUMN_TYPE AS columnType,IS_NULLABLE AS nullable FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() ORDER BY TABLE_NAME,ORDINAL_POSITION');
  const report={checkedAt:new Date().toISOString(),server:server[0],node:process.version,counts,quality,columns,readOnly:true};
  fs.writeFileSync(path.join(__dirname,'audit-report.json'),JSON.stringify(report,null,2),{mode:0o600});
  console.log(JSON.stringify({audit:'completed',databaseVersion:server[0].version,node:process.version,tables:tables.length,quality,readOnly:true}));
 }finally{await db.end();}
})().catch(error=>{console.error('Read-only audit failed'+(error.code?' ('+error.code+')':''));process.exitCode=1;});
