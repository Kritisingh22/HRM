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
  // The portal snapshots its whole in-memory store (demo data + anything a session
  // changed) into localStorage under these keys. They are per-browser, not
  // per-user, so they must not survive into another person's session.
  function wipePortalSnapshot() {
    try {
      localStorage.removeItem("cyethackHRP.v2");
      localStorage.removeItem("cyethackHRP.role");
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
        ["Professional Tax", d.professionalTax],
        ["Loan / Advance", d.loanAdvance],
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
      psRow("Assigned HR", e.assignedHrId) +
      psRow("Email", e.email) +
      psRow("Phone", e.phone) +
      psRow("Joining Date", psDate(e.joiningDate)) +
      psRow("Employment Type", e.employmentType) +
      psRow("Reporting Manager", e.manager) +
      psRow("Work Location", e.location) +
      "</div></section>" +
      '<section class="hr-real-ps-columns"><div><h3>Earnings</h3><table><tbody>' +
      "<tr><td>Basic Salary</td><td>" +
      psMoney(slip.basic) +
      "</td></tr>" +
      "<tr><td>HRA</td><td>" +
      psMoney((slip.allowances || {}).hra) +
      "</td></tr>" +
      "<tr><td>Conveyance</td><td>" +
      psMoney((slip.allowances || {}).conveyance) +
      "</td></tr>" +
      "<tr><td>Special Allowance</td><td>" +
      psMoney((slip.allowances || {}).special) +
      "</td></tr>" +
      "<tr><td>Other Allowances</td><td>" +
      psMoney((slip.allowances || {}).other) +
      "</td></tr>" +
      "<tr><td>Bonus</td><td>" +
      psMoney(slip.bonus) +
      "</td></tr>" +
      "<tr><td>Overtime</td><td>" +
      psMoney(slip.overtime) +
      "</td></tr>" +
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
  async function showRealPayslip(empId, period, allowGenerate) {
    period = period || payrollPeriod();
    try {
      var listRes = await hrApi("/api/payroll");
      if (!listRes.ok) {
        toast("Unable to load payroll details.");
        return;
      }
      var data = await listRes.json();
      var row = (data.payroll || []).find(function (x) {
        return (
          x.employee && x.employee.employeeId === empId && x.period === period
        );
      });
      if (!row && allowGenerate && canWritePayroll()) {
        var generated = await hrApi(
          "/api/payroll/employee/" + encodeURIComponent(empId) + "/generate",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ period: period }),
          },
        );
        if (!generated.ok) {
          toast(
            generated.status === 403
              ? "You are not authorized to generate payroll for this employee."
              : "Unable to generate payroll for the selected employee.",
          );
          return;
        }
        var refreshed = await hrApi("/api/payroll");
        if (!refreshed.ok) throw new Error("Unable to refresh payroll");
        var refreshedData = await refreshed.json();
        row = (refreshedData.payroll || []).find(function (item) {
          return (
            item.employee &&
            item.employee.employeeId === empId &&
            item.period === period
          );
        });
      }
      if (!row || !row._id) {
        toast("No payroll data available for the selected employee.");
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
      var parts = target.getAttribute("data-hrx-special").slice(8).split(":");
      showRealPayslip(parts[0], parts[1], false);
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

  // ---- Attendance from the real backend ----
  // The portal ships a fabricated demo attendance store (hrLeaveSeedDemoAttendance
  // invents ~75 days of present/absent/late/overtime with fake times). That must
  // never be shown as anyone's real attendance, so it is purged at sign-in and
  // rebuilt ONLY from real records: explicit Attendance rows, approved Leave for
  // this employee, and real LoginSession activity (server-computed durations).
  // A day with none of those stays empty → the page shows "No Data", not "Absent".
  function purgeDemoAttendance() {
    try {
      if (typeof employeeAttendanceData === "undefined") return;
      Object.keys(employeeAttendanceData).forEach(function (k) {
        delete employeeAttendanceData[k];
      });
    } catch (e) {}
  }
  function isoLocalDate(d) {
    return (
      d.getFullYear() +
      "-" +
      String(d.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(d.getDate()).padStart(2, "0")
    );
  }
  function fmtAmPm(d) {
    return d
      .toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      })
      .toUpperCase();
  }
  function refreshAttendanceViews() {
    try {
      if (typeof hrLeaveCalendarRefreshAll === "function")
        hrLeaveCalendarRefreshAll();
      if (
        window.HRX &&
        window.HRX.route === "Attendance" &&
        typeof window.HRX.renderRoute === "function"
      )
        window.HRX.renderRoute("Attendance");
    } catch (e) {}
  }
  async function syncRealAttendance() {
    try {
      if (typeof employeeAttendanceData === "undefined") return false;
      var me = window.__hrUser;
      purgeDemoAttendance();
      if (!me || !me.employeeId) {
        refreshAttendanceViews();
        return false;
      }
      await syncRealLeaves(); // approved leave feeds the register too
      var to = new Date();
      var from = new Date();
      from.setDate(from.getDate() - 90);
      var res = await Promise.all([
        hrApi(
          "/api/attendance/me?from=" +
            isoLocalDate(from) +
            "&to=" +
            isoLocalDate(to),
        ),
        hrApi(
          "/api/sessions?employeeId=" +
            encodeURIComponent(me.employeeId) +
            "&from=" +
            encodeURIComponent(from.toISOString()),
        ),
      ]);
      var attJson = res[0].ok ? await res[0].json() : { attendance: [] };
      var sesJson = res[1].ok ? await res[1].json() : { sessions: [] };
      if (window.__hrUser !== me) return false; // user changed mid-request — never apply stale data

      var days = {};
      // 1) real login/logout sessions → present, with server-computed working time
      var perDay = {};
      (sesJson.sessions || []).forEach(function (s) {
        var login = new Date(s.loginAt);
        var key = isoLocalDate(login);
        var seconds =
          s.status === "Active"
            ? Math.max(0, Math.floor((Date.now() - login.getTime()) / 1000))
            : s.durationSeconds || 0;
        var g =
          perDay[key] ||
          (perDay[key] = {
            first: login,
            lastOut: null,
            seconds: 0,
            active: false,
          });
        if (login < g.first) g.first = login;
        if (s.status === "Active") g.active = true;
        else if (s.logoutAt) {
          var out = new Date(s.logoutAt);
          if (!g.lastOut || out > g.lastOut) g.lastOut = out;
        }
        g.seconds += seconds;
      });
      function hm(sec) {
        var h = Math.floor(sec / 3600),
          m = Math.floor((sec % 3600) / 60);
        return h + "h " + (m < 10 ? "0" : "") + m + "m";
      }
      Object.keys(perDay).forEach(function (k) {
        var g = perDay[k];
        var rec = { status: "present", checkIn: fmtAmPm(g.first) };
        if (!g.active && g.lastOut) rec.checkOut = fmtAmPm(g.lastOut);
        if (g.seconds > 0) rec.workingHours = hm(g.seconds);
        days[k] = rec;
      });
      // 2) this employee's approved leave (weekdays only) — fills days with no session
      if (typeof employeeLeaveRequests !== "undefined") {
        employeeLeaveRequests.forEach(function (l) {
          if (
            l.status !== "Approved" ||
            (l.employeeId && l.employeeId !== me.employeeId)
          )
            return;
          for (
            var d = new Date(l.from + "T12:00:00"),
              end = new Date(l.to + "T12:00:00");
            d <= end;
            d.setDate(d.getDate() + 1)
          ) {
            var dow = d.getDay();
            if (dow === 0 || dow === 6) continue;
            var k = isoLocalDate(d);
            if (!days[k])
              days[k] = {
                status: "leave",
                leaveType: l.type,
                approvalStatus: "approved",
              };
          }
        });
      }
      // 3) explicit Attendance rows always win (HR-recorded truth)
      (attJson.attendance || []).forEach(function (a) {
        var prev = days[a.date] || {};
        var rec = { status: a.status };
        if (a.checkIn) rec.checkIn = a.checkIn;
        if (a.checkOut) rec.checkOut = a.checkOut;
        if (prev.workingHours) rec.workingHours = prev.workingHours;
        if (a.status === "leave" && prev.leaveType)
          rec.leaveType = prev.leaveType;
        days[a.date] = rec;
      });

      purgeDemoAttendance();
      Object.keys(days).forEach(function (k) {
        employeeAttendanceData[k] = days[k];
      });
      refreshAttendanceViews();
      return true;
    } catch (e) {
      return false;
    }
  }

  // ---- login/logout activity widget (additive — no existing markup edited) ----
  // Shows "Login: HH:MM AM · Working: Xh Ym" (or logout summary) under the
  // existing .profile block. Duration is ALWAYS recomputed from the server's
  // loginAt/logoutAt on every tick — never a client-side counter — so a page
  // refresh can't reset or skew it, and it never shows anything the backend
  // hasn't itself recorded.
  var __sessionTimerHandle = null;
  var __sessionPollHandle = null;

  function fmtClock(iso) {
    if (!iso) return "";
    try {
      return new Date(iso).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch (e) {
      return "";
    }
  }
  function fmtDuration(totalSeconds) {
    var s = Math.max(0, totalSeconds || 0);
    var h = Math.floor(s / 3600);
    var m = Math.floor((s % 3600) / 60);
    return h + "h " + (m < 10 ? "0" : "") + m + "m";
  }

  function ensureSessionWidgetEl() {
    var who = document.querySelector(".profile .who");
    var host = who || document.querySelector(".profile");
    if (!host) return null;
    var el = document.getElementById("hrSessionWidget");
    if (!el) {
      el = document.createElement("div");
      el.id = "hrSessionWidget";
      el.style.cssText =
        "font-size:11px;line-height:1.4;opacity:.8;margin-top:2px;white-space:nowrap;";
      host.appendChild(el);
    }
    return el;
  }

  function renderSession(session) {
    var el = ensureSessionWidgetEl();
    if (!el) return;
    if (!session) {
      el.textContent = "";
      return;
    }
    if (session.status === "Active") {
      var liveSeconds = Math.floor(
        (Date.now() - new Date(session.loginAt).getTime()) / 1000,
      );
      el.textContent =
        "Login: " +
        fmtClock(session.loginAt) +
        " · Online · Working: " +
        fmtDuration(liveSeconds);
    } else {
      el.textContent =
        "Login: " +
        fmtClock(session.loginAt) +
        " · Logout: " +
        fmtClock(session.logoutAt) +
        " · Total: " +
        fmtDuration(session.durationSeconds);
    }
  }

  var __lastKnownSession = null;

  async function refreshSessionFromServer() {
    try {
      var r = await hrApi("/api/sessions/me");
      if (!r.ok) return;
      var d = await r.json();
      __lastKnownSession = d.session;
      renderSession(__lastKnownSession);
    } catch (e) {
      /* best-effort — never block the UI on this */
    }
  }

  function startSessionWidget() {
    stopSessionWidget();
    refreshSessionFromServer();
    // Re-render every 30s from the last known server timestamp (smooth "ticking"
    // clock without hammering the API), and re-sync with the server every 5 min.
    __sessionTimerHandle = window.setInterval(function () {
      if (__lastKnownSession) renderSession(__lastKnownSession);
    }, 30000);
    __sessionPollHandle = window.setInterval(
      refreshSessionFromServer,
      5 * 60000,
    );
  }

  function stopSessionWidget() {
    if (__sessionTimerHandle) {
      window.clearInterval(__sessionTimerHandle);
      __sessionTimerHandle = null;
    }
    if (__sessionPollHandle) {
      window.clearInterval(__sessionPollHandle);
      __sessionPollHandle = null;
    }
    __lastKnownSession = null;
    var el = document.getElementById("hrSessionWidget");
    if (el) el.textContent = "";
  }

  // One-shot GPS capture at login only (never continuous background tracking).
  // Silently does nothing if the browser lacks geolocation or the user denies
  // the permission prompt — login itself is never blocked on this.
  function captureLoginLocationOnce() {
    if (!("geolocation" in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      async function (pos) {
        try {
          await hrApi("/api/sessions/me/location", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
              accuracy: pos.coords.accuracy,
            }),
          });
        } catch (e) {}
      },
      function () {
        /* permission denied or unavailable — fine, GPS is optional */
      },
      { maximumAge: 60000, timeout: 8000 },
    );
  }

  // (role-routed portal logic — applyPortal / applyPortalSoon / PORTAL_PAGES and
  //  the navigation guard — is defined below, next to the nav wrapper.)

  // ---- Add Employee (HR Quick Action) — replaces the demo version, which only
  // bumped a KPI counter and never persisted anything or had most of the
  // required fields. Same modal chrome (openModal/closeModal, same CSS
  // classes) so the UI is unchanged; the submit now really calls the backend.
  // assignedHrId is never sent from here — the backend (employeeController.create)
  // always derives it from the authenticated HR, exactly as required.
  function addEmployeeFieldHtml(id, label, type, opts) {
    opts = opts || {};
    if (type === "select") {
      return (
        '<div class="field" id="f_' +
        id +
        '"><label for="' +
        id +
        '">' +
        label +
        "</label>" +
        '<select id="' +
        id +
        '">' +
        opts.options
          .map(function (o) {
            return '<option value="' + o + '">' + o + "</option>";
          })
          .join("") +
        "</select></div>"
      );
    }
    return (
      '<div class="field" id="f_' +
      id +
      '"><label for="' +
      id +
      '">' +
      label +
      "</label>" +
      '<input id="' +
      id +
      '" type="' +
      (type || "text") +
      '" autocomplete="off"' +
      (opts.value ? ' value="' + opts.value + '"' : "") +
      '><div class="err">' +
      (opts.err || "This field is required.") +
      "</div></div>"
    );
  }

  window.openAddEmployee = function openAddEmployee() {
    var today = new Date().toISOString().slice(0, 10);
    var hrName = (window.__hrUser && window.__hrUser.name) || "—";
    window.openModal(
      '<div class="modal-head"><h3>Add Employee</h3><button class="icon-btn" style="width:32px;height:32px" aria-label="Close" data-close="1">✕</button></div>' +
        '<div class="modal-body">' +
        '<div class="field"><label>Assigned HR</label><input type="text" value="' +
        pfEsc(hrName) +
        '" disabled></div>' +
        addEmployeeFieldHtml("aeId", "Employee ID", "text", {
          err: "Please enter an employee ID.",
        }) +
        addEmployeeFieldHtml("aeName", "Full name", "text", {
          err: "Please enter the employee\u2019s full name.",
        }) +
        addEmployeeFieldHtml("aeRole", "Role / Designation", "text") +
        addEmployeeFieldHtml("aeJoin", "Joining date", "date", {
          value: today,
        }) +
        addEmployeeFieldHtml("aeEmpType", "Employment Type", "select", {
          options: ["Full-time", "Part-time", "Contract", "Intern"],
        }) +
        addEmployeeFieldHtml("aeWorkMode", "Work Mode", "select", {
          options: ["On-site", "Hybrid", "Remote", "Work from Home"],
        }) +
        addEmployeeFieldHtml("aeStatus", "Status", "select", {
          options: ["Active", "On Leave", "Probation", "Exited"],
        }) +
        addEmployeeFieldHtml("aeBlood", "Blood Group", "select", {
          options: [
            "A+",
            "A-",
            "B+",
            "B-",
            "AB+",
            "AB-",
            "O+",
            "O-",
            "Unknown",
          ],
        }) +
        addEmployeeFieldHtml("aeEmail", "Email", "email", {
          err: "Please enter a valid email.",
        }) +
        '<div class="field" id="aeServerErr" style="display:none"></div>' +
        "</div>" +
        '<div class="modal-foot"><button class="btn btn-ghost" data-close="1">Cancel</button>' +
        '<button class="btn btn-primary" id="aeSubmit">Add employee</button></div>',
    );

    document
      .getElementById("aeSubmit")
      .addEventListener("click", async function () {
        var id = document.getElementById("aeId").value.trim();
        var name = document.getElementById("aeName").value.trim();
        var email = document.getElementById("aeEmail").value.trim();
        var ok = true;
        document.getElementById("f_aeId").classList.toggle("invalid", !id);
        document.getElementById("f_aeName").classList.toggle("invalid", !name);
        if (!id || !name) ok = false;
        if (!ok) return;

        var btn = document.getElementById("aeSubmit");
        btn.disabled = true;
        btn.textContent = "Adding…";
        var errEl = document.getElementById("aeServerErr");
        errEl.style.display = "none";

        try {
          var r = await hrApi("/api/employees", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              employeeId: id,
              fullName: name,
              designation: document.getElementById("aeRole").value.trim(),
              joiningDate: document.getElementById("aeJoin").value,
              employmentType: document.getElementById("aeEmpType").value,
              workMode: document.getElementById("aeWorkMode").value,
              status: document.getElementById("aeStatus").value,
              bloodGroup: document.getElementById("aeBlood").value,
              email: email,
              // assignedHrId intentionally omitted — backend sets it from the
              // authenticated HR and ignores any client-supplied value.
            }),
          });
          var d = await r.json().catch(function () {
            return {};
          });
          if (!r.ok) {
            errEl.textContent =
              d.message || "Could not add employee (" + r.status + ").";
            errEl.style.display = "block";
            btn.disabled = false;
            btn.textContent = "Add employee";
            return;
          }
          window.closeModal();
          window.toast("Employee added: " + name);
          if (typeof loadEmployees === "function") loadEmployees(); // refresh the real list in place
        } catch (e) {
          errEl.textContent = "Network error — please try again.";
          errEl.style.display = "block";
          btn.disabled = false;
          btn.textContent = "Add employee";
        }
      });
  };

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
        try {
          var lastEmp = localStorage.getItem("hr-last-employee");
          var thisEmp = (d.user && d.user.employeeId) || "";
          localStorage.setItem("hr-last-employee", thisEmp);
          if (lastEmp && lastEmp !== thisEmp) {
            wipePortalSnapshot();
            window.addEventListener("beforeunload", wipePortalSnapshot);
            window.addEventListener("pagehide", wipePortalSnapshot);
            try {
              sessionStorage.setItem("hr-capture-gps", "1");
            } catch (e2) {}
            window.location.reload(); // restore path re-hydrates the NEW user from the server
            return;
          }
        } catch (e) {}
        window.__hrAccess = d.accessToken;
        window.__hrUser = d.user;
        setMirror(d.user);
        var g = gate();
        if (g) g.hidden = true;
        hydrate(d.user);
        setAppReady(true);
        applyPortalSoon(d.user.role); // open the correct portal for this role
        purgeDemoAttendance();
        syncRealAttendance();
        startSessionWidget(); // fresh login → start showing login time / working timer
        captureLoginLocationOnce(); // one-shot GPS capture at login (permission-gated, optional)
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
    clearMirror();
    try {
      localStorage.removeItem("hr-last-employee");
    } catch (e) {}
    wipePortalSnapshot();
    window.addEventListener("beforeunload", wipePortalSnapshot);
    window.addEventListener("pagehide", wipePortalSnapshot);
    // Full reload rather than resetting in-memory state by hand: this portal
    // has many scattered demo/session caches (attendance, KPIs, notifications,
    // audit log, merged employee rows, …) across a large legacy file, and a
    // partial reset risks leaving a stale one behind for the next person who
    // logs in on the same tab (requirement: never show a previous user's data
    // after logout/login). A reload guarantees a clean slate deterministically.
    window.location.reload();
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
    stopSessionWidget();
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

  // ---- Replace the employee directory with the authenticated API result ----
  var employeeLoadError = false;
  async function loadEmployees() {
    if (!window.HRX || !window.HRX.store) return;
    employeeLoadError = false;
    window.__hrEmployeeLoadError = false;
    window.__hrEmployeesLoading = true;
    window.HRX.store.employees = [];
    try {
      var r = await hrApi("/api/employees");
      if (!r.ok) throw new Error("Employee request failed");
      var d = await r.json();
      employeeLoadError = false;
      window.__hrEmployeeLoadError = false;
      window.__hrEmployeesLoading = false;
      window.HRX.store.employees = (d.employees || []).map(function (employee) {
        return {
          id: employee.employeeId,
          employeeId: employee.employeeId,
          _id: employee._id,
          name: employee.fullName,
          email: employee.email || "",
          phone: employee.phone || "",
          gender: employee.gender || "",
          dept: employee.department || "",
          designation: employee.designation || "",
          manager: employee.manager || "",
          empType: employee.employmentType || "",
          location: employee.location || "",
          joining: employee.joiningDate
            ? String(employee.joiningDate).slice(0, 10)
            : "",
          salary: employee.salary,
          grade: employee.grade || "",
          status: employee.status || "",
          assignedHrId: employee.assignedHrId || "",
          probation: employee.status === "Probation",
          __fromApi: true,
        };
      });
      if (
        window.HRX.route === "Employees" &&
        typeof window.HRX.renderRoute === "function"
      )
        window.HRX.renderRoute("Employees");
    } catch (e) {
      employeeLoadError = true;
      window.__hrEmployeeLoadError = true;
      window.__hrEmployeesLoading = false;
      window.HRX.store.employees = [];
      if (
        window.HRX.route === "Employees" &&
        typeof window.HRX.renderRoute === "function"
      )
        window.HRX.renderRoute("Employees");
      toast("Unable to load employee records. Please retry.");
    }
  }

  function canReadPayroll() {
    var user = window.__hrUser || {};
    var permissions = user.permissions || [];
    return (
      ["HR", "ADMIN", "SUPER_ADMIN"].indexOf(user.role) >= 0 ||
      ["*", "payroll:*", "payroll:read"].some(function (permission) {
        return permissions.indexOf(permission) >= 0;
      })
    );
  }
  window.hrCanReadPayroll = canReadPayroll;
  window.__hrEmployeeLoadError = false;
  window.hrRaiseInvoice = function (employeeId) {
    showRealPayslip(employeeId, payrollPeriod(), true);
  };

  var payrollState = { rows: [], loading: false, error: "", requestId: 0 };
  function payrollPeriod() {
    var now = new Date();
    return (
      now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0")
    );
  }
  function payrollRoot() {
    return document.getElementById("hrxRouteBody");
  }
  function payrollTab() {
    var active = document.querySelector("#hrxModuleRoot .hrx-tab.hrx-active");
    return active ? active.getAttribute("data-hrx-tab") : "process";
  }
  function canWritePayroll() {
    var user = window.__hrUser || {};
    var permissions = user.permissions || [];
    if (user.role === "MANAGER" && !canReadPayroll()) return false;
    return (
      ["HR", "ADMIN", "SUPER_ADMIN"].indexOf(user.role) >= 0 ||
      ["*", "payroll:*", "payroll:write"].some(function (permission) {
        return permissions.indexOf(permission) >= 0;
      })
    );
  }
  function payrollMoney(value) {
    return "₹" + Number(value || 0).toLocaleString("en-IN");
  }
  function payrollEmployeeCell(employee) {
    employee = employee || {};
    var name = employee.fullName || "Employee";
    var initials = name
      .split(/\s+/)
      .map(function (part) {
        return part.charAt(0);
      })
      .join("")
      .slice(0, 2)
      .toUpperCase();
    return (
      '<span class="hrx-emp"><span class="avatar" aria-hidden="true">' +
      psEsc(initials) +
      '</span><span class="who"><b>' +
      psEsc(name) +
      "</b><span>" +
      psEsc(employee.employeeId || "") +
      (employee.designation ? " · " + psEsc(employee.designation) : "") +
      (employee.assignedHrId ? " · HR " + psEsc(employee.assignedHrId) : "") +
      "</span></span></span>"
    );
  }
  function payrollStatusClass(status) {
    return status === "Paid" || status === "Processed"
      ? "st-approved"
      : status === "Draft"
        ? "st-pending"
        : "hrx-st-muted";
  }
  function payrollBadge(status) {
    return (
      '<span class="pill-status ' +
      payrollStatusClass(status) +
      '">' +
      psEsc(status || "Draft") +
      "</span>"
    );
  }
  function renderPayrollTable() {
    var root = payrollRoot();
    if (!root || !window.HRX || window.HRX.route !== "Payroll") return;
    if (payrollState.loading) {
      root.innerHTML = '<div class="hrx-hint">Loading salary records…</div>';
      return;
    }
    if (payrollState.error) {
      root.innerHTML =
        '<div class="hrx-hint">Unable to load salary records. ' +
        '<button type="button" class="btn btn-outline btn-sm" data-payroll-action="retry">Retry</button></div>';
      return;
    }
    var allRows = payrollState.rows;
    var period = payrollPeriod();
    var currentRows = allRows.filter(function (row) {
      return row.period === period;
    });
    var writable = canWritePayroll();
    var tab = payrollTab();
    var actions = writable
      ? '<button type="button" class="btn btn-primary" data-payroll-action="generate">Calculate payroll</button>'
      : "";

    if (tab === "process") {
      var gross = currentRows.reduce(function (sum, row) {
        return sum + Number(row.gross || 0);
      }, 0);
      var deductions = currentRows.reduce(function (sum, row) {
        var d = row.deductions || {};
        return (
          sum +
          Number(d.pf || 0) +
          Number(d.tds || 0) +
          Number(d.esi || 0) +
          Number(d.professionalTax || 0) +
          Number(d.loanAdvance || 0) +
          Number(d.other || 0)
        );
      }, 0);
      var net = currentRows.reduce(function (sum, row) {
        return sum + Number(row.net || 0);
      }, 0);
      var hasDraft = currentRows.some(function (row) {
        return row.status === "Draft";
      });
      var hasApproved = currentRows.some(function (row) {
        return row.status === "Approved";
      });
      if (writable && hasDraft)
        actions +=
          ' <button type="button" class="btn btn-outline" data-payroll-action="approve">Approve payroll</button>';
      if (writable && hasApproved)
        actions +=
          ' <button type="button" class="btn btn-outline" data-payroll-action="pay">Process &amp; mark paid</button>';
      if (!currentRows.length) {
        root.innerHTML =
          '<div class="hrx-toolbar"><div class="hrx-hint">' +
          (allRows.length
            ? "No salary records for this payroll month."
            : "No salary records available for your assigned employees.") +
          '</div><span class="hrx-spacer"></span>' +
          actions +
          "</div>";
        return;
      }
      root.innerHTML =
        '<div class="hrx-statrow"><div class="hrx-statchip"><span class="k">Pay period</span><span class="v" style="font-size:16px">' +
        psEsc(period) +
        '</span></div><div class="hrx-statchip"><span class="k">Employees</span><span class="v">' +
        currentRows.length +
        '</span></div><div class="hrx-statchip"><span class="k">Gross total</span><span class="v" style="font-size:17px">' +
        payrollMoney(gross) +
        '</span></div><div class="hrx-statchip"><span class="k">Deductions</span><span class="v" style="font-size:17px">' +
        payrollMoney(deductions) +
        '</span></div><div class="hrx-statchip"><span class="k">Net payout</span><span class="v" style="font-size:17px">' +
        payrollMoney(net) +
        '</span></div></div><div class="hrx-toolbar"><div class="hrx-hint">Salary details are calculated and stored by the payroll service.</div><span class="hrx-spacer"></span>' +
        actions +
        '</div><div class="table-scroll"><table><thead><tr><th>Employee</th><th>Department</th><th>Basic</th><th>Gross</th><th>Deductions</th><th>Net</th><th>Payment</th><th>Payslip</th></tr></thead><tbody>' +
        currentRows
          .map(function (row) {
            var employee = row.employee || {};
            var d = row.deductions || {};
            var totalDeductions =
              Number(d.pf || 0) +
              Number(d.tds || 0) +
              Number(d.esi || 0) +
              Number(d.professionalTax || 0) +
              Number(d.loanAdvance || 0) +
              Number(d.other || 0);
            return (
              "<tr><td>" +
              payrollEmployeeCell(employee) +
              "</td><td>" +
              psEsc(employee.department || "—") +
              '</td><td class="num">' +
              payrollMoney(row.basic) +
              '</td><td class="num">' +
              payrollMoney(row.gross) +
              '</td><td class="num">' +
              payrollMoney(totalDeductions) +
              '</td><td class="num">' +
              payrollMoney(row.net) +
              "</td><td>" +
              payrollBadge(row.status) +
              (row.payDate ? "<br>" + psEsc(psDate(row.payDate)) : "") +
              "</td><td>" +
              (writable
                ? '<button type="button" class="btn btn-outline btn-sm" data-payroll-edit="' +
                  psEsc(row._id) +
                  '">Edit</button> '
                : "") +
              '<button type="button" class="btn btn-outline btn-sm" data-hrx-special="payslip:' +
              psEsc(employee.employeeId || "") +
              ":" +
              psEsc(row.period) +
              '">Payslip</button></td></tr>'
            );
          })
          .join("") +
        "</tbody></table></div>";
      return;
    }

    if (!allRows.length) {
      root.innerHTML =
        '<div class="hrx-toolbar"><div class="hrx-hint">No salary records available for your assigned employees.</div><span class="hrx-spacer"></span>' +
        actions +
        "</div>";
      return;
    }
    if (tab === "structure") {
      root.innerHTML =
        '<div class="hrx-hint" style="margin-bottom:12px">Persisted salary structure by payroll month.</div><div class="table-scroll"><table><thead><tr><th>Employee</th><th>Designation</th><th>Department</th><th>Assigned HR</th><th>Payroll Month</th><th>Basic</th><th>Allowances</th><th>Bonus</th><th>Overtime</th><th>Deductions</th><th>Gross</th><th>Net</th></tr></thead><tbody>' +
        allRows
          .map(function (row) {
            var employee = row.employee || {},
              a = row.allowances || {},
              d = row.deductions || {};
            var totalDeductions =
              Number(d.pf || 0) +
              Number(d.tds || 0) +
              Number(d.esi || 0) +
              Number(d.professionalTax || 0) +
              Number(d.loanAdvance || 0) +
              Number(d.other || 0);
            var allowances =
              Number(a.hra || 0) +
              Number(a.conveyance || 0) +
              Number(a.special || 0) +
              Number(a.other || 0);
            return (
              "<tr><td>" +
              payrollEmployeeCell(employee) +
              "</td><td>" +
              psEsc(employee.designation || "—") +
              "</td><td>" +
              psEsc(employee.department || "—") +
              "</td><td>" +
              psEsc(employee.assignedHrId || "—") +
              "</td><td>" +
              psEsc(row.period) +
              '</td><td class="num">' +
              payrollMoney(row.basic) +
              '</td><td class="num">' +
              payrollMoney(allowances) +
              '</td><td class="num">' +
              payrollMoney(row.bonus) +
              '</td><td class="num">' +
              payrollMoney(row.overtime) +
              '</td><td class="num">' +
              payrollMoney(totalDeductions) +
              '</td><td class="num">' +
              payrollMoney(row.gross) +
              '</td><td class="num">' +
              payrollMoney(row.net) +
              "</td></tr>"
            );
          })
          .join("") +
        "</tbody></table></div>";
      return;
    }
    if (tab === "payslips") {
      root.innerHTML =
        '<div class="table-scroll"><table><thead><tr><th>Employee</th><th>Department</th><th>Payroll Month</th><th>Net pay</th><th>Status</th><th>Payslip</th></tr></thead><tbody>' +
        allRows
          .map(function (row) {
            var employee = row.employee || {};
            return (
              "<tr><td>" +
              payrollEmployeeCell(employee) +
              "</td><td>" +
              psEsc(employee.department || "—") +
              "</td><td>" +
              psEsc(row.period) +
              '</td><td class="num">' +
              payrollMoney(row.net) +
              "</td><td>" +
              payrollBadge(row.status) +
              '</td><td><button type="button" class="btn btn-outline btn-sm" data-hrx-special="payslip:' +
              psEsc(employee.employeeId || "") +
              ":" +
              psEsc(row.period) +
              '">View payslip</button></td></tr>'
            );
          })
          .join("") +
        "</tbody></table></div>";
      return;
    }
    var byPeriod = {};
    allRows.forEach(function (row) {
      var summary =
        byPeriod[row.period] ||
        (byPeriod[row.period] = { rows: 0, net: 0, status: row.status });
      summary.rows++;
      summary.net += Number(row.net || 0);
      if (summary.status !== row.status) summary.status = "Mixed";
    });
    root.innerHTML =
      '<div class="table-scroll"><table><thead><tr><th>Payroll ID</th><th>Period</th><th>Employees</th><th>Net payout</th><th>Status</th></tr></thead><tbody>' +
      Object.keys(byPeriod)
        .sort()
        .reverse()
        .map(function (key) {
          var run = byPeriod[key];
          return (
            '<tr><td class="num">PAY-' +
            psEsc(key.replace("-", "")) +
            "</td><td>" +
            psEsc(key) +
            '</td><td class="num">' +
            run.rows +
            '</td><td class="num">' +
            payrollMoney(run.net) +
            "</td><td>" +
            payrollBadge(run.status) +
            "</td></tr>"
          );
        })
        .join("") +
      "</tbody></table></div>";
  }
  async function loadPayroll() {
    if (!window.HRX || window.HRX.route !== "Payroll") return;
    var requestId = ++payrollState.requestId;
    payrollState.loading = true;
    payrollState.error = "";
    renderPayrollTable();
    try {
      var response = await hrApi("/api/payroll");
      if (!response.ok) throw new Error("Payroll request failed");
      var data = await response.json();
      if (requestId !== payrollState.requestId) return;
      payrollState.rows = (data.payroll || []).filter(function (row) {
        return row.employee;
      });
    } catch (e) {
      if (requestId !== payrollState.requestId) return;
      payrollState.error = "Unable to load payroll records.";
    } finally {
      if (requestId === payrollState.requestId) {
        payrollState.loading = false;
        renderPayrollTable();
      }
    }
  }
  function openPayrollEdit(id) {
    var row = payrollState.rows.find(function (item) {
      return item._id === id;
    });
    if (!row) return;
    var a = row.allowances || {},
      d = row.deductions || {};
    var input = function (id, label, value) {
      return (
        '<div class="field"><label for="' +
        id +
        '">' +
        label +
        '</label><input id="' +
        id +
        '" type="number" min="0" step="0.01" value="' +
        Number(value || 0) +
        '"></div>'
      );
    };
    var textInput = function (id, label, value) {
      return (
        '<div class="field"><label for="' +
        id +
        '">' +
        label +
        '</label><input id="' +
        id +
        '" type="text" value="' +
        psEsc(value || "") +
        '"></div>'
      );
    };
    var html =
      '<div class="modal-head"><h3>Edit salary · ' +
      psEsc(row.employee.fullName) +
      '</h3><button class="icon-btn" type="button" data-close="1" aria-label="Close">×</button></div><div class="modal-body"><div class="hrx-detail"><dt>Employee ID</dt><dd>' +
      psEsc(row.employee.employeeId) +
      "</dd><dt>Designation</dt><dd>" +
      psEsc(row.employee.designation || "—") +
      "</dd><dt>Department</dt><dd>" +
      psEsc(row.employee.department || "—") +
      "</dd><dt>Assigned HR</dt><dd>" +
      psEsc(row.employee.assignedHrId || "—") +
      "</dd><dt>Payroll month</dt><dd>" +
      psEsc(row.period) +
      '</dd></div><div class="form-grid">' +
      input("hrPayrollBasic", "Basic salary", row.basic) +
      input("hrPayrollBonus", "Bonus", row.bonus) +
      input("hrPayrollOvertime", "Overtime", row.overtime) +
      input("hrPayrollHra", "HRA", a.hra) +
      input("hrPayrollConveyance", "Conveyance", a.conveyance) +
      input("hrPayrollSpecial", "Special allowance", a.special) +
      input("hrPayrollOtherAllowance", "Other allowance", a.other) +
      input("hrPayrollPf", "PF deduction", d.pf) +
      input("hrPayrollTds", "TDS deduction", d.tds) +
      input("hrPayrollEsi", "ESI deduction", d.esi) +
      input("hrPayrollPt", "Professional tax", d.professionalTax) +
      input("hrPayrollLoanAdvance", "Loan / advance", d.loanAdvance) +
      input("hrPayrollOtherDeduction", "Other deduction", d.other) +
      '<div class="field"><label for="hrPayrollStatus">Payment status</label><select id="hrPayrollStatus"><option>Draft</option><option>Approved</option><option>Processed</option><option>Paid</option></select></div><div class="field"><label for="hrPayrollPayDate">Payment date</label><input id="hrPayrollPayDate" type="date" value="' +
      (row.payDate ? psEsc(String(row.payDate).slice(0, 10)) : "") +
      '"></div>' +
      textInput("hrPayrollMode", "Payment mode", row.paymentMode) +
      textInput("hrPayrollTransaction", "Transaction ID", row.transactionId) +
      textInput("hrPayrollReference", "Reference", row.reference) +
      textInput("hrPayrollUtr", "UTR", row.utr) +
      '</div></div><div class="modal-foot"><button class="btn btn-ghost" type="button" data-close="1">Cancel</button><button class="btn btn-primary" type="button" data-payroll-save="' +
      psEsc(id) +
      '">Save changes</button></div>';
    if (typeof openModal === "function") openModal(html);
    var status = document.getElementById("hrPayrollStatus");
    if (status) status.value = row.status || "Draft";
  }
  function payrollNumber(id) {
    return Number((document.getElementById(id) || {}).value || 0);
  }
  async function handlePayrollAction(action, id) {
    try {
      if (action === "retry") return loadPayroll();
      if (action === "generate") {
        var generated = await hrApi("/api/payroll/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ period: payrollPeriod() }),
        });
        if (!generated.ok) throw new Error("Payroll generation failed");
      } else if (action === "approve" || action === "pay") {
        var targetStatus = action === "approve" ? "Approved" : "Paid";
        var current = payrollState.rows.filter(function (row) {
          return (
            row.period === payrollPeriod() &&
            row.status === (action === "approve" ? "Draft" : "Approved")
          );
        });
        await Promise.all(
          current.map(async function (row) {
            var result = await hrApi(
              "/api/payroll/" + encodeURIComponent(row._id),
              {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  status: targetStatus,
                  ...(action === "pay"
                    ? { payDate: new Date().toISOString().slice(0, 10) }
                    : {}),
                }),
              },
            );
            if (!result.ok) throw new Error("Payroll update failed");
          }),
        );
      } else if (action === "save") {
        var saved = await hrApi("/api/payroll/" + encodeURIComponent(id), {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            basic: payrollNumber("hrPayrollBasic"),
            bonus: payrollNumber("hrPayrollBonus"),
            overtime: payrollNumber("hrPayrollOvertime"),
            allowances: {
              hra: payrollNumber("hrPayrollHra"),
              conveyance: payrollNumber("hrPayrollConveyance"),
              special: payrollNumber("hrPayrollSpecial"),
              other: payrollNumber("hrPayrollOtherAllowance"),
            },
            deductions: {
              pf: payrollNumber("hrPayrollPf"),
              tds: payrollNumber("hrPayrollTds"),
              esi: payrollNumber("hrPayrollEsi"),
              professionalTax: payrollNumber("hrPayrollPt"),
              loanAdvance: payrollNumber("hrPayrollLoanAdvance"),
              other: payrollNumber("hrPayrollOtherDeduction"),
            },
            status: document.getElementById("hrPayrollStatus").value,
            payDate: document.getElementById("hrPayrollPayDate").value || null,
            paymentMode: document.getElementById("hrPayrollMode").value,
            transactionId: document.getElementById("hrPayrollTransaction")
              .value,
            reference: document.getElementById("hrPayrollReference").value,
            utr: document.getElementById("hrPayrollUtr").value,
          }),
        });
        if (!saved.ok) throw new Error("Payroll update failed");
        if (typeof closeModal === "function") closeModal();
      }
      await loadPayroll();
    } catch (e) {
      payrollState.error =
        "Unable to save or update payroll. Check your access and try again.";
      payrollState.loading = false;
      renderPayrollTable();
      toast("Unable to update payroll. Please try again.");
    }
  }
  document.addEventListener(
    "click",
    function (ev) {
      var retry =
        ev.target.closest && ev.target.closest("[data-employee-retry]");
      if (!retry) return;
      ev.preventDefault();
      ev.stopImmediatePropagation();
      loadEmployees();
    },
    true,
  );
  document.addEventListener(
    "click",
    function (ev) {
      var edit = ev.target.closest && ev.target.closest("[data-payroll-edit]");
      if (edit) {
        ev.preventDefault();
        ev.stopImmediatePropagation();
        openPayrollEdit(edit.getAttribute("data-payroll-edit"));
        return;
      }
      var save = ev.target.closest && ev.target.closest("[data-payroll-save]");
      if (save) {
        ev.preventDefault();
        ev.stopImmediatePropagation();
        handlePayrollAction("save", save.getAttribute("data-payroll-save"));
        return;
      }
      var action =
        ev.target.closest && ev.target.closest("[data-payroll-action]");
      if (action) {
        ev.preventDefault();
        ev.stopImmediatePropagation();
        handlePayrollAction(action.getAttribute("data-payroll-action"));
      }
    },
    true,
  );
  document.addEventListener(
    "click",
    function (ev) {
      if (
        window.HRX &&
        window.HRX.route === "Payroll" &&
        ev.target.closest &&
        ev.target.closest("[data-hrx-tab]")
      ) {
        window.setTimeout(loadPayroll, 0);
      }
    },
    false,
  );

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
      if (page === "Employees" && window.HRX && window.HRX.store) {
        window.HRX.store.employees = [];
        window.__hrEmployeeLoadError = false;
        window.__hrEmployeesLoading = true;
      }
      var out = orig.apply(this, arguments);
      if (page === "Employees") loadEmployees();
      else if (page === "Payroll") loadPayroll();
      else if (page === "Attendance") syncRealAttendance();
      else if (page === "Dashboard") loadDashboard();
      else if (page === "Leave" || page === "Leave Approvals") {
        loadCurrentEmployee();
        syncRealAttendance();
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
          purgeDemoAttendance();
          syncRealAttendance();
          try {
            if (sessionStorage.getItem("hr-capture-gps")) {
              sessionStorage.removeItem("hr-capture-gps");
              captureLoginLocationOnce(); // this WAS a fresh login; the reload just deferred it
            }
          } catch (e3) {}
          startSessionWidget(); // restore an existing session's timer (no new GPS capture — not a fresh login)
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
