const fs = require('fs');
const content = fs.readFileSync('payrollController.js', 'utf8');
const lines = content.split('\n');
let braceCount = 0;
let parenCount = 0;
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  for (const char of line) {
    if (char === '{') braceCount++;
    if (char === '}') braceCount--;
    if (char === '(') parenCount++;
    if (char === ')') parenCount--;
  }
  if (braceCount !== 0 || parenCount !== 0) {
    console.log(`Line ${i+1}: brace=${braceCount}, paren=${parenCount} | ${line.trim()}`);
  }
}
console.log('Final: brace=' + braceCount + ', paren=' + parenCount);