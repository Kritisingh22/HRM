/* Demo Seeder — creates presentation-ready demo data for the HRM portal.
 * Run with:  npm run seed:demo
 * DEVELOPMENT/TEST ONLY. Requires NODE_ENV !== 'production' or FORCE_SEED=true.
 * Uses DEMO- prefix for employee IDs to distinguish from real data.
 */
const cfg = require("../config/env");
const { connectDB, disconnectDB } = require("../config/database");
const bcrypt = require("bcryptjs");

// Demo users configuration
const DEMO_USERS = [
  // 2 HR accounts (including Sanu)
  {
    employeeId: "DEMO-HR001",
    fullName: "Sanu Sharma",
    email: "sanu.sharma@cyethack.com",
    role: "HR",
    password: "SanuDemo@123",
    department: "Human Resources",
    designation: "HR Business Partner",
  },
  {
    employeeId: "DEMO-HR002",
    fullName: "Priya Patel",
    email: "priya.patel@cyethack.com",
    role: "HR",
    password: "PriyaDemo@123",
    department: "Human Resources",
    designation: "HR Manager",
  },
  // 2 Manager accounts
  {
    employeeId: "DEMO-MGR001",
    fullName: "Rajesh Kumar",
    email: "rajesh.kumar@cyethack.com",
    role: "MANAGER",
    password: "RajeshDemo@123",
    department: "Engineering",
    designation: "Engineering Manager",
  },
  {
    employeeId: "DEMO-MGR002",
    fullName: "Anita Singh",
    email: "anita.singh@cyethack.com",
    role: "MANAGER",
    password: "AnitaDemo@123",
    department: "Product",
    designation: "Product Manager",
  },
  // 10 Employee accounts
  {
    employeeId: "DEMO-EMP001",
    fullName: "Aarav Sharma",
    email: "aarav.sharma@cyethack.com",
    role: "EMPLOYEE",
    password: "AaravDemo@123",
    department: "Engineering",
    designation: "Senior Software Engineer",
    managerId: "DEMO-MGR001",
    departmentName: "Engineering",
  },
  {
    employeeId: "DEMO-EMP002",
    fullName: "Priya Sharma",
    email: "priya.sharma@cyethack.com",
    role: "EMPLOYEE",
    password: "PriyaDemo@123",
    department: "Engineering",
    designation: "Frontend Developer",
    managerId: "DEMO-MGR001",
    departmentName: "Engineering",
  },
  {
    employeeId: "DEMO-EMP003",
    fullName: "Rahul Verma",
    email: "rahul.verma@cyethack.com",
    role: "EMPLOYEE",
    password: "RahulDemo@123",
    department: "Engineering",
    designation: "Backend Developer",
    managerId: "DEMO-MGR001",
    departmentName: "Engineering",
  },
  {
    employeeId: "DEMO-EMP004",
    fullName: "Sneha Gupta",
    email: "sneha.gupta@cyethack.com",
    role: "EMPLOYEE",
    password: "SnehaDemo@123",
    department: "Engineering",
    designation: "QA Engineer",
    managerId: "DEMO-MGR001",
    departmentName: "Engineering",
  },
  {
    employeeId: "DEMO-EMP005",
    fullName: "Vikram Singh",
    email: "vikram.singh@cyethack.com",
    role: "EMPLOYEE",
    password: "VikramDemo@123",
    department: "Product",
    designation: "Product Designer",
    managerId: "DEMO-MGR002",
    departmentName: "Product",
  },
  {
    employeeId: "DEMO-EMP006",
    fullName: "Anjali Reddy",
    email: "anjali.reddy@cyethack.com",
    role: "EMPLOYEE",
    password: "AnjaliDemo@123",
    department: "Product",
    designation: "UX Researcher",
    managerId: "DEMO-MGR002",
    departmentName: "Product",
  },
  {
    employeeId: "DEMO-EMP007",
    fullName: "Karan Mehta",
    email: "karan.mehta@cyethack.com",
    role: "EMPLOYEE",
    password: "KaranDemo@123",
    department: "Marketing",
    designation: "Marketing Specialist",
    managerId: "DEMO-MGR002",
    departmentName: "Marketing",
  },
  {
    employeeId: "DEMO-EMP008",
    fullName: "Divya Nair",
    email: "divya.nair@cyethack.com",
    role: "EMPLOYEE",
    password: "DivyaDemo@123",
    department: "Marketing",
    designation: "Content Writer",
    managerId: "DEMO-MGR002",
    departmentName: "Marketing",
  },
  {
    employeeId: "DEMO-EMP009",
    fullName: "Rohit Kumar",
    email: "rohit.kumar@cyethack.com",
    role: "EMPLOYEE",
    password: "RohitDemo@123",
    department: "Sales",
    designation: "Sales Executive",
    managerId: "DEMO-MGR001",
    departmentName: "Sales",
  },
  {
    employeeId: "DEMO-EMP010",
    fullName: "Pooja Joshi",
    email: "pooja.joshi@cyethack.com",
    role: "EMPLOYEE",
    password: "PoojaDemo@123",
    department: "Sales",
    designation: "Account Manager",
    managerId: "DEMO-MGR001",
    departmentName: "Sales",
  },
];

// Leave types configuration
const LEAVE_TYPES = [
  { name: "Casual Leave", description: "For personal reasons, emergencies", defaultEntitlement: 12, isActive: true },
  { name: "Sick Leave", description: "For medical reasons", defaultEntitlement: 10, isActive: true },
  { name: "Earned Leave", description: "Accrued paid leave", defaultEntitlement: 18, isActive: true },
  { name: "Unpaid Leave", description: "Leave without pay", defaultEntitlement: 0, isActive: true },
  { name: "Maternity Leave", description: "Maternity leave as per policy", defaultEntitlement: 180, isActive: true },
  { name: "Paternity Leave", description: "Paternity leave as per policy", defaultEntitlement: 15, isActive: true },
];

// Demo leave requests
const DEMO_LEAVE_REQUESTS = [
  { employeeId: "DEMO-EMP001", type: "Casual Leave", from: "2026-10-15", to: "2026-10-16", reason: "Family function", approvalAuthority: "Manager", status: "Pending" },
  { employeeId: "DEMO-EMP002", type: "Sick Leave", from: "2026-10-20", to: "2026-10-21", reason: "Fever", approvalAuthority: "Manager", status: "Approved" },
  { employeeId: "DEMO-EMP003", type: "Earned Leave", from: "2026-11-01", to: "2026-11-05", reason: "Vacation", approvalAuthority: "Manager", status: "Pending" },
  { employeeId: "DEMO-EMP004", type: "Casual Leave", from: "2026-10-10", to: "2026-10-10", reason: "Personal work", approvalAuthority: "Manager", status: "Rejected" },
  { employeeId: "DEMO-EMP005", type: "Earned Leave", from: "2026-11-15", to: "2026-11-19", reason: "Wedding", approvalAuthority: "HR", status: "Approved" },
  { employeeId: "DEMO-EMP006", type: "Sick Leave", from: "2026-10-25", to: "2026-10-26", reason: "Flu", approvalAuthority: "Manager", status: "Approved" },
  { employeeId: "DEMO-EMP007", type: "Casual Leave", from: "2026-11-10", to: "2026-11-11", reason: "Personal work", approvalAuthority: "Manager", status: "Pending" },
  { employeeId: "DEMO-EMP008", type: "Earned Leave", from: "2026-12-01", to: "2026-12-10", reason: "Year end vacation", approvalAuthority: "HR", status: "Pending" },
  { employeeId: "DEMO-EMP009", type: "Sick Leave", from: "2026-10-20", to: "2026-10-21", reason: "Dental appointment", approvalAuthority: "Manager", status: "Approved" },
  { employeeId: "DEMO-EMP010", type: "Casual Leave", from: "2026-11-20", to: "2026-11-21", reason: "House shifting", approvalAuthority: "Manager", status: "Pending" },
];

async function seedDemoData() {
  // Safety checks
  if (cfg.isProd && process.env.FORCE_SEED !== "true") {
    console.error("Refusing to seed demo data in production. Set FORCE_SEED=true to override.");
    process.exit(1);
  }

  console.log("Starting demo data seeding...");
  
  // Connect to database
  await connectDB(cfg.MONGODB_URI);
  console.log("Connected to database");

  // Require models after DB connection
  const User = require("../models/User");
  const Employee = require("../models/Employee");
  const Leave = require("../models/Leave");
  const LeaveType = require("../models/LeaveType");
  const Attendance = require("../models/Attendance");
  const Payroll = require("../models/Payroll");
  const SalaryStructure = require("../models/SalaryStructure");
  const Notification = require("../models/Notification");
  const WorkCalendarPolicy = require("../models/WorkCalendarPolicy");

  try {
    // 1. Create Leave Types
    console.log("Creating leave types...");
    const leaveTypeDocs = {};
    for (const lt of LEAVE_TYPES) {
      const existing = await LeaveType.findOne({ name: lt.name });
      if (!existing) {
        const doc = await LeaveType.create(lt);
        leaveTypeDocs[lt.name] = doc;
        console.log(`  Created leave type: ${lt.name}`);
      } else {
        leaveTypeDocs[lt.name] = existing;
        console.log(`  Leave type exists: ${lt.name}`);
      }
    }

    // 2. Create Work Calendar Policy
    console.log("Creating work calendar policy...");
    const existingPolicy = await WorkCalendarPolicy.findOne({ isActive: true });
    if (!existingPolicy) {
      await WorkCalendarPolicy.create({
        name: "Standard Work Calendar",
        description: "Standard 5-day work week with odd Saturdays off",
        oddSaturdaysOff: true,
        workingDaysPerWeek: 5,
        standardHoursPerDay: 8.0,
        isActive: true,
        effectiveFrom: new Date("2026-01-01"),
      });
      console.log("  Created work calendar policy");
    } else {
      console.log("  Work calendar policy exists");
    }

    // 3. Create Demo Users and Employees
    console.log("Creating demo users and employees...");
    
    const empDocs = {};
    const userDocs = {};

    // Check if demo data already exists
    const existingDemoEmployee = await Employee.findOne({ employeeId: "DEMO-HR001" });
    if (existingDemoEmployee) {
      console.log("  Demo data already exists. Fetching existing employees...");
      // Fetch existing demo employees
      const existingEmployees = await Employee.find({ employeeId: /^DEMO-/ });
      for (const emp of existingEmployees) {
        empDocs[emp.employeeId] = emp;
      }
      console.log(`  Found ${Object.keys(empDocs).length} existing demo employees.`);
    } else {
      // Create all demo users and employees
      for (const u of DEMO_USERS) {
      const empData = {
        employeeId: u.employeeId,
        fullName: u.fullName,
        email: u.email,
        department: u.department || u.departmentName,
        designation: u.designation,
        manager: u.managerId,
        location: u.location || "Office",
        workMode: "Hybrid",
        bloodGroup: "O+",
        assignedHrId: u.role === "HR" ? u.employeeId : "DEMO-HR001",
        salary: u.role === "EMPLOYEE" ? 50000 + Math.floor(Math.random() * 50000) : 
                u.role === "MANAGER" ? 150000 + Math.floor(Math.random() * 50000) :
                200000,
        status: "Active",
        joiningDate: new Date("2024-01-01"),
        workMode: "Hybrid",
        workLocation: "office",
        bloodGroup: "O+",
        status: "Active",
      };

      const empDoc = await Employee.create(empData);
      empDocs[u.employeeId] = empDoc;

      const userAttrs = {
        employeeId: u.employeeId,
        fullName: u.fullName,
        email: u.email,
        role: u.role,
        department: u.department || u.departmentName,
        designation: u.designation,
        manager: u.managerId ? (await Employee.findOne({ employeeId: u.managerId }))?._id : null,
        status: "active",
        isVerified: true,
        department: u.department || u.departmentName,
        designation: u.designation,
      };
      
      const userDoc = new User({
        ...userAttrs,
        password: u.password,
      });
      await userDoc.save();
      userDocs[u.employeeId] = userDoc;

      // Link user to employee
      empDoc.user = userDoc._id;
      await empDoc.save();

      console.log(`  Created ${u.role}: ${u.fullName} (${u.employeeId})`);
    }

    } // end if demo data doesn't exist

    // 4. Create Salary Structures
    console.log("Creating salary structures...");
    const salaryStructures = {};

    for (const empId of Object.keys(empDocs)) {
      const emp = empDocs[empId];
      const existing = await SalaryStructure.findOne({ employee: emp._id, isActive: true });
      if (!existing) {
        await SalaryStructure.create({
          employee: emp._id,
          basic: Math.round(emp.salary * 0.5),
          hra: Math.round(emp.salary * 0.3),
          allowances: { transport: 2000, medical: 1500, special: 5000 },
          deductions: { pf: 1800, tds: 5000, esi: 0 },
          effectiveFrom: new Date("2024-01-01"),
          isActive: true,
        });
        salaryStructures[emp.employeeId] = { basic: 50000, hra: 20000, allowances: { transport: 2000 }, deductions: { pf: 1800 } };
        console.log(`  Created salary structure for ${emp.fullName}`);
      }
    }

    // 5. Create Leave Requests
    console.log("Creating leave requests...");
    for (const lr of DEMO_LEAVE_REQUESTS) {
      const emp = await Employee.findOne({ employeeId: lr.employeeId });
      if (!emp) continue;
      
      const requester = lr.status === "Pending" ? 
        (await User.findOne({ employeeId: lr.employeeId })) :
        await User.findOne({ role: lr.approvalAuthority });
      
      const leave = await Leave.create({
        employee: lr.employeeId,
        requestedBy: requester?._id,
        type: lr.type,
        from: new Date(lr.from),
        to: new Date(lr.to),
        days: Math.ceil((new Date(lr.to) - new Date(lr.from)) / (1000 * 60 * 60 * 24)) + 1,
        halfDay: false,
        reason: lr.reason,
        status: lr.status,
        approvalAuthority: lr.approvalAuthority,
        decidedBy: lr.status !== "Pending" ? (await User.findOne({ role: lr.approvalAuthority }))?._id : undefined,
        decidedAt: lr.status !== "Pending" ? new Date() : undefined,
      });
      console.log(`  Created leave request: ${lr.employeeId} - ${lr.type} (${lr.status})`);
    }

    // 6. Create Attendance Records (last 30 days)
    console.log("Creating attendance records...");
    const statuses = ["present", "present", "present", "wfh", "halfday", "absent"];
    const weights = [0.4, 0.3, 0.15, 0.1, 0.03, 0.02];
    
    for (const emp of Object.values(empDocs)) {
      for (let i = 0; i < 30; i++) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split("T")[0];
        
        const dayOfWeek = date.getDay();
        if (dayOfWeek === 0 || dayOfWeek === 6) continue;
        
        const rand = Math.random();
        let cumulative = 0;
        let status = "present";
        for (let j = 0; j < statuses.length; j++) {
          cumulative += weights[j];
          if (rand <= cumulative) {
            status = statuses[j];
            break;
          }
        }
        
        const checkInTimes = ["09:00 AM", "09:15 AM", "09:30 AM", "09:45 AM", "10:00 AM"];
        const checkOutTimes = ["17:30", "18:00", "18:30", "19:00", "17:45"];
        
        let checkIn = null, checkOut = null;
        if (status === "present" || status === "halfday") {
          checkIn = checkInTimes[Math.floor(Math.random() * checkInTimes.length)];
          checkOut = checkOutTimes[Math.floor(Math.random() * checkOutTimes.length)];
        }
        
        // Check if attendance record already exists for this employee and date
        const existingAttendance = await Attendance.findOne({ employee: emp._id, date: dateStr });
        if (!existingAttendance) {
          await Attendance.create({
            employee: emp._id,
            date: dateStr,
            status,
            checkIn,
            checkOut,
            note: status === "halfday" ? "Half day" : status === "wfh" ? "Work from home" : undefined,
          });
        }
      }
    }
    console.log("  Created attendance records for all demo employees");

    // 7. Create Payroll Records
    console.log("Creating payroll records...");
    const salaryStructuresDocs = await SalaryStructure.find({ isActive: true });
    const salaryStructuresMap = {};
    for (const ss of salaryStructuresDocs) {
      salaryStructuresMap[ss.employee.toString()] = ss;
    }
    
    const periods = ["2026-07", "2026-08", "2026-09", "2026-10"];
    
    for (const emp of Object.values(empDocs)) {
      if (!emp.salary || emp.salary <= 0) continue;
      
      const ss = salaryStructuresMap[emp._id.toString()];
      if (!ss) continue;
      
      // Convert Mongoose Map to plain object for calculations
      const allowancesObj = ss.allowances instanceof Map ? Object.fromEntries(ss.allowances) : (ss.allowances || {});
      const allowancesTotal = Object.values(allowancesObj).reduce((a, b) => a + b, 0);
      
      for (const period of periods) {
        const existing = await Payroll.findOne({ employee: emp._id, period });
        if (existing) continue;
        
        const basic = Math.round(emp.salary * 0.5);
        const hra = Math.round(emp.salary * 0.3);
        const gross = basic + hra + allowancesTotal;
        
        const pf = Math.min(Math.round(basic * 0.12), 1800);
        const tds = Math.round(basic * 0.1);
        const net = Math.max(0, gross - pf - tds);
        
        const periodIndex = periods.indexOf(period);
        const status = periodIndex === periods.length - 1 ? "Draft" : ["Paid", "Approved", "Processed"][Math.floor(Math.random() * 3)];
        
        await Payroll.create({
          employee: emp._id,
          period,
          gross,
          deductions: { pf, tds, esi: 0, other: 0 },
          net,
          status,
          payDate: period !== "2026-10" ? new Date(`2026-${period.split("-")[1]}-01`) : null,
        });
        console.log(`  Created payroll: ${period} for ${emp.fullName}`);
      }
    }

    // 8. Create Notifications
    console.log("Creating notifications...");
    const demoEmployees = await Employee.find({ employeeId: /^DEMO-/ });
    for (const emp of demoEmployees) {
      const user = await User.findOne({ employeeId: emp.employeeId });
      if (!user) continue;
      
      await Notification.create([
        {
          user: user._id,
          type: "Welcome",
          title: "Welcome to CYETHACK HR Portal",
          message: "Welcome to the HR Portal. Explore your dashboard, leave, payroll, and more.",
          relatedEntity: { type: "User", id: user._id },
          channels: { inApp: true, email: false },
          priority: "Normal",
        },
        {
          user: user._id,
          type: "Leave Balance",
          title: "Leave Balance Updated",
          message: "Your leave balance has been updated. You have 12 Casual Leave and 10 Sick Leave days remaining.",
          relatedEntity: { type: "LeaveBalance", id: null },
          channels: { inApp: true, email: false },
          priority: "Normal",
        },
      ]);
    }
    console.log("  Created welcome notifications for all demo employees");

    console.log("\nDemo data seeding completed successfully!");
    console.log("\nDemo Login Credentials:");
    console.log("┌─────────────────────────────────────────────────────────────────┐");
    console.log("│ Role     │ Email                          │ Password          │");
    console.log("├─────────────────────────────────────────────────────────────────┤");
    console.log("│ HR       │ sanu.sharma@cyethack.com       │ SanuDemo@123      │");
    console.log("│ HR       │ priya.patel@cyethack.com       │ PriyaDemo@123     │");
    console.log("│ Manager  │ rajesh.kumar@cyethack.com      │ RajeshDemo@123    │");
    console.log("│ Manager  │ anita.singh@cyethack.com       │ AnitaDemo@123     │");
    console.log("│ Employee │ aarav.sharma@cyethack.com      │ AaravDemo@123     │");
    console.log("│ Employee │ priya.sharma@cyethack.com      │ PriyaDemo@123     │");
    console.log("│ Employee │ rahul.verma@cyethack.com       │ RahulDemo@123     │");
    console.log("│ Employee │ sneha.gupta@cyethack.com       │ SnehaDemo@123     │");
    console.log("│ Employee │ vikram.singh@cyethack.com      │ VikramDemo@123    │");
    console.log("│ Employee │ anjali.reddy@cyethack.com      │ AnjaliDemo@123    │");
    console.log("│ Employee │ karan.mehta@cyethack.com       │ KaranDemo@123     │");
    console.log("│ Employee │ divya.nair@cyethack.com        │ DivyaDemo@123     │");
    console.log("│ Employee │ rohit.kumar@cyethack.com       │ RohitDemo@123     │");
    console.log("│ Employee │ pooja.joshi@cyethack.com       │ PoojaDemo@123     │");
    console.log("└─────────────────────────────────────────────────────────────────┘");
    
    console.log("\nIMPORTANT: These are DEMO credentials for development only!");
    console.log("   Do not use in production. All passwords are hashed with bcrypt.");
    
  } catch (error) {
    console.error("Seeding failed:", error);
    throw error;
  } finally {
    await disconnectDB();
  }
}

// Run if executed directly
if (require.main === module) {
  seedDemoData().catch((e) => {
    console.error("Demo seeding failed:", e);
    process.exit(1);
  });
}

module.exports = { seedDemoData, DEMO_USERS, LEAVE_TYPES, DEMO_LEAVE_REQUESTS };