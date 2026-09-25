/* Org Chart — built from the real Employee.manager relationships (no separate
 * org dataset). Returns a reporting tree SCOPED to what the viewer may see.
 *
 * VISIBILITY DECISION (LOW review — role-scoped):
 *   HR / ADMIN / SUPER_ADMIN → the full company organization chart.
 *   MANAGER                  → their own team hierarchy only: themselves as the
 *                              root plus every direct and indirect report
 *                              (Manager → Assigned Team → Team Members). No other
 *                              department's tree is returned.
 *   EMPLOYEE (any other role)→ their own permitted hierarchy only: themselves,
 *                              their management chain upward to the top, and their
 *                              own direct reports (if any). Peers and unrelated
 *                              branches are NOT returned.
 *
 * Every node carries ONLY non-confidential org fields — employeeId, name,
 * designation, department, manager, status — and NEVER salary, contact details,
 * date of birth, or any other private/HR data (see SAFE_FIELDS). Scoping is
 * enforced HERE on the server; it does not rely on the client filtering anything.
 */
const Employee = require('../models/Employee');
const catchAsync = require('../utils/catchAsync');
const { SEES_ALL } = require('../utils/teamScope');

// The only fields ever projected into the org chart. Anything sensitive
// (salary, email, phone, dob, address, …) is intentionally excluded.
const SAFE_FIELDS = 'employeeId fullName designation department manager status';

/* GET /api/org-chart */
exports.tree = catchAsync(async (req, res) => {
  // Load the directory with SAFE fields only, then decide which nodes this
  // viewer is permitted to see. The full set is needed to resolve manager
  // chains; the response is filtered to the permitted subset below.
  const all = await Employee.find().select(SAFE_FIELDS).limit(5000);

  const byId = new Map();                 // employeeId -> employee doc
  const childrenOf = new Map();           // manager employeeId -> [child employeeId]
  all.forEach((e) => {
    byId.set(e.employeeId, e);
    if (e.manager) {
      if (!childrenOf.has(e.manager)) childrenOf.set(e.manager, []);
      childrenOf.get(e.manager).push(e.employeeId);
    }
  });

  const role = req.user.role;
  const meId = req.user.employeeId || null;
  let scope, permitted; // permitted: Set<employeeId>, or null = whole company

  if (SEES_ALL.includes(role)) {
    scope = 'company';
    permitted = null;                     // full company chart
  } else if (role === 'MANAGER') {
    scope = 'team';
    permitted = new Set();
    (function collectDown(id) {            // self + all direct/indirect reports
      if (!id || permitted.has(id) || !byId.has(id)) return;
      permitted.add(id);
      (childrenOf.get(id) || []).forEach(collectDown);
    })(meId);
  } else {
    scope = 'self';                        // EMPLOYEE (and any non-privileged role)
    permitted = new Set();
    let cur = meId, guard = 0;             // self + manager chain upward to the root
    while (cur && byId.has(cur) && !permitted.has(cur) && guard++ < 500) {
      permitted.add(cur);
      cur = byId.get(cur).manager || null;
    }
    (childrenOf.get(meId) || []).forEach((id) => permitted.add(id)); // own direct reports
  }

  const inScope = (id) => permitted === null || permitted.has(id);

  // Build nodes for the permitted set. A node's manager reference is kept only
  // when that manager is also in scope; otherwise it is nulled so no out-of-scope
  // superior is leaked and the node becomes a root of the returned (sub)tree.
  const nodes = new Map();
  all.forEach((e) => {
    if (!inScope(e.employeeId)) return;
    const mgrInScope = e.manager && inScope(e.manager);
    nodes.set(e.employeeId, {
      employeeId: e.employeeId,
      name: e.fullName,
      designation: e.designation,
      department: e.department,
      manager: mgrInScope ? e.manager : null,
      status: e.status,
      reports: []
    });
  });

  const roots = [];
  nodes.forEach((node) => {
    if (node.manager && nodes.has(node.manager)) nodes.get(node.manager).reports.push(node);
    else roots.push(node);
  });

  res.json({ scope, count: nodes.size, roots });
});
