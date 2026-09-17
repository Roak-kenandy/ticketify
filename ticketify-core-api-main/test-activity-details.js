// Test script for the activity details endpoint

// Example activity ID (UUID format)
const exampleActivityId = "57fe0cf0-5b86-4561-8ccb-ceeb3fbef462";

console.log('Testing Activity Details Endpoint');
console.log('==================================');

console.log(`\n1. Get activity details for ID: ${exampleActivityId}`);
console.log('curl command:');
console.log(`curl -X GET http://localhost:3000/activities/${exampleActivityId} \\`);
console.log(`  -H "Accept: application/json"`);

console.log('\n2. JavaScript/TypeScript example:');
console.log(`
const getActivityDetails = async (activityId) => {
  try {
    const response = await fetch(\`/activities/\${activityId}\`);
    
    if (!response.ok) {
      throw new Error(\`HTTP error! status: \${response.status}\`);
    }
    
    const activityDetails = await response.json();
    console.log('Activity Details:', activityDetails);
    return activityDetails;
  } catch (error) {
    console.error('Error fetching activity details:', error);
    throw error;
  }
};

// Usage
getActivityDetails('${exampleActivityId}');
`);

console.log('\n3. Expected Response Format:');
console.log(`{
  "id": "57fe0cf0-5b86-4561-8ccb-ceeb3fbef462",
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
  ],
  "created_at": "2024-01-15T10:30:00Z",
  "updated_at": "2024-01-15T11:45:00Z"
}`);

console.log('\n4. Error Responses:');
console.log('404 Not Found:');
console.log(`{
  "statusCode": 403,
  "message": "Activity with ID 57fe0cf0-5b86-4561-8ccb-ceeb3fbef462 not found"
}`);

console.log('\n5. Frontend Integration Example:');
console.log(`
// React Hook
const useActivityDetails = (activityId) => {
  const [activity, setActivity] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchActivity = async () => {
      try {
        setLoading(true);
        const response = await fetch(\`/activities/\${activityId}\`);
        
        if (!response.ok) {
          throw new Error('Activity not found');
        }
        
        const data = await response.json();
        setActivity(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    if (activityId) {
      fetchActivity();
    }
  }, [activityId]);

  return { activity, loading, error };
};
`);
