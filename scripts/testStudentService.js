// Direct service test - bypassing HTTP layer
import { StudentService } from "../dist/services/studentService.js";

async function testStudentService() {
  try {
    console.log("Testing StudentService directly...\n");

    // Test 1: Get all students without search
    console.log("=== Test 1: All students (page 1, limit 10) ===");
    const allStudents = await StudentService.getAllStudents(1, 10, "");
    console.log(`Total students: ${allStudents.totalCount}`);
    console.log(`Students returned: ${allStudents.students.length}`);
    console.log("First few students:");
    allStudents.students.slice(0, 3).forEach((student) => {
      console.log(`  - ${student.firstName} ${student.lastName}`);
    });

    console.log('\n=== Test 2: Search for "bob" ===');
    const bobSearch = await StudentService.getAllStudents(1, 10, "bob");
    console.log(`Students found: ${bobSearch.totalCount}`);
    console.log(`Students returned: ${bobSearch.students.length}`);
    console.log("Bob students:");
    bobSearch.students.forEach((student) => {
      console.log(`  - ${student.firstName} ${student.lastName}`);
    });

    console.log(
      "\n=== Test 3: Search for empty string (should return all) ==="
    );
    const emptySearch = await StudentService.getAllStudents(1, 10, "");
    console.log(`Students found: ${emptySearch.totalCount}`);
    console.log(`Students returned: ${emptySearch.students.length}`);

    console.log('\n=== Test 4: Search for "john" ===');
    const johnSearch = await StudentService.getAllStudents(1, 10, "john");
    console.log(`Students found: ${johnSearch.totalCount}`);
    console.log(`Students returned: ${johnSearch.students.length}`);
    console.log("John students:");
    johnSearch.students.forEach((student) => {
      console.log(`  - ${student.firstName} ${student.lastName}`);
    });
  } catch (error) {
    console.error("Error testing StudentService:", error);
  }
}

testStudentService();
