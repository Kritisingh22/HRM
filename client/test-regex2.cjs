const fs = require('fs');
const content = fs.readFileSync('src/workspaces/hr/pages/HRSalaryStructuresPage.jsx', 'utf8');
// Print first 300 chars
console.log(content.substring(0, 300));