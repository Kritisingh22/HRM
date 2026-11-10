/* Role-workspace API tests — To-Do ownership, /api/dashboard scoping, leave balance,
 * reports/me, helpdesk scoping + notification, HR project scoping.
 * Run with:  node tests/role-workspace.test.js   (uses mongodb-memory-server like e2e.test.js) */
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-access-secret";
process.env.JWT_REFRESH_SECRET = "test-refresh-secret";
process.env.ACCESS_TOKEN_EXPIRES_IN = "15m";
process.env.MAX_FAILED_LOGINS = "5";
process.env.SETUP_TOKEN = "test-setup-token";

const { MongoMemoryServer } = require("mongodb-memory-server");
const PORT = 5098;
const BASE = "http://localhost:" + PORT;
let pass = 0, fail = 0;
const ok = (name, cond) => { cond ? pass++ : fail++; console.log((cond ? "PASS " : "FAIL ") + name); };

async function login(email, password) {
  const r = await fetch(BASE + "/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
  return (await r.json()).accessToken;
}
async function api(method, path, access, body) {
  const headers = { Authorization: "Bearer " + access };
  if (body) headers["Content-Type"] = "application/json";
  const res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

(async () => {
  const mem = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mem.getUri();
  const { connectDB } = require("../config/database");
  await connectDB(process.env.MONGODB_URI);
  await require("../seeds/seed").seedDatabase();
  const server = require("../app").listen(PORT);
  await new Promise((r) => server.once("listening", r));

  const emp1 = await login("rohith.sai@cyethack.com", "GangCY0525RS109");
  const emp2 = await login("athul.raja@cyethack.com", "AthuCY0226AR110");
  const hr = await login("jaya.sahu@cyethack.com", "JayaCY0125JS201");
  const mgr = await login("surya.dwivedi@cyethack.com", "SuryCY0824SD301");

  // ---- To-Do: owner-only ----
  const t = await api("POST", "/api/todos", emp1, { title: "Write report" });
  ok("employee creates a todo", t.status === 201 && t.data.todo.title === "Write report");
  const spoof = await api("POST", "/api/todos", emp1, { title: "spoof", employee: "000000000000000000000000" });
  ok("body employee id is ignored (task still owned by caller)", spoof.status === 201);
  ok("other employee cannot see it", (await api("GET", "/api/todos", emp2)).data.todos.every((x) => x.title !== "Write report"));
  ok("other employee cannot edit it", (await api("PUT", "/api/todos/" + t.data.todo._id, emp2, { status: "Completed" })).status === 404);
  ok("other employee cannot delete it", (await api("DELETE", "/api/todos/" + t.data.todo._id, emp2)).status === 404);
  const done = await api("PUT", "/api/todos/" + t.data.todo._id, emp1, { status: "Completed" });
  ok("owner completes it and history is kept", done.data.todo.status === "Completed" && done.data.todo.history.length === 2);

  // ---- dashboard scoping ----
  const d1 = await api("GET", "/api/dashboard", emp1);
  ok("employee dashboard is self-scoped", d1.status === 200 && d1.data.scope === "self" && d1.data.todos.completedToday >= 1);
  const dh = await api("GET", "/api/dashboard", hr);
  ok("HR dashboard is assigned-scoped", dh.status === 200 && dh.data.scope === "assigned" && typeof dh.data.employees === "number");
  const dm = await api("GET", "/api/dashboard", mgr);
  ok("manager dashboard is team-scoped and reports HR count", dm.status === 200 && dm.data.scope === "team" && dm.data.hrCount !== undefined);

  // ---- leave balance & reports/me ----
  const bal = await api("GET", "/api/leaves/balance", emp1);
  ok("leave balance lists entitlements", bal.status === 200 && bal.data.balances.some((b) => b.type === "Casual Leave" && b.total > 0));
  const rep = await api("GET", "/api/reports/me", emp1);
  ok("own work report", rep.status === 200 && rep.data.todos && rep.data.todos.completed >= 1);

  // ---- helpdesk: scope + notification ----
  const tk = await api("POST", "/api/helpdesk", emp1, { subject: "Laptop", description: "slow" });
  ok("employee raises a query", tk.status === 201);
  ok("other employee cannot see it", (await api("GET", "/api/helpdesk", emp2)).data.tickets.every((x) => x._id !== tk.data.ticket._id));
  const upd = await api("PUT", "/api/helpdesk/" + tk.data.ticket._id, hr, { status: "In Progress", comment: "Looking" });
  ok("HR in scope updates the query", upd.status === 200 && upd.data.ticket.status === "In Progress");
  const notes = await api("GET", "/api/notifications", emp1);
  ok("employee is notified of the update", (notes.data.notifications || []).some((n) => n.type === "Helpdesk Update"));

  // ---- projects: employee sees only own ----
  const pr = await api("GET", "/api/projects", emp2);
  ok("employee project list is member-scoped", pr.status === 200);

  server.close(); await mem.stop();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
