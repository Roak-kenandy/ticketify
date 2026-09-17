// Test script to verify the createActivity method works with the provided request attributes

const testData = {
  "name": "Test Room",
  "description": "Test Please ignore", 
  "type_id": "57fe0cf0-5b86-4561-8ccb-ceeb3fbef462",
  "date": 1756080000,
  "notes": "This is a test",
  "custom_fields": [],
  "assigned_to": {
    "user_id": null,
    "team_id": "aac0b9c0-fc77-45c3-8cac-b458eedc613a"
  },
  "linked_to": [
    {
      "type": "CONTACT",
      "id": "852b04ea-456f-493d-8e41-966522adf3bf"
    },
    {
      "type": "SERVICE_REQUEST",
      "id": "c5e9aab9-bc2b-4a08-b2a9-4b66bd0eddb0"
    }
  ]
};

console.log('Test data for createActivity:');
console.log(JSON.stringify(testData, null, 2));

// You can test this by making a POST request to your endpoint:
// curl -X POST http://localhost:3000/activities \
//   -H "Content-Type: application/json" \
//   -d '${JSON.stringify(testData)}'

console.log('\nTo test this endpoint, run:');
console.log(`curl -X POST http://localhost:3000/activities \\`);
console.log(`  -H "Content-Type: application/json" \\`);
console.log(`  -d '${JSON.stringify(testData)}'`);
