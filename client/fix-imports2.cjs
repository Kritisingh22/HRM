const fs = require('fs');
const path = require('path');

const files = [
  'src/workspaces/hr/pages/RecruitmentPage.jsx',
  'src/workspaces/hr/pages/TransferPage.jsx',
  'src/workspaces/hr/pages/UsersPage.jsx',
  'src/workspaces/hr/pages/SettingsPage.jsx',
  'src/workspaces/hr/pages/DepartmentsPage.jsx',
  'src/workspaces/hr/pages/HRLeaveTypesPage.jsx',
  'src/workspaces/hr/pages/HRCertificationsPage.jsx',
  'src/workspaces/hr/pages/HRTrainingPage.jsx',
  'src/workspaces/hr/pages/HRCalendarPolicyPage.jsx',
  'src/workspaces/hr/pages/HRSalaryStructuresPage.jsx',
  'src/workspaces/hr/pages/HREmployeeDocumentsPage.jsx',
  'src/workspaces/hr/pages/HRPayslipRequestsPage.jsx',
  'src/workspaces/manager/pages/ManagerCertificationsPage.jsx',
  'src/workspaces/manager/pages/ManagerDocumentsPage.jsx',
  'src/workspaces/manager/pages/ManagerTrainingPage.jsx',
  'src/workspaces/manager/pages/MyTeamPage.jsx',
  'src/workspaces/manager/pages/RequirementPage.jsx',
  'src/workspaces/manager/pages/TeamLeaveApprovalsPage.jsx',
  'src/workspaces/manager/pages/TeamPayslipRequestsPage.jsx',
  'src/workspaces/manager/pages/ManagerPayrollPage.jsx',
  'src/workspaces/manager/pages/ManagerDashboard.jsx',
  'src/workspaces/employee/pages/EmployeeCertificationsPage.jsx',
  'src/workspaces/employee/pages/EmployeeDocumentsPage.jsx',
  'src/workspaces/employee/pages/EmployeeTrainingPage.jsx',
  'src/workspaces/employee/pages/EmployeePayrollPage.jsx',
  'src/workspaces/employee/pages/EmployeePayslipRequestsPage.jsx',
  'src/workspaces/employee/pages/MyManagerPage.jsx',
];

for (const file of files) {
  const fullPath = path.join(__dirname, file);
  if (!fs.existsSync(fullPath)) {
    console.log('Not found:', file);
    continue;
  }
  
  let content = fs.readFileSync(file, 'utf8');
  let originalContent = content;
  
  // Fix DataTable import
  content = content.replace(/import DataTable from 'ui';/g, "import { DataTable } from 'ui';");
  
  // Fix Modal import
  content = content.replace(/import Modal from '\.\.\/\.\.\/\.\.\/components\/Modal';/g, "");
  content = content.replace(/import Modal from '\.\.\/\.\.\/components\/Modal';/g, "");
  
  // Add Modal to the ui import if not already there
  if (content.includes("import {") && content.includes("from 'ui';")) {
    // Check if Modal is already imported from ui
    if (!content.match(/import \{[^}]*Modal[^}]*\} from 'ui';/)) {
      // Add Modal to the existing ui import
      content = content.replace(/import \{([^}]*)\} from 'ui';/, (match, imports) => {
        const importsList = imports.split(',').map(s => s.trim()).filter(s => s);
        if (!importsList.includes('Modal')) {
          importsList.push('Modal');
        }
        return `import { ${importsList.join(', ')} } from 'ui';`;
      });
    }
  }
  
  // Also fix any remaining default imports for DataTable
  content = content.replace(/import DataTable from 'ui';/g, "import { DataTable } from 'ui';");
  
  if (content !== originalContent) {
    fs.writeFileSync(file, content);
    console.log('Updated:', file);
  }
}