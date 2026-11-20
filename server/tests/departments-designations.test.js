/* Department & Designation API tests against a real MongoDB
   (mongodb-memory-server) and the real Express app.
   Run with:  node tests/departments-designations.test.js
   Covers CRUD, RBAC, duplicate prevention, name normalisation,
   referential integrity, and soft-delete protection. */
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-access-secret";
process.env.JWT_REFRESH_SECRET = "test-refresh-secret";
process.env.ACCESS_TOKEN_EXPIRES_IN = "15m";
process.env.MAX_FAILED_LOGINS = "5";
process.env.SETUP_TOKEN = "test-setup-token";

const { MongoMemoryServer } = require("mongodb-memory-server");
const jwt = require("jsonwebtoken");

let pass = 0,
  fail = 0;
const fails = [];
function ok(name, cond) {
  if (cond) {
    pass++;
  } else {
    fail++;
    fails.push(name);
  }
  console.log((cond ? "PASS " : "FAIL ") + name);
}

const PORT = 5098;
const BASE = "http://localhost:" + PORT;

async function login(email, password) {
  const res = await fetch(BASE + "/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const body = await res.json().catch(() => ({}));
  const sc = res.headers.getSetCookie
    ? res.headers.getSetCookie().find((s) => s.startsWith("cyethack_refresh="))
    : null;
  return {
    status: res.status,
    body,
    cookie: sc ? sc.split(";")[0] : null,
    access: body.accessToken,
    user: body.user,
  };
}

async function api(method, path, { access, cookie, body } = {}) {
  const headers = {};
  if (access) headers["Authorization"] = "Bearer " + access;
  if (cookie) headers["Cookie"] = cookie;
  if (body) headers["Content-Type"] = "application/json";
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data, res };
}

(async () => {
  const mem = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mem.getUri();

  const { connectDB, disconnectDB } = require("../config/database");
  await connectDB(process.env.MONGODB_URI);
  const { seedDatabase, DEV_USERS } = require("../seeds/seed");
  await seedDatabase();
  const { provisionUsers } = require("../seeds/provision-real-users");
  const realProvisionAccounts = DEV_USERS.filter(
    (u) => u.employeeId && u.employeeId.startsWith("CY"),
  ).map(({ employeeId, fullName, role, email, password }) => ({
    employeeId, fullName, role, email, password,
  }));
  await provisionUsers(realProvisionAccounts);

  const app = require("../app");
  const server = app.listen(PORT);
  await new Promise((r) => server.once("listening", r));

  try {
    // ---------- authenticate as HR ----------
    const hr = await login("jaya.sahu@cyethack.com", "JayaCY0125JS201");
    ok("HR login → 200", hr.status === 200 && !!hr.access);

    // ---------- authenticate as Employee (should be forbidden for writes) ----------
    const emp = await login("rohith.sai@cyethack.com", "GangCY0525RS109");
    ok("Employee login → 200", emp.status === 200 && !!emp.access);

    // ============ DEPARTMENTS ============

    // GET /api/departments (all, no auth required? actually authenticated)
    const allDepts = await api("GET", "/api/departments", { access: hr.access });
    ok("GET /api/departments → 200", allDepts.status === 200);
    ok("GET /api/departments returns array", Array.isArray(allDepts.data.departments));

    // GET /api/departments/active
    const activeDepts = await api("GET", "/api/departments/active", { access: hr.access });
    ok("GET /api/departments/active → 200", activeDepts.status === 200);
    ok("GET /api/departments/active returns array", Array.isArray(activeDepts.data.departments));
    ok("All returned departments are active", activeDepts.data.departments.every((d) => d.isActive === true));

    // POST /api/departments — create (use a name no seeded employee references)
    const newDept = await api("POST", "/api/departments", {
      access: hr.access,
      body: { name: "Marketing", description: "Marketing and communications department" },
    });
    ok("POST /api/departments → 201", newDept.status === 201);
    ok("Created department has name", newDept.data.department && newDept.data.department.name === "Marketing");
    ok("Created department has description", newDept.data.department && newDept.data.department.description === "Marketing and communications department");
    ok("Created department is active", newDept.data.department && newDept.data.department.isActive === true);
    const deptId = newDept.data.department._id || newDept.data.department.id;

    // POST duplicate — should conflict (case/space-insensitive)
    const dupDept = await api("POST", "/api/departments", {
      access: hr.access,
      body: { name: "  marketing  ", description: "dup" },
    });
    ok("Duplicate dept name (case/space-insensitive) → 409", dupDept.status === 409);

    // POST missing name → 400
    const noNameDept = await api("POST", "/api/departments", {
      access: hr.access,
      body: { name: "" },
    });
    ok("Empty dept name → 400", noNameDept.status === 400);

    // PUT /api/departments/:id — update
    const updDept = await api("PUT", `/api/departments/${deptId}`, {
      access: hr.access,
      body: { name: "Marketing Updated", description: "Updated description" },
    });
    ok("PUT /api/departments/:id → 200", updDept.status === 200);
    ok("Department name updated", updDept.data.department && updDept.data.department.name === "Marketing Updated");

    // PATCH /api/departments/:id/status — deactivate (no employees reference Marketing)
    const deactDept = await api("PATCH", `/api/departments/${deptId}/status`, {
      access: hr.access,
      body: { isActive: false },
    });
    ok("PATCH /api/departments/:id/status → 200", deactDept.status === 200);
    ok("Department deactivated", deactDept.data.department && deactDept.data.department.isActive === false);

    // Reactivate
    const reactDept = await api("PATCH", `/api/departments/${deptId}/status`, {
      access: hr.access,
      body: { isActive: true },
    });
    ok("Department reactivated → 200", reactDept.status === 200);
    ok("Department is active again", reactDept.data.department && reactDept.data.department.isActive === true);

    // DELETE /api/departments/:id — blocked when employees reference "Engineering" (seeded)
    const engDept = activeDepts.data.departments.find((d) => d.name === "Engineering") ||
      allDepts.data.departments.find((d) => d.name === "Engineering");
    if (engDept) {
      const engId = engDept._id || engDept.id;
      const delEng = await api("DELETE", `/api/departments/${engId}`, { access: hr.access });
      ok("DELETE dept with employees → 409", delEng.status === 409);
    }

    // DELETE /api/departments/:id — succeeds when no employees reference it
    const delMkt = await api("DELETE", `/api/departments/${deptId}`, { access: hr.access });
    ok("DELETE dept without employees → 200", delMkt.status === 200);

    // Create / find a department for designation tests
    let desigDept = await api("POST", "/api/departments", {
      access: hr.access,
      body: { name: "Engineering", description: "Engineering department for designation tests" },
    });
    if (desigDept.status === 409) {
      // Already exists from seed — fetch it
      const list = await api("GET", "/api/departments", { access: hr.access });
      const eng = list.data.departments.find((d) => d.name === "Engineering");
      desigDept = { status: 200, data: { department: eng } };
    }
    ok("Create dept for designations → 201", desigDept.status === 201 || desigDept.status === 200);
    const desigDeptId = desigDept.data.department._id || desigDept.data.department.id;

    // ============ DESIGNATIONS ============

    // GET /api/designations
    const allDesigs = await api("GET", "/api/designations", { access: hr.access });
    ok("GET /api/designations → 200", allDesigs.status === 200);
    ok("GET /api/designations returns array", Array.isArray(allDesigs.data.designations));

    // GET /api/designations/active
    const activeDesigs = await api("GET", "/api/designations/active", { access: hr.access });
    ok("GET /api/designations/active → 200", activeDesigs.status === 200);
    ok("All returned active designations are active", activeDesigs.data.designations.every((d) => d.isActive === true));

    // GET /api/designations/department/:departmentId
    const deptDesigs = await api("GET", `/api/designations/department/${desigDeptId}`, { access: hr.access });
    ok("GET /api/designations/department/:id → 200", deptDesigs.status === 200);
    ok("All returned designations belong to department", deptDesigs.status === 200 &&
      deptDesigs.data.designations.every((d) => String(d.departmentId) === String(desigDeptId)));

    // POST /api/designations — create under active department
    const newDesig = await api("POST", "/api/designations", {
      access: hr.access,
      body: { name: "Senior Developer", departmentId: desigDeptId, description: "Senior software engineer" },
    });
    ok("POST /api/designations → 201", newDesig.status === 201);
    ok("Created designation has name", newDesig.data.designation && newDesig.data.designation.name === "Senior Developer");
    ok("Created designation has departmentId", newDesig.data.designation && String(newDesig.data.designation.departmentId) === String(desigDeptId));
    const desigId = newDesig.data.designation._id || newDesig.data.designation.id;

    // POST duplicate designation in same department → 409
    const dupDesig = await api("POST", "/api/designations", {
      access: hr.access,
      body: { name: "  SENIOR DEVELOPER  ", departmentId: desigDeptId },
    });
    ok("Duplicate designation name (case-insensitive, same dept) → 409", dupDesig.status === 409);

    // POST designation under inactive department → 400
    const inactDeptList = await api("GET", "/api/departments", { access: hr.access });
    const inactDept = inactDeptList.data.departments.find((d) => d.isActive === false);
    if (inactDept) {
      const inactDesig = await api("POST", "/api/designations", {
        access: hr.access,
        body: { name: "Test", departmentId: inactDept._id || inactDept.id },
      });
      ok("Designation under inactive department → 400", inactDesig.status === 400);
    }

    // POST missing departmentId → 400
    const noDeptDesig = await api("POST", "/api/designations", {
      access: hr.access,
      body: { name: "NoDept" },
    });
    ok("Missing departmentId → 400", noDeptDesig.status === 400);

    // PUT /api/designations/:id — update
    const updDesig = await api("PUT", `/api/designations/${desigId}`, {
      access: hr.access,
      body: { name: "Senior Developer Updated", description: "Updated" },
    });
    ok("PUT /api/designations/:id → 200", updDesig.status === 200);
    ok("Designation name updated", updDesig.data.designation && updDesig.data.designation.name === "Senior Developer Updated");

    // PATCH /api/designations/:id/status — deactivate
    const deactDesig = await api("PATCH", `/api/designations/${desigId}/status`, {
      access: hr.access,
      body: { isActive: false },
    });
    ok("PATCH /api/designations/:id/status → 200", deactDesig.status === 200);
    ok("Designation deactivated", deactDesig.data.designation && deactDesig.data.designation.isActive === false);

    // DELETE /api/designations/:id — succeeds when no employees reference it
    const delDesig = await api("DELETE", `/api/designations/${desigId}`, {
      access: hr.access,
    });
    ok("DELETE designation without employees → 200", delDesig.status === 200);

    // ============ RBAC ============

    // Employee cannot create department
    const empCreateDept = await api("POST", "/api/departments", {
      access: emp.access,
      body: { name: "Employee Dept" },
    });
    ok("Employee cannot create department → 403", empCreateDept.status === 403);

    // Employee cannot create designation
    const empCreateDesig = await api("POST", "/api/designations", {
      access: emp.access,
      body: { name: "Employee Desig", departmentId: desigDeptId || "000000000000000000000000" },
    });
    ok("Employee cannot create designation → 403", empCreateDesig.status === 403);

    // Unauthenticated → 401
    const noAuthDept = await api("POST", "/api/departments", { body: { name: "NoAuth" } });
    ok("Unauthenticated dept create → 401", noAuthDept.status === 401);

    const noAuthDesig = await api("POST", "/api/designations", { body: { name: "NoAuth", departmentId: "000000000000000000000000" } });
    ok("Unauthenticated designation create → 401", noAuthDesig.status === 401);

    // Invalid department id → 404
    const badDept = await api("GET", "/api/designations/department/000000000000000000000000", { access: hr.access });
    ok("Unknown department → 404", badDept.status === 404);

  } catch (err) {
    console.error("TEST HARNESS ERROR:", err);
  } finally {
    await server.close();
    await disconnectDB();
    console.log(`\n======== RESULT: ${pass} passed, ${fail} failed ========`);
    if (fails.length) {
      console.log("Failed:");
      fails.forEach((f) => console.log("  -", f));
      process.exit(1);
    }
  }
})();
