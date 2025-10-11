import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

async function addTestStudents() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASS || "",
    database: process.env.DB_NAME || "mekteb_db",
  });

  try {
    const testStudents = [
      // Students with "bob" in their names
      {
        first_name: "Bob",
        last_name: "Johnson",
        date_of_birth: "2010-03-15",
        grade_level: "7th Grade",
      },
      {
        first_name: "Bobby",
        last_name: "Smith",
        date_of_birth: "2011-07-22",
        grade_level: "6th Grade",
      },
      {
        first_name: "Robert",
        last_name: "Wilson",
        date_of_birth: "2009-11-08",
        grade_level: "8th Grade",
      },
      {
        first_name: "Bobbie",
        last_name: "Davis",
        date_of_birth: "2012-01-14",
        grade_level: "5th Grade",
      },
      {
        first_name: "John",
        last_name: "Bobby",
        date_of_birth: "2010-05-30",
        grade_level: "7th Grade",
      },
      {
        first_name: "Alice",
        last_name: "Bobson",
        date_of_birth: "2011-09-12",
        grade_level: "6th Grade",
      },

      // Other test students
      {
        first_name: "Emma",
        last_name: "Thompson",
        date_of_birth: "2010-02-18",
        grade_level: "7th Grade",
      },
      {
        first_name: "Liam",
        last_name: "Anderson",
        date_of_birth: "2011-06-25",
        grade_level: "6th Grade",
      },
      {
        first_name: "Olivia",
        last_name: "Martinez",
        date_of_birth: "2009-12-03",
        grade_level: "8th Grade",
      },
      {
        first_name: "Noah",
        last_name: "Garcia",
        date_of_birth: "2012-04-17",
        grade_level: "5th Grade",
      },
      {
        first_name: "Ava",
        last_name: "Rodriguez",
        date_of_birth: "2010-08-09",
        grade_level: "7th Grade",
      },
      {
        first_name: "William",
        last_name: "Brown",
        date_of_birth: "2011-10-27",
        grade_level: "6th Grade",
      },
      {
        first_name: "Sophia",
        last_name: "Jones",
        date_of_birth: "2009-01-15",
        grade_level: "8th Grade",
      },
      {
        first_name: "James",
        last_name: "Miller",
        date_of_birth: "2012-07-08",
        grade_level: "5th Grade",
      },
      {
        first_name: "Isabella",
        last_name: "Taylor",
        date_of_birth: "2010-11-20",
        grade_level: "7th Grade",
      },

      // Students with Bosnian names
      {
        first_name: "Amela",
        last_name: "Hodzic",
        date_of_birth: "2010-03-12",
        grade_level: "7th Grade",
      },
      {
        first_name: "Emir",
        last_name: "Kovac",
        date_of_birth: "2011-05-18",
        grade_level: "6th Grade",
      },
      {
        first_name: "Amina",
        last_name: "Begic",
        date_of_birth: "2009-09-24",
        grade_level: "8th Grade",
      },
      {
        first_name: "Tarik",
        last_name: "Saric",
        date_of_birth: "2012-02-07",
        grade_level: "5th Grade",
      },
      {
        first_name: "Lejla",
        last_name: "Basic",
        date_of_birth: "2010-12-14",
        grade_level: "7th Grade",
      },
    ];

    console.log("Adding test students...");

    for (const student of testStudents) {
      const [result] = await connection.execute(
        "INSERT INTO students (parent_id, first_name, last_name, date_of_birth, grade_level, created_at) VALUES (?, ?, ?, ?, ?, NOW())",
        [
          null,
          student.first_name,
          student.last_name,
          student.date_of_birth,
          student.grade_level,
        ]
      );
      console.log(
        `Added: ${student.first_name} ${student.last_name} (ID: ${result.insertId})`
      );
    }

    console.log(`\nSuccessfully added ${testStudents.length} test students!`);
    console.log('\nStudents with "bob" in their names:');
    console.log("- Bob Johnson");
    console.log("- Bobby Smith");
    console.log("- Robert Wilson");
    console.log("- Bobbie Davis");
    console.log("- John Bobby");
    console.log("- Alice Bobson");
  } catch (error) {
    console.error("Error adding test students:", error);
  } finally {
    await connection.end();
  }
}

// Run the script
addTestStudents();
