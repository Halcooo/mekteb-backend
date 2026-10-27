import mysql from "mysql2/promise";
import "./config/environment";

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  port: Number(process.env.DB_PORT),
  // Birthdays and attendance are calendar dates, not timezone-dependent instants.
  dateStrings: ['DATE'],
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

export default pool;
