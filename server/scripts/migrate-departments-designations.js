/* Data migration: link existing employee records to Department / Designation
   master documents.
   
   The Employee model stores both string fields (`department`, `designation`)
   and ObjectId reference fields (`departmentId`, `designationId`). Existing
   employee records were created with the string fields only. This migration:
   
   1. Creates Department documents from each distinct employee `department`
      value (skipping blank values).
   2. Creates Designation documents from each distinct employee `designation`
      value (grouped under the matching department).
   3. Back-fills `departmentId` / `designationId` on every employee row so the
      ObjectId references are populated without touching the string fields.
   
   Run once against an existing database:  node scripts/migrate-departments-designations.js
   
   Safe to re-run: it only inserts missing documents and updates null ObjectId
   refs; it never overwrites existing names or deletes anything.
   */
const mongoose = require("mongoose");
const cfg = require("../config/env");
const Department = require("../models/Department");
const Designation = require("../models/Designation");
const Employee = require("../models/Employee");

async function connectDB(uri = cfg.MONGODB_URI) {
  mongoose.set("strictQuery", true);
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  return mongoose.connection;
}

async function run() {
  const conn = await connectDB();
  try {
    console.log("Connected to", conn.host + "/" + conn.name);

    // ---------- 1. Departments ----------
    const existingDeptNames = await Employee.distinct("department", {
      department: { $exists: true, $ne: null, $ne: "" },
    });
    console.log("Distinct employee departments:", existingDeptNames.length);

    const deptNameToId = new Map();
    const existingDepts = await Department.find({});
    for (const d of existingDepts) deptNameToId.set(String(d.name).trim(), d._id);

    for (const name of existingDeptNames) {
      const trimmed = String(name).trim();
      if (!trimmed) continue;
      if (deptNameToId.has(trimmed)) continue;
      const created = await Department.create({
        name: trimmed,
        description: "",
        isActive: true,
        order: 0,
        createdBy: "migration",
      });
      deptNameToId.set(trimmed, created._id);
      console.log("Created Department:", trimmed, "->", created._id);
    }

    // ---------- 2. Designations ----------
    // Each designation belongs to one department; group by (department, designation).
    const rows = await Employee.aggregate([
      {
        $match: {
          designation: { $exists: true, $ne: null, $ne: "" },
          department: { $exists: true, $ne: null, $ne: "" },
        },
      },
      {
        $group: {
          _id: { department: "$department", designation: "$designation" },
          count: { $sum: 1 },
        },
      },
    ]);
    console.log("Distinct (department, designation) pairs:", rows.length);

    const desigKeyToId = new Map();
    const existingDesigs = await Designation.find({});
    for (const d of existingDesigs) {
      desigKeyToId.set(
        `${String(d.departmentId)}|${String(d.name).trim()}`,
        d._id,
      );
    }

    for (const row of rows) {
      const deptName = String(row._id.department).trim();
      const desigName = String(row._id.designation).trim();
      if (!desigName) continue;
      const deptId = deptNameToId.get(deptName);
      if (!deptId) {
        console.warn("Skipping designation without department:", deptName, desigName);
        continue;
      }
      const key = `${deptId}|${desigName}`;
      if (desigKeyToId.has(key)) continue;
      const created = await Designation.create({
        name: desigName,
        departmentId: deptId,
        description: "",
        isActive: true,
        order: 0,
        createdBy: "migration",
      });
      desigKeyToId.set(key, created._id);
      console.log("Created Designation:", desigName, "under", deptName, "->", created._id);
    }

    // ---------- 3. Back-fill employee ObjectId references ----------
    const deptByName = await Department.find({}).lean();
    const deptIdByName = new Map(deptByName.map((d) => [String(d.name).trim(), d._id]));

    const allDesigs = await Designation.find({}).lean();
    const desigIdByKey = new Map(
      allDesigs.map((d) => [`${String(d.departmentId)}|${String(d.name).trim()}`, d._id])
    );

    const employees = await Employee.find({}).lean();
    let updated = 0;
    for (const e of employees) {
      const patch = {};
      if (e.department && !e.departmentId) {
        const deptId = deptIdByName.get(String(e.department).trim());
        if (deptId) patch.departmentId = deptId;
      }
      if (e.designation && !e.designationId && e.department) {
        const deptId = deptIdByName.get(String(e.department).trim());
        const key = deptId ? `${deptId}|${String(e.designation).trim()}` : null;
        if (key && desigIdByKey.has(key)) patch.designationId = desigIdByKey.get(key);
      }
      if (Object.keys(patch).length) {
        await Employee.updateOne({ _id: e._id }, { $set: patch });
        updated++;
      }
    }
    console.log("Back-filled", updated, "employee records with departmentId/designationId.");

    // ---------- Summary ----------
    const deptCount = await Department.countDocuments({});
    const desigCount = await Designation.countDocuments({});
    const empWithDept = await Employee.countDocuments({ departmentId: { $ne: null } });
    const empWithDesig = await Employee.countDocuments({ designationId: { $ne: null } });
    console.log("\nMigration complete.");
    console.log("Departments:", deptCount);
    console.log("Designations:", desigCount);
    console.log("Employees with departmentId:", empWithDept);
    console.log("Employees with designationId:", empWithDesig);
  } finally {
    await mongoose.disconnect();
    console.log("Disconnected.");
  }
}

run().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
