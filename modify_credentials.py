#!/usr/bin/env python3
import re

# Read the file
with open('C:\\Users\\Utkarsh\\HRM\\client\\src\\features\\employees\\EmployeeCredentials.tsx', 'r', encoding='utf8') as f:
    content = f.read()

# 1. Add tempPasswordVisible state after the result state line
content = content.replace(
    'const [result, setResult] = useState<ResetPasswordResponse | null>(null);',
    'const [result, setResult] = useState<ResetPasswordResponse | null>(null);\n  const [tempPasswordVisible, setTempPasswordVisible] = useState(false);'
)

# 2. Add handleCopy functions after the run callback's finally block
runCallbackEnd = '    } finally {\\n      setBusy(false);\\n    }\\n  }, [employeeId, employeeName, toast, onSuccess]);'

addAfter = [
    '  const handleCopyEmail = () => {',
    '    navigator.clipboard.writeText(employeeEmail).then(() => toast(\"Email copied\")).catch(() => {/* silent fail */});',
    '  };',
    '',
    '  const handleCopyPassword = () => {',
    '    navigator.clipboard.writeText(result?.temporaryPassword || \"\").then(() => toast(\"Password copied\")).catch(() => {/* silent fail */});',
    '  };',
    '',
    '  const handleCopyAll = () => {',
    '    const creds = [',
    '      f\"Employee Name: {employeeName}\",',
    '      f\"Login Email: {employeeEmail}\",',
    '      f\"Username: {result?.username or ""}\",',
    '      f\"Temporary Password: {result?.temporaryPassword or ""}\",',
    '    ].join("\\n");',
    '    navigator.clipboard.writeText(creds).then(() => toast(\"All credentials copied\")).catch(() => {/* silent fail */});',
    '  };',
    '',
    '  // Clear result when modal closes (one-time visibility)',
    '  useEffect(() => {',
    '    if (!open):',
    '      setResult(null)',
    '  }, [open]);',
].join('\\n')

# Actually the useEffect has a syntax issue. Let me fix the approach.
# Let me just add the handleCopy functions and the useEffect separately

# Find the position and insert
pos = content.find(runCallbackEnd)
if pos >= 0:
    # Insert after the run callback
    insertPos = pos + len(runCallbackEnd)
    addBlock = '''  const handleCopyEmail = () => {
    navigator.clipboard.writeText(employeeEmail).then(() => toast("Email copied")).catch(() => {/* silent fail */});
  };

  const handleCopyPassword = () => {
    navigator.clipboard.writeText(result?.temporaryPassword || "").then(() => toast("Password copied")).catch(() => {/* silent fail */});
  };

  const handleCopyAll = () => {
    const creds = [
      f"Employee Name: {employeeName}",
      f"Login Email: {employeeEmail}",
      f"Username: {result?.username or ""}",
      f"Temporary Password: {result?.temporaryPassword or ""}",
    ].join("\n");
    navigator.clipboard.writeText(creds).then(() => toast("All credentials copied")).catch(() => {/* silent fail */});
  };

  // Clear result when modal closes (one-time visibility)
  useEffect(() => {
    if (!open) {
      setResult(null);
    }
  }, [open]);'''

    content = content[:insertPos] + '\\n' + addBlock + content[insertPos:]

# 3. Now replace the entire return statement with the new version
# This is complex, let me find the Modal start and the closing

# Actually, let me just check what we have so far and then do the full replacement
# Let me find the Modal component start for ResetPasswordDialog
modalStart = content.find('    {/* result ? ( */')
# Hmm, this is getting complex. Let me take a different approach.

# Let me just check what modifications we have so far
print("Has handleCopyEmail:", "handleCopyEmail" in content)
print("Has handleCopyPassword:", "handleCopyPassword" in content)
print("Has handleCopyAll:", "handleCopyAll" in content)
print("Has tempPasswordVisible:", "tempPasswordVisible" in content)

# Write the modified content to a temp file for inspection
with open('C:\\temp\\modified_credentials.txt', 'w', encoding='utf8') as f:
    f.write(content)

print("Done. Modified content written to temp file.")