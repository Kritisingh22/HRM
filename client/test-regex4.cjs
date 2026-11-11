const fs = require('fs');
const content = fs.readFileSync('src/workspaces/hr/pages/HRSalaryStructuresPage.jsx', 'utf8');
console.log('All from matches:');
const regex = /from\s+['"]([^'"]+)['"]/g;
let match;
while ((match = regex.exec(content)) !== null) {
  console.log(match[1]);
}