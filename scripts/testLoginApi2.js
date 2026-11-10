const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

async function testLogin() {
  console.log('Testing login API with various scenarios...\n');
  
  // Test: Check the raw request body is being parsed
  console.log('Test: Raw body logging');
  const res1 = await fetch('http://localhost:5000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      email: 'demo.hr.one@cyethack.demo', 
      password: 'DemoHR123!',
      remember: true 
    })
  });
  const text = await res1.text();
  console.log('Raw response:', text);
  console.log('Status:', res1.status);
  
  // Test: Try different email format (lowercase, trim)
  console.log('\nTest: Email case sensitivity');
  const res2 = await fetch('http://localhost:5000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      email: 'DEMO.HR.ONE@CYETHACK.DEMO',  // uppercase
      password: 'DemoHR123!',
      remember: true 
    })
  });
  const text2 = await res2.text();
  console.log('Status:', res2.status);
  console.log('Response:', text2);
}

testLogin().catch(console.error);