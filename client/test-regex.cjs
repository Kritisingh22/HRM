const fs = require('fs');
const content = fs.readFileSync('src/workspaces/hr/pages/HRSalaryStructuresPage.jsx', 'utf8');
const regex = /from\s+['"](\.\.\/){3}components\/ui['"]/g;
console.log('Match:', content.match(regex));