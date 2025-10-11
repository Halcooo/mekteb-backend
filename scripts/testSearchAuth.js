import fetch from "node-fetch";

async function testWithAuth() {
  try {
    console.log("Testing with authentication...");

    // First, let's try to login with a test user
    const loginResponse = await fetch("http://localhost:5000/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        username: "admin",
        password: "admin",
      }),
    });

    const loginData = await loginResponse.json();
    console.log("Login response:", loginData);

    if (!loginData.success) {
      console.log("Login failed, trying to register...");

      // Try to register a test user
      const registerResponse = await fetch(
        "http://localhost:5000/api/auth/register",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            username: "testuser2",
            password: "testpass",
            email: "test2@example.com",
            firstName: "Test",
            lastName: "User",
            role: "admin",
          }),
        }
      );

      const registerData = await registerResponse.json();
      console.log("Register response:", registerData);

      if (registerData.success) {
        // Use the token from registration
        const token = registerData.accessToken;
        await testSearchWithToken(token);
      }
    } else {
      // Use the token from login
      const token = loginData.accessToken;
      await testSearchWithToken(token);
    }
  } catch (error) {
    console.error("Error testing with auth:", error);
  }
}

async function testSearchWithToken(token) {
  console.log("\n=== Testing search with auth token ===");

  try {
    // Test without search (should return all students)
    const allResponse = await fetch(
      "http://localhost:5000/api/students?page=1&limit=5&search=",
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
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
      "http://localhost:5000/api/students?page=1&limit=10&search=bob",
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
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
    console.error("Error testing search with token:", error);
  }
}

testWithAuth();
