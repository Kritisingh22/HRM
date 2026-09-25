/* ===== MERN INTEGRATION (part13) — start =====
 * Additive layer that connects the EXISTING portal to the real backend API,
 * without editing any existing portal code (part1–part12 are untouched).
 *
 * How it works:
 *  - Real authentication is the SERVER's JWT: a short-lived access token kept in
 *    memory here (window.__hrAccess) and sent as `Authorization: Bearer …`, plus
 *    a refresh token the server keeps in an httpOnly cookie. localStorage is NOT
 *    used as proof of auth — it only mirrors a little UI state so the existing
 *    gate/chip/guard (part11/part12) keep working unchanged.
 *  - It preempts the demo login by listening for the form submit / logout click
 *    in the CAPTURE phase on `document` (which runs before the form-level demo
 *    handlers) and calls the API instead.
 */
(function () {
  var API = ""; // same origin
  window.__hrAccess = null;
  window.__hrUser = null;

  // The legacy portal renders a demo shell synchronously. Keep it hidden until
  // the refresh cookie and /me response establish the real authenticated user.
  var appReady = false;
  function setAppReady(ready) {
    appReady = !!ready;
    var app = document.querySelector(".app");
    if (app) app.style.visibility = appReady ? "" : "hidden";
  }
  setAppReady(false);

  function setMirror(user) {
    // UI-state mirror only (not authentication)
    try {
      localStorage.setItem(
        "hr-auth-session",
        JSON.stringify({
          user: user.email,
          name: user.name,
          role: mapRole(user.role),
          ts: Date.now(),
          exp: 30 * 60 * 1000,
        }),
      );
    } catch (e) {}
  }
  function clearMirror() {
    try {
      localStorage.removeItem("hr-auth-session");
    } catch (e) {}
  }
  function mapRole(r) {
    // backend role → the label the portal's chip expects
    return (
      {
        SUPER_ADMIN: "HR Admin",
        ADMIN: "HR Admin",
        HR: "HR Admin",
        MANAGER: "Manager",
        EMPLOYEE: "Employee",
      }[r] || r
    );
  }
  function toast(m) {
    try {
      if (typeof window.toast === "function") window.toast(m);
    } catch (e) {}
  }
  function gate() {
    return document.getElementById("hr-auth-container");
  }
  function err(msg) {
    var e = document.getElementById("hr-auth-error");
    if (e) {
      e.textContent = msg;
      e.hidden = false;
    }
  }

  // ---- API helper with automatic one-shot refresh on 401 ----
  async function hrApi(path, opts) {
    opts = opts || {};
    opts.headers = opts.headers || {};
    if (window.__hrAccess)
      opts.headers["Authorization"] = "Bearer " + window.__hrAccess;
    opts.credentials = "same-origin";
    var res = await fetch(API + path, opts);
    if (
      res.status === 401 &&
      path !== "/api/auth/refresh" &&
      path !== "/api/auth/login"
    ) {
      if (await refreshAccess()) {
        opts.headers["Authorization"] = "Bearer " + window.__hrAccess;
        res = await fetch(API + path, opts);
      } else if (typeof sessionExpired === "function") {
        sessionExpired(); // refresh failed → session can't be trusted; show the login gate
      }
    }
    return res;
  }
  window.hrApi = hrApi;

  function currentEmployeePath() {
    var id = window.__hrUser && window.__hrUser.employeeId;
    return id ? "/api/employees/" + encodeURIComponent(id) : null;
  }
  async function loadCurrentEmployee() {
    var path = currentEmployeePath();
    if (!path) return null;
    try {
      var r = await hrApi(path);
      if (!r.ok) return null;
      var d = await r.json();
      window.__hrEmployee = d.employee || null;
      return window.__hrEmployee;
    } catch (e) {
      return null;
    }
  }
  function mapLeaveRecord(record) {
    return {
      id: record._id,
      type: record.type,
      from: String(record.from).slice(0, 10),
      to: String(record.to).slice(0, 10),
      days: record.days,
      halfDay: !!record.halfDay,
      reason: record.reason || "",
      appliedOn: record.appliedOn ? String(record.appliedOn).slice(0, 10) : "",
      status: record.status,
      managerNote: record.managerNote || "",
      employeeName: record.employee && record.employee.fullName,
      employeeId: record.employee && record.employee.employeeId,
    };
  }
  async function syncRealLeaves() {
    try {
      var r = await hrApi("/api/leaves");
      if (!r.ok || typeof employeeLeaveRequests === "undefined") return false;
      var d = await r.json();
      employeeLeaveRequests.splice.apply(
        employeeLeaveRequests,
        [0, employeeLeaveRequests.length].concat(
          (d.leaves || []).map(mapLeaveRecord),
        ),
      );
      if (typeof hrLeaveCalendarRefreshAll === "function")
        hrLeaveCalendarRefreshAll();
      if (
        typeof renderPlus === "function" &&
        window.HRX &&
        window.HRX.route === "Leave Approvals"
      )
        renderPlus("Leave Approvals");
      return true;
    } catch (e) {
      return false;
    }
  }
  async function prepareLeaveForm() {
    var employee = await loadCurrentEmployee();
    if (!employee) {
      toast("Unable to load employee details.");
      return false;
    }
    if (typeof hrLeaveCalendarConfig !== "undefined") {
      hrLeaveCalendarConfig.employee = {
        name: employee.fullName,
        id: employee.employeeId,
        department: employee.department,
        designation: employee.designation,
      };
    }
    return true;
  }
  async function submitRealLeave() {
    var type = document.getElementById("hrLeaveType").value;
    var from = document.getElementById("hrLeaveStart").value;
    var to = document.getElementById("hrLeaveEnd").value;
    var halfDay = document.getElementById("hrLeaveHalf").checked;
    var reason = document.getElementById("hrLeaveReason").value.trim();
    var button = document.getElementById("hrLeaveSubmitBtn");
    if (
      !type ||
      !from ||
      !to ||
      !reason ||
      from > to ||
      (halfDay && from !== to)
    ) {
      toast("Please complete the required leave details.");
      return;
    }
    if (button) {
      button.disabled = true;
      button.textContent = "Submitting…";
    }
    try {
      // Deliberately omit employee: the backend resolves it from req.user.
      var r = await hrApi("/api/leaves", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: type,
          from: from,
          to: to,
          halfDay: halfDay,
          reason: reason,
        }),
      });
      if (!r.ok) {
        toast("Unable to submit leave. Please try again.");
        return;
      }
      await syncRealLeaves();
      if (typeof closeModal === "function") closeModal();
      toast("Leave application submitted successfully.");
    } catch (e) {
      toast("Unable to submit leave. Please try again.");
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = "Submit Leave Request";
      }
    }
  }
  async function updateRealLeave(id, status) {
    try {
      var r = await hrApi("/api/leaves/" + encodeURIComponent(id), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: status }),
      });
      if (!r.ok) {
        toast(
          r.status === 403
            ? "You are not authorized to update this leave."
            : "Unable to update leave.",
        );
        return;
      }
      await syncRealLeaves();
      toast(
        status === "Approved"
          ? "Leave approved successfully."
          : status === "Rejected"
            ? "Leave rejected successfully."
            : "Leave cancelled successfully.",
      );
      if (
        typeof renderPlus === "function" &&
        window.HRX &&
        window.HRX.route === "Leave Approvals"
      )
        renderPlus("Leave Approvals");
    } catch (e) {
      toast("Unable to update leave.");
    }
  }
  window.__hrSyncLeaves = syncRealLeaves;
  window.__hrSubmitLeave = submitRealLeave;
  window.__hrUpdateLeave = updateRealLeave;

  // Replace the legacy local leave actions at capture time, before their demo
  // handlers can mutate localStorage or the hardcoded employee state.
  document.addEventListener(
    "click",
    function (ev) {
      var apply = ev.target.closest && ev.target.closest("#hrLeaveApplyBtn");
      if (apply) {
        ev.preventDefault();
        ev.stopImmediatePropagation();
        prepareLeaveForm().then(function (ok) {
          if (ok && typeof openLeaveApplicationModal === "function")
            openLeaveApplicationModal(null);
        });
        return;
      }
      var submit = ev.target.closest && ev.target.closest("#hrLeaveSubmitBtn");
      if (submit) {
        ev.preventDefault();
        ev.stopImmediatePropagation();
        submitRealLeave();
        return;
      }
      var cancel =
        ev.target.closest && ev.target.closest('[data-hlc-act="cancel"]');
      if (cancel) {
        ev.preventDefault();
        ev.stopImmediatePropagation();
        updateRealLeave(cancel.getAttribute("data-hlc-id"), "Cancelled");
        return;
      }
      var approval =
        ev.target.closest &&
        ev.target.closest('[data-hp-act="appr"], [data-hp-act="rej"]');
      if (approval) {
        ev.preventDefault();
        ev.stopImmediatePropagation();
        updateRealLeave(
          approval.getAttribute("data-hp-id"),
          approval.getAttribute("data-hp-act") === "appr"
            ? "Approved"
            : "Rejected",
        );
      }
    },
    true,
  );

  // The legacy payroll module has a local demo renderer. Intercept its payslip
  // action and replace it with a fresh, authorized backend record before any
  // preview or print operation can happen.
  function psEsc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (c) {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      }[c];
    });
  }
  function psMoney(value) {
    return "₹" + Number(value || 0).toLocaleString("en-IN");
  }
  function psDate(value) {
    return value
      ? new Date(value).toLocaleDateString("en-IN", {
          day: "2-digit",
          month: "long",
          year: "numeric",
        })
      : "Not available";
  }
  function psTime(value) {
    return value
      ? new Date(value).toLocaleTimeString("en-IN", {
          hour: "2-digit",
          minute: "2-digit",
        })
      : "Not available";
  }
  function psRow(label, value) {
    return (
      '<div class="hr-real-ps-row"><span>' +
      psEsc(label) +
      "</span><b>" +
      psEsc(value || "Not available") +
      "</b></div>"
    );
  }
  function psDeductions(d) {
    d = d || {};
    return (
      [
        ["Provident Fund / PF", d.pf],
        ["Income Tax / TDS", d.tds],
        ["ESI", d.esi],
        ["Other Deductions", d.other],
      ]
        .filter(function (x) {
          return Number(x[1] || 0) > 0;
        })
        .map(function (x) {
          return (
            "<tr><td>" +
            psEsc(x[0]) +
            "</td><td>" +
            psMoney(x[1]) +
            "</td></tr>"
          );
        })
        .join("") ||
      "<tr><td>No deductions recorded</td><td>" + psMoney(0) + "</td></tr>"
    );
  }
  function renderRealPayslip(slip) {
    var e = slip.employee || {},
      p = slip.payment || {},
      d = slip.deductions || {};
    var logo = (document.querySelector(".logo-img") || {}).src || "";
    var generated = new Date();
    var html =
      '<div class="hr-real-payslip" id="hrRealPayslip">' +
      '<header class="hr-real-ps-head"><img src="' +
      psEsc(logo) +
      '" alt="CYTHACK logo"><div><h2>CYTHACK Solution</h2><h1>Employee Payslip</h1><p>Payroll month: ' +
      psEsc(slip.period) +
      "</p><p>Generated: " +
      psEsc(psDate(generated) + ", " + psTime(generated)) +
      "</p></div></header>" +
      '<section><h3>Employee Details</h3><div class="hr-real-ps-grid">' +
      psRow("Employee Name", e.fullName) +
      psRow("Employee ID / Code", e.employeeId) +
      psRow("Designation", e.designation) +
      psRow("Department", e.department) +
      psRow("Role", window.__hrUser && window.__hrUser.role) +
      psRow("Email", e.email) +
      psRow("Phone", e.phone) +
      psRow("Joining Date", psDate(e.joiningDate)) +
      psRow("Employment Type", e.employmentType) +
      psRow("Reporting Manager", e.manager) +
      psRow("Work Location", e.location) +
      "</div></section>" +
      '<section class="hr-real-ps-columns"><div><h3>Earnings</h3><table><tbody>' +
      "<tr><td>Gross Salary</td><td>" +
      psMoney(slip.gross) +
      "</td></tr>" +
      "</tbody></table></div><div><h3>Deductions</h3><table><tbody>" +
      psDeductions(d) +
      '</tbody></table><div class="hr-real-ps-total">Total Deductions <b>' +
      psMoney((slip.gross || 0) - (slip.net || 0)) +
      "</b></div></div></section>" +
      '<div class="hr-real-ps-net"><span>Net Salary / Net Pay</span><b>' +
      psMoney(slip.net) +
      "</b></div>" +
      '<section><h3>Payment &amp; Transaction Details</h3><div class="hr-real-ps-grid">' +
      psRow("Payment Status", p.status || slip.status) +
      psRow("Payment Date", psDate(p.date)) +
      psRow("Payment Time", psTime(p.date)) +
      psRow("Payroll Month", slip.period) +
      psRow("Payment Mode", p.mode) +
      psRow("Transaction ID", p.transactionId) +
      psRow("Payment Amount", psMoney(p.amount)) +
      psRow("Currency", p.currency || "INR") +
      psRow("Bank Name", p.bankName) +
      psRow(
        "Masked Account Number",
        p.accountNumber ? "****" + String(p.accountNumber).slice(-4) : null,
      ) +
      psRow("IFSC Code", p.ifsc) +
      psRow("Transaction Status", p.status || slip.status) +
      '</div><p class="hr-real-ps-note">Payment details that are not stored for this payroll record are shown as Not available.</p></section>' +
      "<footer>This is a system-generated payslip.<br>Generated on: " +
      psEsc(psDate(generated) + ", " + psTime(generated)) +
      "<br>CYTHACK Solution · Page 1</footer></div>";
    return html;
  }
  function printRealPayslip(slip, download) {
    var w = window.open("", "_blank", "width=900,height=1100");
    if (!w) {
      toast("Please allow pop-ups to print or save the payslip.");
      return;
    }
    w.document.write(
      "<!doctype html><html><head><title>CYTHACK_Payslip_" +
        psEsc((slip.employee || {}).employeeId) +
        "_" +
        psEsc(slip.period) +
        "</title><style>" +
        realPayslipCss(true) +
        "</style></head><body>" +
        renderRealPayslip(slip) +
        "</body></html>",
    );
    w.document.close();
    w.addEventListener("load", function () {
      w.focus();
      w.print();
      if (download) toast("Choose “Save as PDF” in the print dialog.");
    });
  }
  function realPayslipCss() {
    return ".hr-real-payslip{font:13px Arial,sans-serif;color:#172238;background:#fff;max-width:800px;margin:auto;padding:34px;box-sizing:border-box}.hr-real-ps-head{display:flex;gap:18px;align-items:center;border-bottom:2px solid #2f8f7b;padding-bottom:18px}.hr-real-ps-head img{width:64px;height:64px;object-fit:contain}.hr-real-ps-head h1,.hr-real-ps-head h2,.hr-real-ps-head p{margin:2px 0}.hr-real-ps-head h2{font-size:18px}.hr-real-ps-head h1{font-size:24px}.hr-real-ps-head p,.hr-real-ps-note{color:#64748b}.hr-real-payslip section{margin-top:22px}.hr-real-payslip h3{font-size:14px;border-bottom:1px solid #cbd5e1;padding-bottom:7px}.hr-real-ps-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px 24px}.hr-real-ps-row{display:flex;justify-content:space-between;gap:12px;border-bottom:1px solid #e2e8f0;padding:6px 0}.hr-real-ps-row b{text-align:right;overflow-wrap:anywhere}.hr-real-ps-columns{display:grid;grid-template-columns:1fr 1fr;gap:26px}.hr-real-payslip table{width:100%;border-collapse:collapse}.hr-real-payslip td{padding:7px 0;border-bottom:1px solid #e2e8f0}.hr-real-payslip td:last-child{text-align:right;font-weight:600}.hr-real-ps-total{display:flex;justify-content:space-between;padding-top:9px;font-weight:600}.hr-real-ps-net{display:flex;justify-content:space-between;background:#e4f5f0;border:1px solid #2f8f7b;padding:14px;margin-top:22px;font-size:16px}.hr-real-ps-net b{font-size:20px}.hr-real-payslip footer{border-top:1px solid #cbd5e1;margin-top:28px;padding-top:12px;text-align:center;font-size:11px;color:#64748b}@media print{body{margin:0}.hr-real-payslip{padding:0;max-width:none}@page{size:A4;margin:14mm}}";
  }
  async function showRealPayslip(empId) {
    try {
      var listRes = await hrApi("/api/payroll");
      if (!listRes.ok) {
        toast("Unable to load payroll details.");
        return;
      }
      var data = await listRes.json(),
        rows = data.payroll || [];
      var row =
        rows.find(function (x) {
          return x.employee && x.employee.employeeId === empId;
        }) || rows[0];
      if (!row || !row._id) {
        toast("Unable to load payroll details.");
        return;
      }
      var detailRes = await hrApi(
        "/api/payroll/" + encodeURIComponent(row._id) + "/payslip",
      );
      if (!detailRes.ok) {
        toast(
          detailRes.status === 403
            ? "You are not authorized to access this payslip."
            : "Unable to load payroll details.",
        );
        return;
      }
      var detail = await detailRes.json();
      var content = renderRealPayslip(detail.payslip);
      var modal = document.createElement("div");
      modal.className = "hr-real-ps-modal";
      modal.innerHTML =
        '<div class="hr-real-ps-dialog" role="dialog" aria-modal="true"><div class="hr-real-ps-actions"><button type="button" data-hr-real-close>Close</button><button type="button" data-hr-real-print>Print Payslip</button><button type="button" data-hr-real-save>Save / Download PDF</button></div>' +
        content +
        "</div>";
      document.body.appendChild(modal);
      modal.addEventListener("click", function (ev) {
        if (ev.target === modal || ev.target.closest("[data-hr-real-close]"))
          modal.remove();
        else if (ev.target.closest("[data-hr-real-print]"))
          printRealPayslip(detail.payslip, false);
        else if (ev.target.closest("[data-hr-real-save]"))
          printRealPayslip(detail.payslip, true);
      });
    } catch (e) {
      toast("Unable to load payroll details.");
    }
  }
  document.addEventListener(
    "click",
    function (ev) {
      var target = ev.target.closest
        ? ev.target.closest('[data-hrx-special^="payslip:"]')
        : null;
      if (!target) return;
      ev.preventDefault();
      ev.stopImmediatePropagation();
      showRealPayslip(target.getAttribute("data-hrx-special").slice(8));
    },
    true,
  );
  (function injectPayslipCss() {
    var s = document.createElement("style");
    s.textContent =
      realPayslipCss() +
      ".hr-real-ps-modal{position:fixed;inset:0;z-index:2000;background:rgba(3,7,18,.72);overflow:auto;padding:24px}.hr-real-ps-dialog{background:#fff;max-width:900px;margin:auto}.hr-real-ps-actions{display:flex;justify-content:flex-end;gap:8px;padding:12px;border-bottom:1px solid #cbd5e1;position:sticky;top:0;background:#fff;z-index:1}.hr-real-ps-actions button{border:1px solid #2f8f7b;background:#fff;color:#172238;border-radius:6px;padding:8px 12px;cursor:pointer}.hr-real-ps-actions button[data-hr-real-save]{background:#2f8f7b;color:#fff}@media(max-width:650px){.hr-real-ps-grid,.hr-real-ps-columns{grid-template-columns:1fr}.hr-real-ps-modal{padding:8px}.hr-real-payslip{padding:18px}}";
    document.head.appendChild(s);
  })();

  async function refreshAccess() {
    try {
      var r = await fetch(API + "/api/auth/refresh", {
        method: "POST",
        credentials: "same-origin",
      });
      if (!r.ok) return false;
      var d = await r.json();
      window.__hrAccess = d.accessToken;
      return true;
    } catch (e) {
      return false;
    }
  }

  function hydrate(user) {
    if (window.HRX && window.HRX.store)
      window.HRX.store.currentUser = user.employeeId || null;
    var av = document.querySelector(".profile .avatar");
    var ini = (user.name || "")
      .trim()
      .split(/\s+/)
      .map(function (p) {
        return p[0] || "";
      })
      .slice(0, 2)
      .join("")
      .toUpperCase();
    if (av) av.textContent = ini;
    var who = document.querySelector(".profile .who");
    if (who) {
      var b = who.querySelector("b"),
        s = who.querySelector("span");
      if (b) b.textContent = user.name;
      if (s) s.textContent = mapRole(user.role);
    }
    var ab = document.getElementById("avatarBtn");
    if (ab) ab.textContent = ini;
  }

  // (role-routed portal logic — applyPortal / applyPortalSoon / PORTAL_PAGES and
  //  the navigation guard — is defined below, next to the nav wrapper.)

  // ---- login (preempts the demo handler) ----
  async function doLogin() {
    var email = (document.getElementById("hr-auth-user") || {}).value || "";
    var pass = (document.getElementById("hr-auth-pass") || {}).value || "";
    email = email.trim();
    if (!email) {
      err("Please enter your email.");
      return;
    }
    if (!pass) {
      err("Please enter your password.");
      return;
    }
    var btn = document.getElementById("hr-auth-submit");
    if (btn) {
      btn.disabled = true;
      btn.dataset._l = btn.textContent;
      btn.textContent = "Signing in…";
    }
    try {
      var r = await fetch(API + "/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ email: email, password: pass }),
      });
      var d = await r.json().catch(function () {
        return {};
      });
      if (r.ok) {
        window.__hrAccess = d.accessToken;
        window.__hrUser = d.user;
        setMirror(d.user);
        var g = gate();
        if (g) g.hidden = true;
        hydrate(d.user);
        setAppReady(true);
        applyPortalSoon(d.user.role); // open the correct portal for this role
        toast("Welcome back, " + (d.user.name || "").split(" ")[0] + "!");
        try {
          if (typeof window.navigate === "function")
            window.navigate("Dashboard");
        } catch (e) {}
      } else {
        err(d.error || "Invalid email or password.");
      }
    } catch (e) {
      err("Could not reach the server. Please try again.");
    } finally {
      if (btn) {
        btn.disabled = false;
        if (btn.dataset._l) btn.textContent = btn.dataset._l;
      }
    }
  }

  async function doLogout() {
    try {
      await fetch(API + "/api/auth/logout", {
        method: "POST",
        credentials: "same-origin",
      });
    } catch (e) {}
    window.__hrAccess = null;
    window.__hrUser = null;
    window.__hrEmployee = null;
    clearMirror();
    var g = gate();
    if (g) {
      g.hidden = false;
      var u = document.getElementById("hr-auth-user");
      if (u) {
        u.value = "";
      }
      var p = document.getElementById("hr-auth-pass");
      if (p) p.value = "";
    }
    setAppReady(true);
    toast("Logged out successfully.");
  }

  // capture-phase interceptors on document → run before the demo handlers
  document.addEventListener(
    "submit",
    function (ev) {
      var f = ev.target;
      if (f && f.id === "hr-auth-form") {
        ev.preventDefault();
        ev.stopImmediatePropagation();
        doLogin();
      }
    },
    true,
  );
  document.addEventListener(
    "click",
    function (ev) {
      var t = ev.target.closest ? ev.target.closest("#logoutBtn") : null;
      if (t) {
        ev.preventDefault();
        ev.stopImmediatePropagation();
        confirmLogout();
      }
    },
    true,
  );

  // Wire the top-bar avatar menu (Profile / Settings / Log out) — the portal ships
  // these as "coming soon" stubs. Intercept in the CAPTURE phase on the stable
  // #avatarMenu (survives its innerHTML re-render) so the real actions run and the
  // stub toast is blocked. CSP-safe: addEventListener only, no inline handlers.
  function avatarItemAction(el) {
    var txt = (el.textContent || "").toLowerCase();
    if (txt.indexOf("log out") >= 0 || txt.indexOf("logout") >= 0)
      return "logout";
    if (txt.indexOf("profile") >= 0) return "profile";
    if (txt.indexOf("setting") >= 0) return "settings";
    return null;
  }
  function closeMenusSafe() {
    try {
      if (typeof window.closeMenus === "function") {
        window.closeMenus();
        return;
      }
      var m = document.getElementById("avatarMenu");
      if (m) m.hidden = true;
      var b = document.getElementById("avatarBtn");
      if (b) b.setAttribute("aria-expanded", "false");
    } catch (e) {}
  }
  // Hide "Settings" for roles whose portal has no Settings page (spec: keep the
  // option only if supported).
  function pruneAvatarMenu() {
    try {
      var role = window.__hrRole;
      if (!role) return;
      var allow = allowedPages(role); // null → HR/Admin (full portal, has Settings)
      var hasSettings = !allow || allow.indexOf("Settings") >= 0;
      document
        .querySelectorAll("#avatarMenu .menu-item")
        .forEach(function (it) {
          if (avatarItemAction(it) === "settings" && !hasSettings)
            it.style.display = "none";
        });
    } catch (e) {}
  }
  document.addEventListener(
    "click",
    function (ev) {
      var it = ev.target.closest
        ? ev.target.closest("#avatarMenu .menu-item")
        : null;
      if (!it) return;
      var act = avatarItemAction(it);
      if (!act) return;
      ev.preventDefault();
      ev.stopImmediatePropagation(); // block the "coming soon" stub
      closeMenusSafe();
      if (act === "profile") {
        try {
          window.navigate("My Profile");
        } catch (e) {}
      } else if (act === "settings") {
        try {
          window.navigate("Settings");
        } catch (e) {}
      } else if (act === "logout") {
        confirmLogout();
      }
    },
    true,
  );

  // ---- logout confirmation dialog (no browser alert) + session-expiry handling ----
  var __confirmEl = null,
    __confirmLast = null;
  function confirmLogout() {
    if (__confirmEl) return; // no duplicate dialogs (idempotent)
    __confirmLast = document.activeElement;
    var scrim = document.createElement("div");
    scrim.className = "hr-logout-scrim";
    scrim.innerHTML =
      '<div class="hr-logout-modal" role="dialog" aria-modal="true" aria-labelledby="hrLogoutTitle">' +
      '<h2 id="hrLogoutTitle">Are you sure you want to log out?</h2>' +
      "<p>You will need to sign in again to access your HR Portal.</p>" +
      '<div class="hr-logout-actions">' +
      '<button type="button" class="hr-logout-cancel">Cancel</button>' +
      '<button type="button" class="hr-logout-confirm">Log out</button>' +
      "</div></div>";
    document.body.appendChild(scrim);
    __confirmEl = scrim;
    var cancelBtn = scrim.querySelector(".hr-logout-cancel");
    var confirmBtn = scrim.querySelector(".hr-logout-confirm");
    function close() {
      if (__confirmEl) {
        __confirmEl.remove();
        __confirmEl = null;
      }
      document.removeEventListener("keydown", onKey, true);
      if (__confirmLast && __confirmLast.focus) {
        try {
          __confirmLast.focus();
        } catch (e) {}
      }
    }
    function onKey(e) {
      if (e.key === "Escape") {
        e.stopPropagation();
        close();
      }
    }
    cancelBtn.addEventListener("click", close);
    scrim.addEventListener("mousedown", function (e) {
      if (e.target === scrim) close();
    });
    document.addEventListener("keydown", onKey, true);
    confirmBtn.addEventListener("click", async function () {
      confirmBtn.disabled = true;
      confirmBtn.textContent = "Logging out…";
      try {
        await doLogout();
      } catch (e) {
        /* doLogout already clears local state safely */
      }
      close();
    });
    confirmBtn.focus();
  }
  // If a refresh fails mid-session, end the session cleanly and show the login gate.
  function sessionExpired() {
    window.__hrAccess = null;
    window.__hrUser = null;
    clearMirror();
    var g = gate();
    if (g) g.hidden = false;
    toast("Your session has ended. Please log in again.");
  }
  (function injectLogoutCss() {
    var s = document.createElement("style");
    s.textContent =
      ".hr-logout-scrim{position:fixed;inset:0;background:rgba(3,7,18,.6);display:flex;align-items:center;justify-content:center;padding:20px;z-index:1000}" +
      ".hr-logout-modal{width:100%;max-width:400px;background:var(--surface,#172238);border:1px solid var(--border,#243352);border-radius:14px;box-shadow:0 12px 32px rgba(0,0,0,.5);padding:22px;color:var(--text,#e6edf7);font-family:inherit}" +
      ".hr-logout-modal h2{font-size:16px;margin:0 0 8px}" +
      ".hr-logout-modal p{font-size:13.5px;color:var(--text-2,#94a3b8);margin:0 0 18px;line-height:1.5}" +
      ".hr-logout-actions{display:flex;justify-content:flex-end;gap:10px}" +
      ".hr-logout-actions button{height:38px;padding:0 16px;border-radius:9px;font:inherit;font-size:13.5px;font-weight:600;cursor:pointer;border:1px solid var(--border,#243352)}" +
      ".hr-logout-cancel{background:transparent;color:var(--text-2,#94a3b8)}" +
      ".hr-logout-cancel:hover{background:var(--hover,#1e2b47);color:var(--text,#e6edf7)}" +
      ".hr-logout-confirm{background:var(--red,#ef4444);color:#fff;border-color:var(--red,#ef4444)}" +
      ".hr-logout-confirm:hover{background:#dc2626}";
    document.head.appendChild(s);
  })();

  // ---- worked example: load Employees from the API into the existing table ----
  // Safe MERGE by employeeId: updates real DB values onto the existing rows the
  // portal already renders, so the table's look/columns are untouched. Full
  // replacement is documented in the README once dept-code mapping is aligned.
  async function loadEmployees() {
    try {
      if (
        !window.HRX ||
        !window.HRX.store ||
        !Array.isArray(window.HRX.store.employees)
      )
        return;
      var r = await hrApi("/api/employees");
      if (!r.ok) return;
      var d = await r.json();
      var byId = {};
      (d.employees || []).forEach(function (e) {
        byId[e.employeeId] = e;
      });
      window.HRX.store.employees.forEach(function (row) {
        var api = byId[row.id];
        if (!api) return;
        if (api.fullName) row.name = api.fullName;
        if (api.email) row.email = api.email;
        if (api.phone) row.phone = api.phone;
        if (api.designation) row.designation = api.designation;
        if (api.status) row.status = api.status;
        if (typeof api.salary === "number") row.salary = api.salary;
        row.__fromApi = true;
      });
      if (
        window.HRX.route === "Employees" &&
        typeof window.HRX.renderRoute === "function"
      )
        window.HRX.renderRoute("Employees");
    } catch (e) {
      /* best-effort; never break the UI */
    }
  }
  // ---- Dashboard KPI tiles from the real database ----
  // Roles with reports access (HR / Manager / Admin) get real figures; employees
  // lack reports:read, so the request is refused and the demo tiles are left as-is.
  async function loadDashboard() {
    try {
      var r = await hrApi("/api/reports/summary");
      if (!r.ok) return;
      var d = await r.json();
      var m = d.metrics || {};
      if (typeof DATA !== "undefined" && DATA.kpis) {
        if (typeof m.headcount === "number")
          DATA.kpis.totalEmployees = m.headcount;
        if (typeof m.onLeaveToday === "number")
          DATA.kpis.onLeaveToday = m.onLeaveToday;
        if (typeof m.pendingLeaves === "number")
          DATA.kpis.pendingApprovals = m.pendingLeaves;
        if (typeof renderKPIs === "function") renderKPIs(); // re-render the existing tiles in place
      }
    } catch (e) {
      /* best-effort; never break the UI */
    }
  }

  // ---- My Profile: render the CURRENTLY AUTHENTICATED user (never a demo persona) ----
  // The portal's own "My Profile" page reads a client-side demo store whose "current
  // user" is the demo role persona — it does NOT track who actually signed in, so it
  // can show another person's details. After navigating to My Profile we replace that
  // page with the real signed-in identity: base fields come from /api/auth/me (already
  // in window.__hrUser — a server projection that never includes password/hash/token),
  // and contact fields from the user's OWN employee record (the API scopes
  // /api/employees to self, so no other user's data is reachable, and salary is hidden
  // for non-HR roles server-side).
  function pfEsc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      }[c];
    });
  }
  function pfIni(name) {
    return (name || "")
      .trim()
      .split(/\s+/)
      .map(function (p) {
        return p[0] || "";
      })
      .slice(0, 2)
      .join("")
      .toUpperCase();
  }
  function pfRow(label, val) {
    return (
      '<div class="hr-plus-field"><label>' +
      pfEsc(label) +
      '</label><input value="' +
      pfEsc(val == null || val === "" ? "—" : val) +
      '" disabled></div>'
    );
  }
  function pfNote(msg) {
    return (
      '<div class="card-head"><div><h2>Contact &amp; Employment</h2></div></div><p style="color:var(--text-2);font-size:13px;padding:2px">' +
      pfEsc(msg) +
      "</p>"
    );
  }
  async function renderRealProfile() {
    var root = document.getElementById("hrPlusRoot");
    var u = window.__hrUser;
    if (!root || !u) return;
    root.hidden = false;
    var mp = document.getElementById("modulePage");
    if (mp) mp.hidden = true;
    var hm = document.getElementById("hrxModuleRoot");
    if (hm) hm.hidden = true;
    root.innerHTML =
      '<div class="hr-plus-head"><div><h2>My Profile</h2><div class="sub">Your account, as signed in. These details are maintained by HR.</div></div></div>' +
      '<div class="hr-plus-grid2">' +
      '<section class="card"><div class="hr-plus-prof">' +
      '<div class="hr-plus-av">' +
      pfEsc(pfIni(u.name)) +
      "</div>" +
      '<div style="flex:1">' +
      '<div style="font-size:18px;font-weight:600">' +
      pfEsc(u.name) +
      "</div>" +
      '<div style="color:var(--text-2);font-size:13px;margin-bottom:12px">' +
      pfEsc(u.role) +
      (u.designation ? " · " + pfEsc(u.designation) : "") +
      "</div>" +
      pfRow("Employee ID", u.employeeId) +
      pfRow("Work email", u.email) +
      pfRow("Department", u.department) +
      pfRow("Designation", u.designation) +
      pfRow("Status", u.status) +
      "</div>" +
      "</div></section>" +
      '<section class="card" id="hrRealContact">' +
      pfNote("Loading…") +
      "</section>" +
      "</div>";
    var box = document.getElementById("hrRealContact");
    if (!box) return;
    if (!u.employeeId) {
      box.innerHTML = pfNote("No employee record is linked to this account.");
      return;
    }
    try {
      var r = await hrApi("/api/employees/" + encodeURIComponent(u.employeeId));
      if (r.ok) {
        var d = await r.json();
        var e = d.employee || {};
        box.innerHTML =
          '<div class="card-head"><div><h2>Contact &amp; Employment</h2></div></div>' +
          pfRow("Phone", e.phone) +
          pfRow("Location", e.location) +
          pfRow("Employment type", e.employmentType) +
          pfRow(
            "Joining date",
            e.joiningDate ? new Date(e.joiningDate).toLocaleDateString() : "",
          ) +
          pfRow("Reporting manager", e.manager);
      } else {
        box.innerHTML = pfNote(
          "Additional details aren’t available for your account.",
        );
      }
    } catch (e) {
      box.innerHTML = pfNote("Couldn’t load your details right now.");
    }
  }
  window.__hrRenderRealProfile = renderRealProfile;

  // ---- Role-based portals: nav + page access driven by the REAL backend role ----
  // HR/Admin get the full portal; Manager and Employee get their own navigation and
  // are blocked from pages outside their portal. Data and actions are ALSO enforced
  // by the backend (403) — this is the portal experience on top of that, not the
  // security boundary. The role comes from the authenticated user, and the manual
  // demo role-switcher is removed so no one can pick another role by hand.
  var PORTAL_PAGES = {
    MANAGER: [
      "Dashboard",
      "Employees",
      "Attendance",
      "Leave",
      "Leave Approvals",
      "Projects",
      "Performance",
      "Notice Board",
      "Helpdesk",
      "Org Chart",
      "My Profile",
    ],
    EMPLOYEE: [
      "Dashboard",
      "My Profile",
      "Attendance",
      "Leave",
      "Payroll",
      "Projects",
      "Documents",
      "Notice Board",
      "Helpdesk",
      "Org Chart",
    ],
  };
  var PORTAL_RELABEL = {
    MANAGER: { Employees: "My Team" },
    EMPLOYEE: {
      Attendance: "My Attendance",
      Leave: "My Leave",
      Payroll: "My Payroll",
      Projects: "My Projects",
    },
  };
  function allowedPages(role) {
    return PORTAL_PAGES[role] || null;
  } // null → full HR/Admin portal

  function applyQuickActionVisibility(role) {
    var quick = document.getElementById("quickBtn");
    if (!quick) return;
    var hidden = role === "EMPLOYEE";
    quick.hidden = hidden;
    quick.setAttribute("aria-hidden", hidden ? "true" : "false");
    if (hidden) quick.setAttribute("tabindex", "-1");
    else quick.removeAttribute("tabindex");
  }

  var __navObs = null;
  function applyPortal(role) {
    try {
      window.__hrRole = role;
      applyQuickActionVisibility(role);
      // 1) remove the manual demo role-switcher so no one can pick another role by
      //    hand — the role comes from the authenticated backend user. (We do NOT
      //    drive the portal's own role pill: it re-asserts its own nav view and
      //    would fight this filter. Unauthorised actions are blocked by the API.)
      var sw = document.getElementById("hp3Controls");
      if (sw) sw.style.display = "none";
      // 2) show only this portal's pages in the sidebar (+ friendlier labels).
      //    Writes are conditional (idempotent) so re-applying causes no DOM churn.
      var allow = allowedPages(role);
      var relabel = PORTAL_RELABEL[role] || {};
      document.querySelectorAll(".nav-item[data-page]").forEach(function (b) {
        var page = b.getAttribute("data-page");
        if (allow && allow.indexOf(page) < 0) {
          if (b.style.display !== "none") b.style.display = "none";
          return;
        }
        if (b.style.display === "none") b.style.display = "";
        if (relabel[page]) {
          var t = b.querySelector(".nav-text");
          if (t && t.textContent !== relabel[page])
            t.textContent = relabel[page];
        }
      });
      pruneAvatarMenu(); // hide "Settings" in the avatar menu for roles without it
      scopeDashboardForEmployee(role); // employees see a personal note, not company aggregates
    } catch (e) {}
  }

  // An EMPLOYEE's dashboard must not show company-wide figures. Employees lack
  // reports:read, so the real numbers are refused by the API and the demo company
  // KPI tiles/charts would otherwise linger. For employees we hide those tiles and
  // show a personal note; for every other role the dashboard is left untouched.
  // Re-applied on each navigation by the same observer that filters the sidebar.
  function scopeDashboardForEmployee(role) {
    var dash = document.getElementById("dashboardPage");
    if (!dash) return;
    var isEmp = role === "EMPLOYEE";
    Array.prototype.forEach.call(dash.children, function (c) {
      if (c.id === "hrEmpDashNote") return;
      if (isEmp) {
        if (c.dataset.hidEmp === undefined)
          c.dataset.hidEmp = c.style.display || "";
        c.style.display = "none";
      } else if (c.dataset.hidEmp !== undefined) {
        c.style.display = c.dataset.hidEmp;
        delete c.dataset.hidEmp;
      }
    });
    var note = document.getElementById("hrEmpDashNote");
    if (isEmp && !note) {
      note = document.createElement("div");
      note.id = "hrEmpDashNote";
      note.className = "card span12";
      note.style.cssText = "grid-column:span 12;padding:22px";
      note.innerHTML =
        '<h2 style="font-size:16px;margin:0 0 6px">Your personal workspace</h2>' +
        '<p style="color:var(--text-2);font-size:13px;margin:0;line-height:1.5">Company-wide figures are not part of your view. Use the menu — My Attendance, My Leave, My Payroll, My Documents and My Profile — to see your own records.</p>';
      dash.appendChild(note);
    } else if (!isEmp && note) {
      note.remove();
    }
  }
  // Keep the filter correct as modules inject their nav items later: re-assert it
  // whenever the sidebar changes (idempotent, so it converges without looping).
  function applyPortalSoon(role) {
    applyPortal(role);
    try {
      var nav = document.getElementById("nav");
      if (nav && !__navObs) {
        __navObs = new MutationObserver(function () {
          applyPortal(window.__hrRole || role);
        });
        __navObs.observe(nav, { childList: true, subtree: true });
      }
    } catch (e) {}
    setTimeout(function () {
      applyPortal(role);
    }, 600); // belt-and-suspenders for very late renders
  }

  // re-load module data on navigation, and BLOCK pages outside the user's portal
  (function wrapNav() {
    if (typeof window.navigate !== "function" || window.navigate.__hr13) return;
    var orig = window.navigate;
    function wrapped(page) {
      var role = window.__hrRole,
        allow = role ? allowedPages(role) : null;
      if (allow && page && allow.indexOf(page) < 0) {
        // page outside this portal → deny + send to Dashboard
        toast('Access denied — "' + page + '" is not part of your workspace.');
        var o = orig.call(this, "Dashboard");
        loadDashboard();
        return o;
      }
      var out = orig.apply(this, arguments);
      if (page === "Employees") loadEmployees();
      else if (page === "Dashboard") loadDashboard();
      else if (page === "Leave" || page === "Leave Approvals") {
        loadCurrentEmployee();
        syncRealLeaves();
      } else if (page === "My Profile") {
        renderRealProfile();
        setTimeout(renderRealProfile, 60);
      } // show the signed-in user, not the demo persona (2nd pass defeats late re-renders)
      return out;
    }
    wrapped.__hr13 = true;
    try {
      window.navigate = wrapped;
    } catch (e) {}
  })();

  // ---- boot: restore a real session (refresh cookie → access token → /me) ----
  (async function boot() {
    // The local mirror is only stale UI data. It must not hide the gate or
    // determine the role while the backend session is being restored.
    clearMirror();
    var initialGate = gate();
    if (initialGate) initialGate.hidden = false;
    if (await refreshAccess()) {
      try {
        var r = await hrApi("/api/auth/me");
        if (r.ok) {
          var d = await r.json();
          window.__hrUser = d.user;
          setMirror(d.user);
          var g = gate();
          if (g) g.hidden = true;
          hydrate(d.user);
          setAppReady(true);
          applyPortalSoon(d.user.role);
          try {
            if (typeof window.navigate === "function")
              window.navigate("Dashboard");
          } catch (e) {}
          loadDashboard();
          return;
        }
      } catch (e) {}
    }
    // Invalid or expired backend sessions never fall through to a demo role.
    window.__hrAccess = null;
    window.__hrUser = null;
    clearMirror();
    setAppReady(true);
    var failedGate = gate();
    if (failedGate) failedGate.hidden = false;
  })();
})();
/* ===== MERN INTEGRATION (part13) — end ===== */
