const fs = require('fs');
const pdf = require('pdf-parse');

const data = fs.readFileSync('test_payslip.pdf');
pdf(data).then(data => {
  console.log('Pages:', data.numpages);
  console.log('Text length:', data.text.length);
  console.log('First 500 chars:', data.text.substring(0, 500));
}).catch(e => console.error(e));