const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

async function testLogin() {
  console.log('Testing login API...\n');
  
  // Test 1: Login with correct credentials
  console.log('Test 1: Correct credentials');
  const res1 = await fetch('http://localhost:5000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      email: 'demo.hr.one@cyethack.demo', 
      password: 'DemoHR123!',
      remember: true 
    })
  });
  const data1 = await res1.json();
  console.log('Status:', res1.status);
  console.log('Response:', JSON.stringify(data1, null, 2));
  console.log('Cookies:', res1.headers.get('set-cookie'));
  
  // Test 2: Check if maybe there's a CORS issue
  console.log('\n\nTest 2: With Origin header');
  const res2 = await fetch('http://localhost:5000/api/auth/login', {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Origin': 'http://localhost:5173'
    },
    body: JSON.stringify({ 
      email: 'demo.hr.one@cyethack.demo', 
      password: 'DemoHR123!',
      remember: true 
    })
  });
  const data2 = await res2.json();
  console.log('Status:', res2.status);
  console.log('Response:', JSON.stringify(data2, null, 2));
  
  // Test 3: Check the /api/auth/me endpoint with a token
  if (data1.accessToken) {
    console.log('\n\nTest 3: /api/auth/me with token');
    const res3 = await fetch('http://localhost:5000/api/auth/me', {
      headers: { 'Authorization': `Bearer ${data1.accessToken}` }
    });
    const data3 = await res3.json();
    console.log('Status:', res3.status);
    console.log('Response:', JSON.stringify(data3, null, 2));
  }
}

testLogin().catch(console.error);