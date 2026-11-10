import { PDFParse } from 'pdf-parse';
import fs from 'fs';

const pdfData = fs.readFileSync('../test_payslip.pdf');
const parser = new PDFParse({ data: pdfData });
const parsed = await parser.getText({});
console.log('Pages:', parsed.numpages);
console.log('Text length:', parsed.text.length);
console.log('First 500 chars:', parsed.text.substring(0, 500));