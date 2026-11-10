const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

async function testLogin(email, password, label) {
  try {
    const res = await fetch('http://localhost:5000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, remember: true })
    });
    const data = await res.json();
    if (res.ok) {
      console.log(`✅ ${label} LOGIN SUCCESS`);
      console.log(`   User: ${data.user.fullName} (${data.user.role})`);
      console.log(`   Portal: ${data.user.portal}`);
      return data;
    } else {
      console.log(`❌ ${label} LOGIN FAILED: ${data.message || JSON.stringify(data)}`);
      return null;
    }
  } catch (err) {
    console.log(`❌ ${label} ERROR: ${err.message}`);
    return null;
  }
}

async function run() {
  console.log('Testing demo account logins...\n');
  
  await testLogin('demo.hr.one@cyethack.demo', 'DemoHR123!', 'HR One');
  console.log('');
  await testLogin('demo.manager.one@cyethack.demo', 'DemoMGR123!', 'Manager One');
  console.log('');
  await testLogin('demo.employee.one@cyethack.demo', 'DemoEMP123!', 'Employee One');
}

run();