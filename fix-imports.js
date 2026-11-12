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
  
  // Replace ../../../components/ui with ui
  result = result.replace(/from\s+['"](\.\.\/){4}components\/ui['"]/g, "from 'ui'");
  
  // Replace ../../components/ui with ../../../ui
  result = result.replace(/from\s+['"](\.\.\/){3}components\/ui['"]/g, "from '../../../ui'");
  
  // Replace ../../../../../components/ui with ui (5 levels)
  result = result.replace(/from\s+['"](\.\.\/){5}components\/ui['"]/g, "from 'ui'");
  
  // Replace ../../../../../components/ui with ui (6 levels)
  result = result.replace(/from\s+['"](\.\.\/){6}components\/ui['"]/g, "from 'ui'");
  
  // 4 levels up
  result = result.replace(/from\s+['"](\.\.\/){4}components\/ui['"]/g, "from 'ui'");
  
  // 3 levels up
  result = result.replace(/from\s+['"](\.\.\/){3}components\/ui['"]/g, "from '../../../ui'");
  
  return result;
}

for (const file of files) {
  const fullPath = path.join(__dirname, file);
  if (!fs.existsSync(fullPath)) {
    console.log('Not found:', file);
    continue;
  }
  
  let content = fs.readFileSync(file, 'utf8');
  let originalContent = content;
  
  // Replace ../../../components/ui with ui
  content = content.replace(/from\s+['"](\.\.\/){4}components\/ui['"]/g, "from 'ui'");
  
  // Replace ../../components/ui with ../../../ui
  content = content.replace(/from\s+['"](\.\.\/){3}components\/ui['"]/g, "from '../../../ui'");
  
  // Replace ../../../../../components/ui with ui (5 levels)
  content = content.replace(/from\s+['"](\.\.\/){5}components\/ui['"]/g, "from 'ui'");
  
  // Replace ../../../../../components/ui with ui (6 levels)
  content = content.replace(/from\s+['"](\.\.\/){6}components\/ui['"]/g, "from 'ui'");
  
  // 4 levels up
  content = content.replace(/from\s+['"](\.\.\/){4}components\/ui['"]/g, "from 'ui'");
  
  // 3 levels up
  content = content.replace(/from\s+['"](\.\.\/){3}components\/ui['"]/g, "from '../../../ui'");
  
  if (content !== originalContent) {
    fs.writeFileSync(file, content);
    console.log('Updated:', file);
  }
}