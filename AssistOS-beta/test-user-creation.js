// Test user creation with correct field names
const testData = {
  firstName: "John",
  lastName: "Doe", 
  email: "john@example.com",
  phone: "+1234567890"
};

console.log('Test data for user creation:');
console.log(JSON.stringify(testData, null, 2));

console.log('\nSQL INSERT equivalent:');
console.log(`INSERT INTO users (first_name, last_name, email, phone) VALUES ('${testData.firstName}', '${testData.lastName}', '${testData.email}', '${testData.phone}');`);

// Test with curl to create user directly
console.log('\nDirect API test:');
console.log(`curl 'http://localhost:5000/api/users' \\
  -X 'POST' \\
  -H 'Content-Type: application/json' \\
  -b 'connect.sid=s%3AckxqHSCvl412aKOHpJQVj_Z6e2FKg45U.9qln%2F0v8bcX1f7nKzOswaHgtDv5i4RnVkT6GJcY58%2Bs' \\
  --data-raw '${JSON.stringify(testData)}'`);