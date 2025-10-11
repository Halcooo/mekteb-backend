import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

// Database connection
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  port: Number(process.env.DB_PORT),
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

async function testSearch() {
  try {
    console.log("Testing search functionality directly...");

    // Test 1: Count all students
    const [countResult] = await pool.execute(
      "SELECT COUNT(*) as total FROM students"
    );
    console.log(`Total students: ${countResult[0].total}`);

    // Test 2: Count students with "bob" in name
    const searchTerm = "bob";
    const [bobCountResult] = await pool.execute(
      "SELECT COUNT(*) as total FROM students WHERE LOWER(first_name) LIKE ? OR LOWER(last_name) LIKE ?",
      [`%${searchTerm.toLowerCase()}%`, `%${searchTerm.toLowerCase()}%`]
    );
    console.log(`Students with "bob": ${bobCountResult[0].total}`);

    // Test 3: Show all students with "bob"
    const [bobStudents] = await pool.execute(
      "SELECT id, first_name, last_name FROM students WHERE LOWER(first_name) LIKE ? OR LOWER(last_name) LIKE ?",
      [`%${searchTerm.toLowerCase()}%`, `%${searchTerm.toLowerCase()}%`]
    );
    console.log(`Students matching "${searchTerm}":`);
    bobStudents.forEach((student) => {
      console.log(`  - ${student.first_name} ${student.last_name}`);
    });

    // Test 4: Show all students (to compare)
    const [allStudents] = await pool.execute(
      "SELECT id, first_name, last_name FROM students LIMIT 10"
    );
    console.log("\nFirst 10 students in database:");
    allStudents.forEach((student) => {
      console.log(`  - ${student.first_name} ${student.last_name}`);
    });

    await pool.end();
  } catch (error) {
    console.error("Error testing search:", error);
    process.exit(1);
  }
}

testSearch();
