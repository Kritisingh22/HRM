const fs = require('fs');
const path = require('path');

const files = [
  'src/workspaces/employee/pages/EmployeeCertificationsPage.jsx',
  'src/workspaces/employee/pages/EmployeeDashboard.jsx',
  'src/workspaces/employee/pages/EmployeeDocumentsPage.jsx',
  'src/workspaces/employee/pages/EmployeePayrollPage.jsx',
  'src/workspaces/employee/pages/EmployeePayslipRequestsPage.jsx',
  'src/workspaces/employee/pages/EmployeeTrainingPage.jsx',
  'src/workspaces/employee/pages/MyManagerPage.jsx',
  'src/workspaces/hr/pages/DepartmentsPage.jsx',
  'src/workspaces/hr/pages/EmployeesPage.jsx',
  'src/workspaces/hr/pages/HRCalendarPolicyPage.jsx',
  'src/workspaces/hr/pages/HRCertificationsPage.jsx',
  'src/workspaces/hr/pages/HRDashboard.jsx',
  'src/workspaces/hr/pages/HREmployeeDocumentsPage.jsx',
  'src/workspaces/hr/pages/HRLeaveTypesPage.jsx',
  'src/workspaces/hr/pages/HRPayslipRequestsPage.jsx',
  'src/workspaces/hr/pages/HRSalaryStructuresPage.jsx',
  'src/workspaces/hr/pages/HRTrainingPage.jsx',
  'src/workspaces/hr/pages/HRDashboard.jsx',
  'src/workspaces/hr/pages/PayrollPage.jsx',
  'src/workspaces/hr/pages/RecruitmentPage.jsx',
  'src/workspaces/hr/pages/SettingsPage.jsx',
  'src/workspaces/hr/pages/TransferPage.jsx',
  'src/workspaces/hr/pages/UsersPage.jsx',
  'src/workspaces/manager/pages/ManagerCertificationsPage.jsx',
  'src/workspaces/manager/pages/ManagerDashboard.jsx',
  'src/workspaces/manager/pages/ManagerDocumentsPage.jsx',
  'src/workspaces/manager/pages/ManagerPayrollPage.jsx',
  'src/workspaces/manager/pages/ManagerTrainingPage.jsx',
  'src/workspaces/manager/pages/MyTeamPage.jsx',
  'src/workspaces/manager/pages/RequirementPage.jsx',
  'src/workspaces/manager/pages/TeamLeaveApprovalsPage.jsx',
  'src/workspaces/manager/pages/TeamPayslipRequestsPage.jsx',
];

function replaceImports(content) {
  let result = content;
  
  // HR pages (3 levels from src): ../../components/ (wrong, should be ../../../) -> ui
  // Also handle ../../../components/ -> ui
  // Employee/Manager pages (4 levels from src): ../../../components/ -> ui
  
  // Replace ../../components/ui with ui (2 levels up - wrong but exists in HR pages)
  result = result.replace(/from\s+['"](\.\.\/){2}components\/ui['"]/g, "from 'ui'");
  
  // Replace ../../../components/ui with ui (3 levels up from src = HR pages)
  result = result.replace(/from\s+['"](\.\.\/){3}components\/ui['"]/g, "from 'ui'");
  
  // Replace ../../../../components/ui with ui (4 levels up from src = employee/manager pages)
  result = result.replace(/from\s+['"](\.\.\/){4}components\/ui['"]/g, "from 'ui'");
  
  // Replace ../../../../../components/ui with ui (5 levels)
  result = result.replace(/from\s+['"](\.\.\/){5}components\/ui['"]/g, "from 'ui'");
  
  // Replace ../../../../../components/ui with ui (6 levels)
  result = result.replace(/from\s+['"](\.\.\/){6}components\/ui['"]/g, "from 'ui'");
  
  // Replace ../../components/Toast with ui (2 levels up - wrong but exists in HR pages)
  result = result.replace(/from\s+['"](\.\.\/){2}components\/Toast['"]/g, "from 'ui'");
  
  // Replace ../../../components/Toast with ui (3 levels up from src = HR pages)
  result = result.replace(/from\s+['"](\.\.\/){3}components\/Toast['"]/g, "from 'ui'");
  
  // Replace ../../../../components/Toast with ui (4 levels up from src = employee/manager pages)
  result = result.replace(/from\s+['"](\.\.\/){4}components\/Toast['"]/g, "from 'ui'");
  
  // Replace ../../../../../components/Toast with ui (5 levels)
  result = result.replace(/from\s+['"](\.\.\/){5}components\/Toast['"]/g, "from 'ui'");
  
  // Replace ../../components/form with ui (2 levels up - wrong but exists in HR pages)
  result = result.replace(/from\s+['"](\.\.\/){2}components\/form['"]/g, "from 'ui'");
  
  // Replace ../../../components/form with ui (3 levels up from src = HR pages)
  result = result.replace(/from\s+['"](\.\.\/){3}components\/form['"]/g, "from 'ui'");
  
  // Replace ../../../../components/form with ui (4 levels up from src = employee/manager pages)
  result = result.replace(/from\s+['"](\.\.\/){4}components\/form['"]/g, "from 'ui'");
  
  // Replace ../../../../../components/form with ui (5 levels)
  result = result.replace(/from\s+['"](\.\.\/){5}components\/form['"]/g, "from 'ui'");
  
  // Replace ../../components/columns with ui (2 levels up - wrong but exists in HR pages)
  result = result.replace(/from\s+['"](\.\.\/){2}components\/columns['"]/g, "from 'ui'");
  
  // Replace ../../../components/columns with ui (3 levels up from src = HR pages)
  result = result.replace(/from\s+['"](\.\.\/){3}components\/columns['"]/g, "from 'ui'");
  
  // Replace ../../../../components/columns with ui (4 levels up from src = employee/manager pages)
  result = result.replace(/from\s+['"](\.\.\/){4}components\/columns['"]/g, "from 'ui'");
  
  // Replace ../../../../../components/columns with ui (5 levels)
  result = result.replace(/from\s+['"](\.\.\/){5}components\/columns['"]/g, "from 'ui'");
  
  // Replace ../../components/DataTable with ui (2 levels up - wrong but exists in HR pages)
  result = result.replace(/from\s+['"](\.\.\/){2}components\/DataTable['"]/g, "from 'ui'");
  
  // Replace ../../../components/DataTable with ui (3 levels up from src = HR pages)
  result = result.replace(/from\s+['"](\.\.\/){3}components\/DataTable['"]/g, "from 'ui'");
  
  // Replace ../../../../components/DataTable with ui (4 levels up from src = employee/manager pages)
  result = result.replace(/from\s+['"](\.\.\/){4}components\/DataTable['"]/g, "from 'ui'");
  
  // Replace ../../../../../components/DataTable with ui (5 levels)
  result = result.replace(/from\s+['"](\.\.\/){5}components\/DataTable['"]/g, "from 'ui'");
  
  // Replace ../../components/initials with ui (2 levels up - wrong but exists in HR pages)
  result = result.replace(/from\s+['"](\.\.\/){2}components\/initials['"]/g, "from 'ui'");
  
  // Replace ../../../components/initials with ui (3 levels up from src = HR pages)
  result = result.replace(/from\s+['"](\.\.\/){3}components\/initials['"]/g, "from 'ui'");
  
  // Replace ../../../../components/initials with ui (4 levels up from src = employee/manager pages)
  result = result.replace(/from\s+['"](\.\.\/){4}components\/initials['"]/g, "from 'ui'");
  
  // Replace ../../../../../components/initials with ui (5 levels)
  result = result.replace(/from\s+['"](\.\.\/){5}components\/initials['"]/g, "from 'ui'");
  
  // Replace ../../../ui with ui (for HR pages which are 3 levels up from src)
  result = result.replace(/from\s+['"](\.\.\/){3}ui['"]/g, "from 'ui'");
  
  // Replace ../../ui with ui (for HR pages with wrong depth)
  result = result.replace(/from\s+['"](\.\.\/){2}ui['"]/g, "from 'ui'");
  
  // Replace ../../../../ui with ui (for employee/manager pages which are 4 levels up from src)
  result = result.replace(/from\s+['"](\.\.\/){4}ui['"]/g, "from 'ui'");
  
  // Replace ../../../../../ui with ui (5 levels)
  result = result.replace(/from\s+['"](\.\.\/){5}ui['"]/g, "from 'ui'");
  
  // Replace ../../../../../../ui with ui (6 levels)
  result = result.replace(/from\s+['"](\.\.\/){6}ui['"]/g, "from 'ui'");
  
  return result;
}

const baseDir = __dirname;

for (const file of files) {
  const fullPath = path.join(baseDir, file);
  if (!fs.existsSync(fullPath)) {
    console.log('Not found:', file);
    continue;
  }
  
  let content = fs.readFileSync(file, 'utf8');
  let originalContent = content;
  
  content = replaceImports(content);
  
  if (content !== originalContent) {
    fs.writeFileSync(file, content);
    console.log('Updated:', file);
  }
}