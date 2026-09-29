/* Authorization matrix for payroll/payslip — runs the REAL payrollController + teamScope
 * against an in-memory fake of the model layer (no MongoDB needed):  node tests/payroll-authorization.test.js
 * Note: it verifies the authorization LOGIC, not the Mongoose queries themselves. */
const path = require("path");
const root = path.join(__dirname, "..") + path.sep;
// ---------- tiny in-memory model layer ----------
const eq = (a, b) => String(a) === String(b);
function match(doc, f) {
  return Object.entries(f || {}).every(([k, v]) => {
    if (k === "$or") return v.some((x) => match(doc, x));
    const val = doc[k];
    if (
      v &&
      typeof v === "object" &&
      !(v instanceof Date) &&
      !Array.isArray(v) &&
      !v._bsontype &&
      Object.keys(v).some((x) => x[0] === "$")
    ) {
      if ("$in" in v) return v.$in.some((x) => eq(x, val));
      if ("$nin" in v) return !v.$nin.some((x) => eq(x, val));
      if ("$gt" in v) return val > v.$gt;
      if ("$ne" in v) return val !== v.$ne;
      return true;
    }
    if (v === null || v === undefined) return val == null;
    return eq(val, v);
  });
}
class Q {
  constructor(rows) {
    this.rows = rows;
  }
  select() {
    return this;
  }
  lean() {
    return this;
  }
  sort() {
    return this;
  }
  limit() {
    return this;
  }
  populate(field) {
    const ref = this.pop;
    this.popField = field;
    return this;
  }
  then(res, rej) {
    let r = this.rows;
    if (this.popField)
      r = r.map((x) => ({
        ...x,
        [this.popField]: EMP.find((e) => eq(e._id, x[this.popField])),
      }));
    return Promise.resolve(this.single ? r[0] : r).then(res, rej);
  }
}
const EMP = [];
const PAY = [];
let GRANTS = [];
const Employee = {
  find: (f) => new Q(EMP.filter((e) => match(e, f))),
  findOne: (f) => {
    const q = new Q(EMP.filter((e) => match(e, f)));
    q.single = true;
    return q;
  },
  findById: (id) => {
    const q = new Q(EMP.filter((e) => eq(e._id, id)));
    q.single = true;
    return q;
  },
  exists: async (f) => (EMP.some((e) => match(e, f)) ? { _id: true } : null),
};
const Payroll = {
  find: (f) => new Q(PAY.filter((p) => match(p, f))),
  findById: (id) => {
    const q = new Q(PAY.filter((p) => eq(p._id, id)));
    q.single = true;
    return q;
  },
  create: async (d) => ({ _id: "new", net: 0, ...d }),
};
const AccessRequest = {
  find: (f) =>
    new Q(
      GRANTS.filter((g) =>
        match(g, {
          requestingHrId: f.requestingHrId,
          status: f.status,
          isTransfer: f.isTransfer,
        }),
      ),
    ),
};
const stub = (rel, exp) => {
  const p = require.resolve(root + rel);
  require.cache[p] = { id: p, filename: p, loaded: true, exports: exp };
};
stub("models/Employee.js", Employee);
stub("models/Payroll.js", Payroll);
stub("models/AccessRequest.js", AccessRequest);
stub("utils/audit.js", { logAudit() {} });
const ctrl = require(root + "controllers/payrollController.js");

// ---------- fixture: two HRs, two managers, employees ----------
const mk = (id, name, role, dept, extra = {}) => ({
  _id: "oid_" + id,
  employeeId: id,
  fullName: name,
  department: dept,
  user: "u_" + id,
  ...extra,
});
EMP.push(
  mk("JAYA", "Jaya (HR-A)", "HR", "Human Resources", { assignedHrId: "JAYA" }),
  mk("SURYA", "Surya (Mgr-A)", "MANAGER", "Project Management", {
    assignedHrId: "JAYA",
  }),
  mk("ROHITH", "Rohith", "EMPLOYEE", "Engineering", {
    assignedHrId: "JAYA",
    manager: "SURYA",
  }),
  mk("ATHUL", "Athul", "EMPLOYEE", "Engineering", {
    assignedHrId: "JAYA",
    manager: "SURYA",
  }),
  mk("HRB", "HR-B", "HR", "Human Resources", { assignedHrId: "HRB" }),
  mk("MGRB", "Mgr-B", "MANAGER", "Engineering", { assignedHrId: "HRB" }),
  mk("ZED", "Zed (belongs to HR-B/Mgr-B)", "EMPLOYEE", "Engineering", {
    assignedHrId: "HRB",
    manager: "MGRB",
  }),
);
EMP.forEach((e) =>
  PAY.push({
    _id: "pay_" + e.employeeId,
    employee: e._id,
    period: "2026-09",
    net: 1000,
  }),
);
const U = (id, role) => ({ _id: "u_" + id, employeeId: id, role });
const users = {
  jaya: U("JAYA", "HR"),
  surya: U("SURYA", "MANAGER"),
  rohith: U("ROHITH", "EMPLOYEE"),
  athul: U("ATHUL", "EMPLOYEE"),
  hrb: U("HRB", "HR"),
  mgrb: U("MGRB", "MANAGER"),
  admin: U("ADM", "ADMIN"),
};

async function call(fn, user, { params = {}, query = {}, body = {} } = {}) {
  return new Promise((resolve) => {
    const res = {
      json: (x) => resolve({ ok: true, body: x }),
      status() {
        return this;
      },
    };
    fn({ user, params, query, body }, res, (err) =>
      resolve({
        ok: false,
        status: err.statusCode || err.status,
        msg: err.message,
      }),
    );
  });
}
let pass = 0,
  fail = 0;
const t = (name, cond) => {
  cond ? pass++ : fail++;
  console.log((cond ? "PASS " : "FAIL ") + name);
};
const ids = (r) =>
  (r.body.payroll || [])
    .map((p) => p.employee.employeeId)
    .sort()
    .join(",");
(async () => {
  // ---- LIST scoping
  t(
    "Employee sees only own payslip",
    ids(await call(ctrl.list, users.rohith)) === "ROHITH",
  );
  t(
    "Employee: ?employee=<other> is ignored (no widening)",
    ids(
      await call(ctrl.list, users.rohith, { query: { employee: "oid_ATHUL" } }),
    ) === "ROHITH",
  );
  t(
    "HR-A sees own + assigned (not HR-B's people)",
    ids(await call(ctrl.list, users.jaya)) === "ATHUL,JAYA,ROHITH,SURYA",
  );
  const idor = await call(ctrl.list, users.jaya, {
    query: { employee: "oid_ZED" },
  });
  t(
    "HR-A ?employee=<HR-B's employee> is REFUSED (403)",
    !idor.ok && idor.status === 403,
  );
  t(
    "HR-A ?employee=<own assigned> allowed",
    ids(
      await call(ctrl.list, users.jaya, { query: { employee: "oid_ROHITH" } }),
    ) === "ROHITH",
  );
  t(
    "Manager-A sees own payroll only without payroll:read",
    ids(await call(ctrl.list, users.surya)) === "SURYA",
  );
  const payrollReader = { ...users.surya, permissions: ["payroll:read"] };
  t(
    "Manager with explicit payroll:read sees own team payroll",
    ids(await call(ctrl.list, payrollReader)) === "ATHUL,ROHITH,SURYA",
  );
  const mIdor = await call(ctrl.list, users.surya, {
    query: { employee: "oid_ZED" },
  });
  t(
    "Manager-A ?employee=<other team> REFUSED (403)",
    !mIdor.ok && mIdor.status === 403,
  );
  // ---- getOne / getPayslip
  for (const [fn, label] of [
    [ctrl.getOne, "getOne"],
    [ctrl.getPayslip, "getPayslip"],
  ]) {
    t(
      label + ": employee reads own",
      (await call(fn, users.rohith, { params: { id: "pay_ROHITH" } })).ok,
    );
    t(
      label + ": employee A blocked from employee B (403)",
      (await call(fn, users.rohith, { params: { id: "pay_ATHUL" } })).status ===
        403,
    );
    t(
      label + ": HR-A reads own payslip",
      (await call(fn, users.jaya, { params: { id: "pay_JAYA" } })).ok,
    );
    t(
      label + ": HR-A reads ASSIGNED employee payslip (was broken)",
      (await call(fn, users.jaya, { params: { id: "pay_ROHITH" } })).ok,
    );
    t(
      label + ": HR-A blocked from HR-B's employee (403)",
      (await call(fn, users.jaya, { params: { id: "pay_ZED" } })).status ===
        403,
    );
    t(
      label + ": Manager-A blocked from team payroll without payroll:read",
      (await call(fn, users.surya, { params: { id: "pay_ROHITH" } })).status ===
        403,
    );
    t(
      label + ": Manager with explicit payroll:read can read team payroll",
      (await call(fn, payrollReader, { params: { id: "pay_ROHITH" } })).ok,
    );
    t(
      label + ": Manager-A blocked from HR staff payslip (403)",
      (await call(fn, users.surya, { params: { id: "pay_JAYA" } })).status ===
        403,
    );
    t(
      label + ": Manager-A blocked from other manager's team (403)",
      (await call(fn, users.surya, { params: { id: "pay_ZED" } })).status ===
        403,
    );
  }
  // ---- access grants do not override payroll assignment ownership
  GRANTS = [
    {
      requestingHrId: "JAYA",
      employeeId: "ZED",
      status: "Approved",
      isTransfer: false,
      expiresAt: null,
    },
  ];
  const granted = await call(ctrl.getPayslip, users.jaya, {
    params: { id: "pay_ZED" },
  });
  t(
    "HR-A cannot read HR-B employee even when an access grant exists",
    !granted.ok && granted.status === 403,
  );
  const grantedList = await call(ctrl.list, users.jaya);
  t(
    "HR-A list remains assigned-only when an access grant exists",
    ids(grantedList) === "ATHUL,JAYA,ROHITH,SURYA",
  );
  GRANTS = [];
  t(
    "HR-A stays blocked from HR-B employee payslip",
    (await call(ctrl.getPayslip, users.jaya, { params: { id: "pay_ZED" } }))
      .status === 403,
  );
  // ---- account masking
  EMP[2].accountNumber = "1234567890";
  const ps = await call(ctrl.getPayslip, users.rohith, {
    params: { id: "pay_ROHITH" },
  });
  t(
    "account number masked in payslip",
    ps.ok && ps.body.payslip.payment.accountNumber === "XXXXXX7890",
  );
  // ---- writes
  t(
    "HR-A cannot CREATE payroll for HR-B's employee (403)",
    (
      await call(ctrl.create, users.jaya, {
        body: { employee: "oid_ZED", period: "2026-10" },
      })
    ).status === 403,
  );
  t(
    "HR-A can create for assigned employee",
    (
      await call(ctrl.create, users.jaya, {
        body: { employee: "oid_ROHITH", period: "2026-10" },
      })
    ).ok,
  );
  t(
    "HR-A cannot UPDATE HR-B's employee payslip (403)",
    (
      await call(ctrl.update, users.jaya, {
        params: { id: "pay_ZED" },
        body: { gross: 1 },
      })
    ).status === 403,
  );
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
