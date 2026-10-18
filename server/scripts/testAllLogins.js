const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

async function testAllLogins() {
  const accounts = [
    { email: 'demo.hr.one@cyethack.demo', password: 'DemoHR123!', label: 'HR One' },
    { email: 'demo.hr.two@cyethack.demo', password: 'DemoHR123!', label: 'HR Two' },
    { email: 'demo.manager.one@cyethack.demo', password: 'DemoMGR123!', label: 'Manager One' },
    { email: 'demo.manager.two@cyethack.demo', password: 'DemoMGR123!', label: 'Manager Two' },
    { email: 'demo.employee.one@cyethack.demo', password: 'DemoEMP123!', label: 'Employee One' },
    { email: 'demo.employee.two@cyethack.demo', password: 'DemoEMP123!', label: 'Employee Two' },
    { email: 'demo.employee.three@cyethack.demo', password: 'DemoEMP123!', label: 'Employee Three' },
    { email: 'demo.employee.four@cyethack.demo', password: 'DemoEMP123!', label: 'Employee Four' },
    { email: 'demo.employee.five@cyethack.demo', password: 'DemoEMP123!', label: 'Employee Five' },
    { email: 'demo.employee.six@cyethack.demo', password: 'DemoEMP123!', label: 'Employee Six' },
    { email: 'demo.employee.seven@cyethack.demo', password: 'DemoEMP123!', label: 'Employee Seven' },
    { email: 'demo.employee.eight@cyethack.demo', password: 'DemoEMP123!', label: 'Employee Eight' },
    { email: 'demo.employee.nine@cyethack.demo', password: 'DemoEMP123!', label: 'Employee Nine' },
    { email: 'demo.employee.ten@cyethack.demo', password: 'DemoEMP123!', label: 'Employee Ten' },
  ];

  console.log('Testing all 14 demo accounts...\n');
  let passed = 0;
  let failed = 0;

  for (const acc of accounts) {
    const res = await fetch('http://localhost:5000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: acc.email, password: acc.password, remember: true })
    });
    const data = await res.json();
    if (res.ok) {
      console.log(`✅ ${acc.label} (${acc.email}): ${data.user.role} / ${data.user.portal}`);
      passed++;
    } else {
      console.log(`❌ ${acc.label} (${acc.email}): ${data.error}`);
      failed++;
    }
  }

  console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);
}

testAllLogins().catch(console.error);