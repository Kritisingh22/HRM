/* ============================================================
   Employee credential TXT file generation.

   Builds a professionally formatted plain-text credentials
   document from a successful password/credential reset API
   response and triggers a browser download via Blob + object URL.

   The file is generated client-side from the actual API response
   — never a second password, never stored on the server.
   ============================================================ */

export interface ResetCredentialsData {
  employeeName: string;
  employeeId?: string;
  username: string;
  email: string;
  temporaryPassword: string;
  department?: string;
  designation?: string;
  joiningDate?: string;
  mustChangePassword: boolean;
  expiresAt?: string;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function formatDate(iso?: string): string {
  if (!iso) return 'Not provided';
  try {
    const d = new Date(iso);
    return `${pad2(d.getDate())}-${pad2(d.getMonth() + 1)}-${d.getFullYear()}`;
  } catch {
    return String(iso);
  }
}

function todayFileStamp(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** Build the plain-text credentials document content. */
export function buildCredentialsTxt(c: ResetCredentialsData): string {
  const lines: string[] = [];
  lines.push('==================================================');
  lines.push('             CYETHACK HRM');
  lines.push('       EMPLOYEE LOGIN CREDENTIALS');
  lines.push('==================================================');
  lines.push('');
  lines.push('EMPLOYEE INFORMATION');
  lines.push('');
  lines.push(`Employee Name       : ${c.employeeName}`);
  lines.push(`Employee ID         : ${c.employeeId || 'Not provided'}`);
  lines.push(`Username            : ${c.username}`);
  lines.push(`Email Address       : ${c.email}`);
  lines.push(`Department          : ${c.department || 'Not assigned'}`);
  lines.push(`Designation         : ${c.designation || 'Not assigned'}`);
  lines.push(`Joining Date        : ${formatDate(c.joiningDate)}`);
  lines.push('');
  lines.push('--------------------------------------------------');
  lines.push('');
  lines.push('LOGIN CREDENTIALS');
  lines.push('');
  lines.push(`Login Username      : ${c.username}`);
  lines.push(`Temporary Password  : ${c.temporaryPassword}`);
  lines.push('');
  lines.push('--------------------------------------------------');
  lines.push('');
  lines.push('ACCOUNT SECURITY');
  lines.push('');
  lines.push(`Password Status     : Temporary Password`);
  lines.push(`Password Change     : ${c.mustChangePassword ? 'Required on First Login' : 'Not required'}`);
  lines.push(`Password Expiry     : ${c.expiresAt ? formatDate(c.expiresAt) : 'Not configured'}`);
  lines.push('');
  lines.push('--------------------------------------------------');
  lines.push('');
  lines.push('IMPORTANT INSTRUCTIONS');
  lines.push('');
  lines.push('1. Use the username and temporary password to log in.');
  lines.push('2. Change the temporary password immediately after the first login.');
  lines.push('3. Never share these credentials with unauthorized persons.');
  lines.push('4. Keep this file secure and delete it after securely sharing the credentials.');
  lines.push('');
  lines.push('==================================================');
  lines.push('             CYETHACK HRM');
  lines.push('==================================================');
  return lines.join('\n');
}

/** Generate a safe filename from employee id or username. */
export function credentialsFileName(c: ResetCredentialsData): string {
  const safeId = (c.employeeId || c.username || 'employee').replace(/[^a-z0-9]/gi, '_');
  return `CYETHACK_Employee_Credentials_${safeId}_${todayFileStamp()}.txt`;
}

/** Generate a text/plain Blob and trigger a browser download. */
export function downloadEmployeeCredentialsTxt(c: ResetCredentialsData): void {
  if (!c || !c.username || !c.temporaryPassword) {
    throw new Error('Incomplete credentials — cannot generate TXT file.');
  }

  const content = buildCredentialsTxt(c);
  const blob = new Blob([content], { type: 'text/plain; charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = credentialsFileName(c);
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
