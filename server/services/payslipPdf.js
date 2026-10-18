/* Professional payslip PDF generator (invoice-style A4 document).

   The document is built ONLY from the authorized payroll record and its
   populated employee — nothing is invented, no amounts are recalculated and
   nothing is written back to MongoDB. Sections:
     A. Company header (official logo + name; optional configured contact block)
     B. Employee details
     C. Salary breakdown — earnings / deductions tables
     D. Net salary summary + payment details (+ reconciliation flag if the
        stored net does not equal gross − deductions)
     E. Footer — computer-generated notice, company name, page numbering

   Uses pdf-lib (already a dependency). Standard PDF fonts are WinAnsi, so the
   currency is rendered with its ISO code (e.g. "INR 25,000.00") instead of the
   ₹ glyph, which those fonts cannot encode. */
'use strict';

const fs = require('fs');
const path = require('path');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');

/* ---------------- brand palette (matches the portal theme) ---------------- */
const BRAND = rgb(0.31, 0.54, 0.5);       // #4F8A7F teal
const BRAND_DARK = rgb(0.18, 0.24, 0.32); // #2E3C52
const INK = rgb(0.07, 0.09, 0.13);
const MUTED = rgb(0.42, 0.45, 0.5);
const LINE = rgb(0.88, 0.9, 0.92);
const SOFT_BG = rgb(0.97, 0.98, 0.98);
const TEAL_TINT = rgb(0.91, 0.95, 0.94);
const ROSE_TINT = rgb(0.99, 0.94, 0.94);
const DANGER = rgb(0.72, 0.16, 0.16);
const WHITE = rgb(1, 1, 1);

/* ---------------- layout constants ---------------- */
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const M = 45;                       // page margin
const CONTENT_W = PAGE_W - M * 2;
const RIGHT = PAGE_W - M;
const ROW_H = 17;
const HEAD_H = 22;
const FOOTER_ZONE = 34;             // reserved at the bottom of every page

const LOGO_PNG = path.join(__dirname, '..', 'assets', 'cyethack-logo.png');

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

let logoBytesCache;

/** The original logo asset, converted to PNG for PDF embedding (read once). */
function loadLogoBytes() {
  if (logoBytesCache !== undefined) return logoBytesCache;
  try {
    logoBytesCache = fs.readFileSync(LOGO_PNG);
  } catch {
    logoBytesCache = null; // header still renders (name + period), just without the mark
  }
  return logoBytesCache;
}

/* ---------------- formatting helpers ---------------- */
function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** `INR 1,23,456.00` — the currency code + Indian digit grouping. */
function money(value, currency) {
  const code = (currency || 'INR').toUpperCase();
  const n = toNumber(value);
  return `${code} ${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  // Stored payroll dates are UTC midnights — format them in UTC so the day
  // never shifts with the viewer's timezone.
  return `${String(d.getUTCDate()).padStart(2, '0')} ${MONTHS[d.getUTCMonth()].slice(0, 3)} ${d.getUTCFullYear()}`;
}

/** `2026-08` → `August 2026`; falls back to the raw key. */
function periodLabel(period) {
  const [y, m] = String(period || '').split('-').map(Number);
  if (!y || !m || m < 1 || m > 12) return String(period || '—');
  return `${MONTHS[m - 1]} ${y}`;
}

function titleCase(key) {
  return String(key)
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^./, (c) => c.toUpperCase());
}

/** Known component labels; unknown keys fall back to a title-cased name. */
const DEDUCTION_LABELS = {
  pf: 'Provident Fund (PF)',
  tds: 'Income Tax (TDS)',
  esi: 'Employee State Insurance (ESI)',
  professionalTax: 'Professional Tax',
  pt: 'Professional Tax',
  other: 'Other authorized deductions',
  loanAdvance: 'Loan / salary advance'
};

const ALLOWANCE_LABELS = {
  transport: 'Transport allowance',
  conveyance: 'Conveyance allowance',
  medical: 'Medical allowance',
  special: 'Special allowance',
  hra: 'House rent allowance (HRA)'
};

/** Text that never overflows its column — ellipsised with an ASCII marker. */
function fitText(text, font, size, maxWidth) {
  let s = String(text == null ? '' : text);
  if (font.widthOfTextAtSize(s, size) <= maxWidth) return s;
  while (s.length > 1 && font.widthOfTextAtSize(s + '...', size) > maxWidth) {
    s = s.slice(0, -1);
  }
  return s + '...';
}

/** Masked account number — only the last 4 digits are ever shown. */
function maskAccount(accountNumber) {
  const digits = String(accountNumber || '').replace(/\s+/g, '');
  if (!digits) return null;
  const tail = digits.slice(-4);
  return tail ? `XXXXXX${tail}` : null;
}

/** Entries of a Mongoose Map or a plain object (salary allowances etc.). */
function entriesOf(value) {
  if (!value) return [];
  if (typeof value.entries === 'function' && !Array.isArray(value)) {
    try {
      return Array.from(value.entries());
    } catch {
      return [];
    }
  }
  if (typeof value === 'object') return Object.entries(value);
  return [];
}

/* ---------------- document data assembly ---------------- */

/**
 * Turn the payroll record into the exact display rows for the PDF.
 * Amounts come from the record; a component list is only used when it is the
 * record's own linked salary structure AND it reconciles with the recorded
 * gross. Otherwise the record's gross is shown as a single consolidated line.
 */
function buildBreakdown(payroll, salaryStructure) {
  const gross = toNumber(payroll.gross);
  const earnings = [];

  const structure = salaryStructure && typeof salaryStructure === 'object' ? salaryStructure : null;
  if (structure) {
    const basic = toNumber(structure.basic);
    const hra = toNumber(structure.hra);
    const allowances = entriesOf(structure.allowances);
    const componentSum = basic + hra + allowances.reduce((sum, [, v]) => sum + toNumber(v), 0);

    // Use the linked structure's components only when they add up to the
    // recorded gross — never display figures that contradict the record.
    if (componentSum > 0 && Math.abs(componentSum - gross) < 0.5) {
      if (basic) earnings.push(['Basic salary', basic]);
      if (hra) earnings.push(['House rent allowance (HRA)', hra]);
      for (const [key, value] of allowances) {
        if (toNumber(value) !== 0) earnings.push([ALLOWANCE_LABELS[key] || titleCase(key), toNumber(value)]);
      }
    }
  }

  if (earnings.length === 0) {
    // The payroll model stores a single gross amount — show it honestly.
    earnings.push(['Consolidated salary', gross]);
  }

  const grossFromRows = earnings.reduce((sum, [, v]) => sum + v, 0);

  const rawDeductions = payroll.deductions && typeof payroll.deductions === 'object'
    ? (payroll.deductions.toObject ? payroll.deductions.toObject() : payroll.deductions)
    : {};
  const deductions = Object.entries(rawDeductions)
    .filter(([, v]) => toNumber(v) !== 0)
    .map(([key, value]) => [DEDUCTION_LABELS[key] || titleCase(key), toNumber(value)]);
  const totalDeductions = deductions.reduce((sum, [, v]) => sum + v, 0);

  const net = toNumber(payroll.net);
  const computedNet = grossFromRows - totalDeductions;
  // Reconciliation: prefer the stored net; flag (do not alter) a mismatch.
  const reconciled = Math.abs(computedNet - net) < 0.5;

  return { earnings, gross: grossFromRows, deductions, totalDeductions, net, computedNet, reconciled };
}

/** Payment detail rows — only fields the record actually has. */
function buildPaymentRows(payroll, employee) {
  return [
    ['Payment status', payroll.status || null],
    ['Payment date', formatDate(payroll.payDate)],
    ['Payment method', payroll.paymentMode || null],
    ['Transaction reference', payroll.transactionId || null],
    ['UTR', payroll.utr || null],
    ['Bank', employee.bankName || null],
    ['Account (masked)', maskAccount(employee.accountNumber)]
  ];
}

/* ---------------- the renderer ---------------- */

class PayslipRenderer {
  constructor(pdfDoc, fonts, options) {
    this.pdfDoc = pdfDoc;
    this.font = fonts.regular;
    this.bold = fonts.bold;
    this.company = options.company || {};
    this.currency = options.currency || 'INR';
    this.generatedAt = options.generatedAt || new Date();
    this.slip = { periodLabel: '', reference: '' };
    this.logo = null; // embedded image, set in create()
    this.pages = [];
    this.page = null;
    this.y = 0;
  }

  async create() {
    const bytes = loadLogoBytes();
    if (bytes) {
      try {
        this.logo = await this.pdfDoc.embedPng(bytes);
      } catch {
        this.logo = null;
      }
    }
    this.addPage(true);
    return this;
  }

  /* ---- low-level drawing ---- */
  text(str, x, y, { size = 9.5, font = this.font, color = INK } = {}) {
    if (str === null || str === undefined || str === '') return;
    this.page.drawText(String(str), { x, y, size, font, color });
  }

  rightText(str, rightX, y, opts = {}) {
    const { size = 9.5, font = this.font } = opts;
    const w = font.widthOfTextAtSize(String(str), size);
    this.text(str, rightX - w, y, opts);
  }

  hLine(y, { from = M, to = RIGHT, color = LINE, thickness = 0.75 } = {}) {
    this.page.drawLine({ start: { x: from, y }, end: { x: to, y }, color, thickness });
  }

  box(x, y, w, h, { fill = SOFT_BG, stroke = LINE } = {}) {
    this.page.drawRectangle({ x, y, width: w, height: h, color: fill, borderColor: stroke, borderWidth: 0.75 });
  }

  /* ---- page management ---- */
  addPage(isFirst = false) {
    this.page = this.pdfDoc.addPage([PAGE_W, PAGE_H]);
    this.pages.push(this.page);
    this.y = PAGE_H - M;

    if (isFirst) {
      this.drawHeader();
    } else {
      // Continuation header — keeps company identity on extra pages.
      this.text(this.company.name || 'CYETHACK Solution', M, this.y - 10, { size: 10, font: this.bold, color: BRAND_DARK });
      this.rightText('SALARY PAYSLIP (continued)', RIGHT, this.y - 10, { size: 9, font: this.bold, color: BRAND });
      this.y -= 18;
      this.hLine(this.y, { color: LINE });
      this.y -= 16;
    }
  }

  ensure(height) {
    if (this.y - height < M + FOOTER_ZONE) {
      this.addPage(false);
    }
  }

  /* ---- Section A: company header ---- */
  drawHeader() {
    const company = this.company;
    let textY = PAGE_H - M - 4;
    let textX = M;

    if (this.logo) {
      const h = 46;
      const w = (this.logo.width / this.logo.height) * h;
      this.page.drawImage(this.logo, { x: M, y: PAGE_H - M - h + 2, width: w, height: h });
      textX = M + w + 12;
    }

    this.text(company.name || 'CYETHACK Solution', textX, textY - 12, { size: 17, font: this.bold, color: BRAND_DARK });
    textY -= 26;

    const contactBits = [company.email, company.phone, company.website].filter(Boolean);
    const maxTextW = RIGHT - textX - 170;
    if (company.address) {
      this.text(fitText(company.address, this.font, 8.5, maxTextW), textX, textY, { size: 8.5, color: MUTED });
      textY -= 12;
    }
    if (contactBits.length) {
      this.text(fitText(contactBits.join('  |  '), this.font, 8.5, maxTextW), textX, textY, { size: 8.5, color: MUTED });
      textY -= 12;
    }

    // Document title block (right aligned)
    let blockY = PAGE_H - M - 10;
    this.rightText('SALARY PAYSLIP', RIGHT, blockY, { size: 16, font: this.bold, color: BRAND });
    blockY -= 18;
    this.rightText(`Payslip No: ${this.slip.reference}`, RIGHT, blockY, { size: 9, color: INK });
    blockY -= 13;
    this.rightText(`Payroll period: ${this.slip.periodLabel}`, RIGHT, blockY, { size: 9, color: INK });
    blockY -= 13;
    this.rightText(`Generated on: ${formatDate(this.generatedAt)}`, RIGHT, blockY, { size: 9, color: MUTED });

    // Rule under the header
    this.y = Math.min(textY, blockY) - 14;
    this.hLine(this.y, { color: LINE });
    this.hLine(this.y - 1.6, { color: BRAND, thickness: 1.6 });
    this.y -= 26;
  }

  sectionTitle(title) {
    this.ensure(HEAD_H + 46);
    this.text(title, M, this.y - 10, { size: 10.5, font: this.bold, color: BRAND_DARK });
    const w = this.bold.widthOfTextAtSize(title, 10.5);
    this.hLine(this.y - 14, { from: M, to: M + w + 4, color: BRAND, thickness: 1.2 });
    this.y -= HEAD_H + 8;
  }

  /* ---- Section B: employee details (name + 2-column grid) ---- */
  drawEmployee(name, rows) {
    const colRows = [];
    for (let i = 0; i < rows.length; i += 2) colRows.push(rows.slice(i, i + 2));

    const boxH = 44 + colRows.length * 20 + 10;
    this.sectionTitle('EMPLOYEE DETAILS');
    const top = this.y;
    this.box(M, top - boxH, CONTENT_W, boxH, { fill: SOFT_BG });

    // The employee name gets the full width so it is never truncated.
    this.text(fitText(name, this.bold, 12, CONTENT_W - 28), M + 14, top - 26, {
      size: 12, font: this.bold, color: BRAND_DARK
    });

    const colX = [M + 14, M + CONTENT_W / 2];
    const labelW = 92;
    let rowY = top - 48;
    for (const pair of colRows) {
      for (let c = 0; c < pair.length; c++) {
        const [label, value] = pair[c];
        const x = colX[c];
        this.text(label, x, rowY, { size: 8.5, color: MUTED });
        this.text(fitText(value, this.bold, 9.5, CONTENT_W / 2 - labelW - 24), x + labelW, rowY, { size: 9.5, font: this.bold, color: INK });
      }
      rowY -= 20;
    }
    this.y = top - boxH - 22;
  }

  /* ---- Section C: earnings / deductions tables ---- */
  drawSalaryTables(left, right) {
    const colW = (CONTENT_W - 16) / 2;
    const columns = [
      { x: M, width: colW, title: 'Earnings', tint: TEAL_TINT, ...left },
      { x: M + colW + 16, width: colW, title: 'Deductions', tint: ROSE_TINT, ...right }
    ];
    const rowsTotal = Math.max(left.rows.length, right.rows.length, 1);

    let index = 0;
    while (index < rowsTotal) {
      this.ensure(HEAD_H + ROW_H * 2 + 30);
      const available = this.y - (M + FOOTER_ZONE + 24);
      const maxRows = Math.max(2, Math.floor((available - HEAD_H) / ROW_H));
      const take = Math.min(maxRows, rowsTotal - index);
      const tableH = HEAD_H + take * ROW_H + 24;
      const top = this.y;

      for (const col of columns) {
        const slice = col.rows.slice(index, index + take);
        const done = index + take >= col.rows.length;

        this.box(col.x, top - tableH, col.width, tableH, { fill: WHITE });
        this.page.drawRectangle({ x: col.x, y: top - HEAD_H, width: col.width, height: HEAD_H, color: col.tint });
        this.text(col.title, col.x + 10, top - 14.5, { size: 10, font: this.bold, color: BRAND_DARK });
        this.rightText('Amount', col.x + col.width - 10, top - 14.5, { size: 8.5, font: this.bold, color: MUTED });

        let rowY = top - HEAD_H - 12;
        for (const [label, value] of slice) {
          this.text(fitText(label, this.font, 9.5, col.width - 96), col.x + 10, rowY, { size: 9.5 });
          this.rightText(money(value, this.currency), col.x + col.width - 10, rowY, { size: 9.5 });
          rowY -= ROW_H;
        }

        if (done) {
          const barY = top - tableH + 4;
          this.page.drawRectangle({ x: col.x, y: barY, width: col.width, height: 20, color: TEAL_TINT });
          this.text(col.totalLabel, col.x + 10, barY + 6, { size: 9.5, font: this.bold, color: BRAND_DARK });
          this.rightText(money(col.totalValue, this.currency), col.x + col.width - 10, barY + 6, { size: 9.5, font: this.bold, color: BRAND_DARK });
        }
      }

      index += take;
      if (index < rowsTotal) {
        this.addPage(false);
      } else {
        this.y = top - tableH - 16;
      }
    }
  }

  /* ---- Section D: net salary summary + payment ---- */
  drawSummary(breakdown, paymentRows) {
    const h = 64;
    this.ensure(h + 18);
    const top = this.y;
    this.box(M, top - h, CONTENT_W, h, { fill: WHITE });

    const cellW = CONTENT_W / 3;
    for (let i = 1; i < 3; i++) {
      this.page.drawLine({
        start: { x: M + cellW * i, y: top - h + 8 },
        end: { x: M + cellW * i, y: top - 8 },
        color: LINE, thickness: 0.75
      });
    }

    const cell = (i, label, value, opts = {}) => {
      const cx = M + cellW * i + cellW / 2;
      this.page.drawText(label, {
        x: cx - this.font.widthOfTextAtSize(label, 8.5) / 2, y: top - 24,
        size: 8.5, font: this.font, color: MUTED
      });
      const f = opts.bold ? this.bold : this.font;
      const size = opts.big ? 13 : 10.5;
      const vw = f.widthOfTextAtSize(String(value), size);
      this.page.drawText(String(value), { x: cx - vw / 2, y: top - 46, size, font: f, color: opts.color || INK });
    };

    cell(0, 'TOTAL GROSS EARNINGS', money(breakdown.gross, this.currency), { bold: true });
    cell(1, 'TOTAL DEDUCTIONS', money(breakdown.totalDeductions, this.currency), { bold: true });
    cell(2, 'NET SALARY PAYABLE', money(breakdown.net, this.currency), { bold: true, big: true, color: BRAND });

    this.y = top - h - 20;

    /* Payment details */
    this.sectionTitle('PAYMENT DETAILS');
    const rows = paymentRows.filter(([, v]) => v !== null && v !== undefined && v !== '');
    const rowCount = Math.max(1, Math.ceil(rows.length / 2));
    const boxH = 14 + rowCount * 20 + 8;
    this.ensure(boxH + 14);
    const ptop = this.y;
    this.box(M, ptop - boxH, CONTENT_W, boxH, { fill: SOFT_BG });

    const colX = [M + 14, M + CONTENT_W / 2];
    let rowY = ptop - 24;
    rows.forEach(([label, value], i) => {
      const x = colX[i % 2];
      this.text(label, x, rowY, { size: 8.5, color: MUTED });
      this.text(fitText(value, this.bold, 9.5, CONTENT_W / 2 - 130), x + 110, rowY, { size: 9.5, font: this.bold });
      if (i % 2 === 1) rowY -= 20;
    });
    this.y = ptop - boxH - 12;

    /* Reconciliation flag — shown only when the stored net does not match
       gross − deductions. The stored figures are never altered. */
    if (!breakdown.reconciled) {
      this.ensure(30);
      this.text(
        fitText(
          `Reconciliation check: ${money(breakdown.computedNet, this.currency)} (gross - deductions) does not equal the stored net ${money(breakdown.net, this.currency)}. Recorded payroll values are shown unchanged and flagged for review.`,
          this.font, 8, CONTENT_W
        ),
        M, this.y - 4, { size: 8, color: DANGER }
      );
    }
  }

  /* ---- Section E: footer (drawn last, on every page) ---- */
  drawFooters() {
    const total = this.pages.length;
    const name = this.company.name || 'CYETHACK Solution';
    this.pages.forEach((page, i) => {
      const y = M - 12;
      page.drawLine({ start: { x: M, y }, end: { x: RIGHT, y }, color: LINE, thickness: 0.75 });
      page.drawText('Computer-generated payslip - no signature required.', {
        x: M, y: y - 14, size: 8, font: this.font, color: MUTED
      });
      const nameW = this.font.widthOfTextAtSize(name, 8);
      page.drawText(name, { x: PAGE_W / 2 - nameW / 2, y: y - 14, size: 8, font: this.font, color: MUTED });
      const pageLabel = `Page ${i + 1} of ${total}`;
      const pageW = this.font.widthOfTextAtSize(pageLabel, 8);
      page.drawText(pageLabel, { x: RIGHT - pageW, y: y - 14, size: 8, font: this.font, color: MUTED });
    });
  }
}

/* ---------------- public API ---------------- */

/**
 * Build the payslip PDF.
 * @param {{ payroll: object, employee: object, salaryStructure?: object|null,
 *           company?: object, currency?: string, generatedAt?: Date }} input
 * @returns {Promise<Uint8Array>} PDF bytes
 */
async function buildPayslipPdf({ payroll, employee, salaryStructure, company, currency, generatedAt }) {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.setTitle(`Salary Payslip - ${employee.employeeId} - ${payroll.period}`);
  pdfDoc.setAuthor(company?.name || 'CYETHACK Solution');
  pdfDoc.setSubject(`Salary payslip for ${periodLabel(payroll.period)}`);
  pdfDoc.setCreator('CYETHACK HRM Portal');
  pdfDoc.setProducer('CYETHACK HRM Portal (pdf-lib)');

  const fonts = {
    regular: await pdfDoc.embedFont(StandardFonts.Helvetica),
    bold: await pdfDoc.embedFont(StandardFonts.HelveticaBold)
  };

  const renderer = new PayslipRenderer(pdfDoc, fonts, { company, currency, generatedAt });
  renderer.slip = {
    periodLabel: periodLabel(payroll.period),
    reference: payroll.reference || String(payroll._id || '')
  };
  await renderer.create();

  const breakdown = buildBreakdown(payroll, salaryStructure);
  const paymentRows = buildPaymentRows(payroll, employee);

  /* Section B — employee details (available fields only). */
  const employeeRows = [
    ['Employee ID', employee.employeeId || '—'],
    ['Designation', employee.designation || null],
    ['Department', employee.department || null],
    ['Work location', employee.location || null],
    ['Employment type', employee.employmentType || null],
    ['Date of joining', formatDate(employee.joiningDate)],
    ['Payroll month', periodLabel(payroll.period)],
    ['Payment date', formatDate(payroll.payDate)],
    ['Payslip status', payroll.status || null]
  ].filter(([, v]) => v !== null && v !== undefined && v !== '');

  renderer.drawEmployee(employee.fullName || employee.employeeId || '—', employeeRows);

  /* Section C — earnings / deductions. */
  renderer.sectionTitle('SALARY BREAKDOWN');
  renderer.drawSalaryTables(
    { rows: breakdown.earnings, totalLabel: 'Total gross earnings', totalValue: breakdown.gross },
    {
      rows: breakdown.deductions.length ? breakdown.deductions : [['No deductions recorded', 0]],
      totalLabel: 'Total deductions',
      totalValue: breakdown.totalDeductions
    }
  );

  /* Section D — summary + payment details. */
  renderer.drawSummary(breakdown, paymentRows);

  renderer.drawFooters();
  return pdfDoc.save();
}

/** Safe, deterministic download name — values sanitized, no secrets. */
function payslipFilename(employeeId, period) {
  const safeId = String(employeeId || '').replace(/[^A-Za-z0-9_-]+/g, '');
  const safePeriod = String(period || '').replace(/[^0-9-]+/g, '') || 'period';
  return `CYETHACK_Payslip_${safeId || 'employee'}_${safePeriod}.pdf`;
}

module.exports = { buildPayslipPdf, payslipFilename, periodLabel, money, maskAccount };
