const fs = require('fs');
const content = fs.readFileSync('src/workspaces/hr/pages/HRSalaryStructuresPage.jsx', 'utf8');
console.log('Test 1:', content.match(/from\s+['"]/g));
console.log('Test 2:', content.match(/from\s+'/g));
console.log('Test 3:', content.match(/from\s+['"](\.\.\/){3}/g));
console.log('Test 4:', content.match(/from\s+['"](\.\.\/){3}components/g));
console.log('Test 5:', content.match(/from\s+['"](\.\.\/){3}components\/ui/g));
console.log('Test 6:', content.match(/from\s+['"](\.\.\/){3}components\/ui['"]/g));