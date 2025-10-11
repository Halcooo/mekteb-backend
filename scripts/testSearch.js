import fetch from "node-fetch";

async function testSearch() {
  try {
    console.log("Testing search API...");

    // Test without search (should return all students)
    const allResponse = await fetch(
      "http://localhost:5000/api/students?page=1&limit=5&search="
    );
    const allData = await allResponse.json();
    console.log("\n=== All Students (no search) ===");
    console.log(`Found ${allData.data?.length || 0} students`);
    if (allData.data) {
      allData.data.forEach((student) => {
        console.log(
          `- ${student.firstName} ${student.lastName} (${student.gradeLevel})`
        );
      });
    }

    // Test with search for "bob"
    const searchResponse = await fetch(
      "http://localhost:5000/api/students?page=1&limit=10&search=bob"
    );
    const searchData = await searchResponse.json();
    console.log('\n=== Search Results for "bob" ===');
    console.log(`Found ${searchData.data?.length || 0} students`);
    if (searchData.data) {
      searchData.data.forEach((student) => {
        console.log(
          `- ${student.firstName} ${student.lastName} (${student.gradeLevel})`
        );
      });
    } else {
      console.log("No data found or error:", searchData);
    }
  } catch (error) {
    console.error("Error testing search:", error);
  }
}

testSearch();
