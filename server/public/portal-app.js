/* ===== portal inline block 1/11 (externalized for CSP; order preserved) ===== */

"use strict";
/* ============================================================
   CYETHACK HRM — dashboard logic
   All sample data lives in DATA (spec section 6). Edit numbers
   here; every widget renders from this object.
   ============================================================ */
const DATA = {
  kpis: {
    totalEmployees: 248,
    presentToday: 221,
    onLeaveToday: 27,
    pendingApprovals: 11,
  },
  attendance: {
    // "This month": 20 working days (spec 4.4)
    present: [
      212, 218, 221, 209, 215, 224, 219, 226, 213, 217, 228, 222, 216, 230, 225,
      219, 227, 233, 221, 221,
    ],
    wfh: [
      18, 21, 17, 24, 19, 16, 22, 20, 25, 18, 15, 21, 23, 17, 19, 22, 18, 16,
      20, 19,
    ],
  },
  departments: [
    // donut, clockwise from 12 o'clock (spec 4.5)
    { name: "Security Operations", count: 96, color: "var(--teal)" },
    { name: "Engineering", count: 74, color: "var(--violet)" },
    { name: "Sales & Marketing", count: 46, color: "var(--orange)" },
    { name: "Operations", count: 32, color: "var(--blue)" },
  ],
  leaveRequests: [
    // spec 4.6
    {
      name: "Rahul Mehta",
      role: "Security Analyst",
      type: "Casual Leave",
      dates: "28–29 Aug",
      days: 2,
      status: "Pending",
    },
    {
      name: "Priya Nair",
      role: "Frontend Developer",
      type: "Sick Leave",
      dates: "26 Aug",
      days: 1,
      status: "Approved",
    },
    {
      name: "Karan Gupta",
      role: "Sales Executive",
      type: "Earned Leave",
      dates: "1–5 Sep",
      days: 5,
      status: "Pending",
    },
    {
      name: "Sneha Iyer",
      role: "HR Executive",
      type: "Comp-Off",
      dates: "31 Aug",
      days: 1,
      status: "Approved",
    },
    {
      name: "Vikram Singh",
      role: "SOC Engineer",
      type: "Casual Leave",
      dates: "25 Aug",
      days: 1,
      status: "Rejected",
    },
  ],
  funnel: [
    // spec 4.7 — teal ramp
    { stage: "Applied", count: 128, color: "#7FD4C1" },
    { stage: "Screening", count: 64, color: "#63BBA8" },
    { stage: "Interview", count: 28, color: "#509888" },
    { stage: "Offer", count: 12, color: "#3F7A6E" },
    { stage: "Joined", count: 6, color: "#2F5D54" },
  ],
  events: [
    // spec 4.8
    {
      day: "28",
      month: "Aug",
      title: "Ananya Rao's birthday",
      detail: "Engineering",
    },
    {
      day: "01",
      month: "Sep",
      title: "August payroll pay date",
      detail: "Finance & HR",
    },
    {
      day: "03",
      month: "Sep",
      title: "Q3 performance reviews begin",
      detail: "All departments",
    },
    {
      day: "08",
      month: "Sep",
      title: "New-joiner orientation",
      detail: "4 joiners · Conference Room A",
    },
  ],
  announcements: [
    // spec 4.9
    {
      title: "Revised leave policy effective 1 September",
      text: "Casual leave increases to 12 days a year; comp-off validity is now 4 months.",
      meta: "HR · 2 h ago",
    },
    {
      title: "Cybersecurity awareness training — 12 Sep",
      text: "Mandatory 2-hour session for all staff; slots open in the Performance module.",
      meta: "L&D · 1 d ago",
    },
    {
      title: "Diwali holiday schedule published",
      text: "Offices closed 7–9 Nov; on-call roster shared with SOC leads.",
      meta: "Admin · 3 d ago",
    },
  ],
  notifications: [
    // spec 4.2
    {
      text: "Rahul Mehta applied for Casual Leave (28–29 Aug)",
      time: "10 min ago",
      read: false,
    },
    {
      text: "August payroll draft is ready for review",
      time: "1 h ago",
      read: false,
    },
    {
      text: "3 new candidates applied for SOC Analyst",
      time: "2 h ago",
      read: false,
    },
  ],
};

/* ---------------- tiny helpers ---------------- */
const $ = (id) => document.getElementById(id);
const SVGNS = "http://www.w3.org/2000/svg";
function svgEl(tag, attrs) {
  const e = document.createElementNS(SVGNS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  return e;
}

/* Lucide-style inline icons (spec 2.4) — 1.75px stroke, currentColor */
const PATHS = {
  dashboard:
    '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  users:
    '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  userCheck:
    '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="m16 11 2 2 4-4"/>',
  userPlus:
    '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6"/><path d="M22 11h-6"/>',
  calendar:
    '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/>',
  clipboardCheck:
    '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/>',
  banknote:
    '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01"/><path d="M18 12h.01"/>',
  briefcase:
    '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>',
  trendingUp: '<path d="m22 7-8.5 8.5-5-5L2 17"/><path d="M16 7h6v6"/>',
  fileText:
    '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M16 13H8"/><path d="M16 17H8"/>',
  barChart:
    '<path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>',
  settings:
    '<path d="M21 4h-7"/><path d="M10 4H3"/><path d="M21 12h-9"/><path d="M8 12H3"/><path d="M21 20h-5"/><path d="M12 20H3"/><path d="M14 2v4"/><path d="M8 10v4"/><path d="M16 18v4"/>',
  logout:
    '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
  chevrons: '<path d="m11 17-5-5 5-5"/><path d="m18 17-5-5 5-5"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>',
  plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  menu: '<path d="M4 6h16"/><path d="M4 12h16"/><path d="M4 18h16"/>',
  user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
};
function icon(name, size) {
  size = size || 18;
  return (
    '<svg width="' +
    size +
    '" height="' +
    size +
    '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    PATHS[name] +
    "</svg>"
  );
}

/* Toasts (spec 4.11) */
function toast(msg) {
  const t = document.createElement("div");
  t.className = "toast";
  t.textContent = msg;
  $("toasts").appendChild(t);
  setTimeout(() => {
    t.style.transition = "opacity .25s";
    t.style.opacity = "0";
    setTimeout(() => t.remove(), 260);
  }, 3000);
}

/* Tooltip (spec 4.11) */
const tip = $("tooltip");
function tipShow(html, x, y) {
  tip.innerHTML = html;
  tip.hidden = false;
  const r = tip.getBoundingClientRect();
  let left = x + 12,
    top = y + 12;
  if (left + r.width > window.innerWidth - 8) left = x - r.width - 12;
  if (top + r.height > window.innerHeight - 8) top = y - r.height - 12;
  tip.style.left = left + "px";
  tip.style.top = top + "px";
}
function tipHide() {
  tip.hidden = true;
}

/* Date helpers — real dates, weekends skipped */
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
function lastWorkingDays(n) {
  // n working days ending today (or the last weekday)
  const out = [];
  const d = new Date();
  while (out.length < n) {
    if (d.getDay() !== 0 && d.getDay() !== 6) out.unshift(new Date(d));
    d.setDate(d.getDate() - 1);
  }
  return out;
}
const dShort = (d) => d.getDate() + " " + MONTHS[d.getMonth()];

/* Deterministic PRNG so "Last month" / "90 days" look the same every load */
function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function genSeries(n, min, max, seed) {
  const r = mulberry32(seed);
  return Array.from({ length: n }, () => Math.round(min + r() * (max - min)));
}

/* The three chart ranges (spec 4.4) */
const allDays = lastWorkingDays(100);
const RANGES = {
  month: {
    label: "This month",
    dates: allDays.slice(-20),
    present: DATA.attendance.present,
    wfh: DATA.attendance.wfh,
    endsToday: true,
  },
  last: {
    label: "Last month",
    dates: allDays.slice(-40, -20),
    present: genSeries(20, 205, 235, 20260701),
    wfh: genSeries(20, 14, 26, 20260702),
    endsToday: false,
  },
  d90: {
    label: "90 days",
    dates: allDays.slice(-60),
    present: genSeries(60, 205, 235, 20260801),
    wfh: genSeries(60, 14, 26, 20260802),
    endsToday: true,
  },
};
let currentRange = "month";

/* ============================================================
   NAVIGATION (spec 4.1) — only Dashboard is real
   ============================================================ */
const NAV = [
  {
    group: "Main",
    items: [
      { name: "Dashboard", icon: "dashboard" },
      { name: "Employees", icon: "users" },
      { name: "Attendance", icon: "userCheck" },
      { name: "Leave", icon: "calendar" },
      { name: "Payroll", icon: "banknote" },
      { name: "Recruitment", icon: "briefcase" },
      { name: "Performance", icon: "trendingUp" },
    ],
  },
  {
    group: "More",
    items: [
      { name: "Documents", icon: "fileText" },
      { name: "Reports", icon: "barChart" },
      { name: "Settings", icon: "settings" },
    ],
  },
];
function buildNav() {
  const nav = $("nav");
  nav.innerHTML = "";
  NAV.forEach((g) => {
    const lab = document.createElement("div");
    lab.className = "nav-label";
    lab.textContent = g.group;
    nav.appendChild(lab);
    g.items.forEach((it) => {
      const b = document.createElement("button");
      b.className = "nav-item";
      b.dataset.page = it.name;
      b.innerHTML =
        icon(it.icon) + '<span class="nav-text">' + it.name + "</span>";
      b.title = it.name;
      b.addEventListener("click", () => navigate(it.name));
      nav.appendChild(b);
    });
  });
}
function navigate(page) {
  document.querySelectorAll(".nav-item").forEach((b) => {
    if (b.dataset.page === page) b.setAttribute("aria-current", "page");
    else b.removeAttribute("aria-current");
  });
  $("pageTitle").textContent = page;
  const dash = page === "Dashboard";
  $("dashboardPage").hidden = !dash;
  $("modulePage").hidden = dash;
  if (!dash) {
    const item = NAV.flatMap((g) => g.items).find((i) => i.name === page);
    $("moduleIcon").innerHTML = icon(item ? item.icon : "dashboard", 40);
    $("moduleTitle").textContent = page;
  }
  document.body.classList.remove("drawer-open");
  $("mobileScrim").hidden = true;
  $("content").scrollTop = 0;
}

/* ============================================================
   ROW 1 — KPI cards (spec 4.3)
   ============================================================ */
const KPIS = [
  {
    key: "totalEmployees",
    label: "Total Employees",
    icon: "users",
    color: "var(--teal)",
    tint: "var(--teal-tint)",
    sub: () => "↑ +12 joined this month",
    subColor: "var(--green)",
    goto: "Employees",
  },
  {
    key: "presentToday",
    label: "Present Today",
    icon: "userCheck",
    color: "var(--green)",
    tint: "var(--green-tint)",
    sub: () => "89% attendance · 19 WFH",
    subColor: "var(--green)",
    goto: "Attendance",
  },
  {
    key: "onLeaveToday",
    label: "On Leave Today",
    icon: "calendar",
    color: "var(--amber)",
    tint: "var(--amber-tint)",
    sub: () => "11% of workforce",
    subColor: "var(--text-2)",
    goto: "Leave",
  },
  {
    key: "pendingApprovals",
    label: "Pending Approvals",
    icon: "clipboardCheck",
    color: "var(--violet)",
    tint: "var(--violet-tint)",
    sub: () => "Action required",
    subColor: "var(--amber)",
    goto: "Leave",
  },
];
function renderKPIs(countUp) {
  document.querySelectorAll(".kpi").forEach((n) => n.remove());
  const grid = $("dashboardPage");
  const frag = document.createDocumentFragment();
  KPIS.forEach((k, i) => {
    const c = document.createElement("button");
    c.className = "card kpi span3";
    c.style.order = String(i + 1);
    c.setAttribute("aria-label", k.label + ": " + DATA.kpis[k.key]);
    c.innerHTML =
      '<span style="min-width:0;text-align:left"><span class="label">' +
      k.label +
      "</span>" +
      '<span class="value" data-kpi="' +
      k.key +
      '">' +
      (countUp ? 0 : DATA.kpis[k.key]) +
      "</span>" +
      '<span class="delta" style="color:' +
      k.subColor +
      '">' +
      k.sub() +
      "</span></span>" +
      '<span class="chipbox" style="background:' +
      k.tint +
      ";color:" +
      k.color +
      '">' +
      icon(k.icon, 20) +
      "</span>";
    c.querySelector(".value").style.display = "block";
    c.querySelector(".label").style.display = "block";
    c.addEventListener("click", () => navigate(k.goto));
    frag.appendChild(c);
  });
  grid.prepend(frag);
  if (countUp) {
    document.querySelectorAll(".value[data-kpi]").forEach((elv) => {
      const target = DATA.kpis[elv.dataset.kpi];
      const t0 = performance.now();
      (function step(t) {
        const p = Math.min(1, (t - t0) / 600);
        elv.textContent = Math.round(
          target * (0.5 - Math.cos(Math.PI * p) / 2),
        );
        if (p < 1) requestAnimationFrame(step);
      })(t0);
    });
  }
}

/* ============================================================
   ROW 2 LEFT — Attendance line chart, hand-drawn SVG (spec 4.4)
   ============================================================ */
function renderLineChart() {
  const box = $("lineChart");
  box.innerHTML = "";
  const W = box.clientWidth || 600,
    H = box.clientHeight || 230;
  const padL = 36,
    padR = 12,
    padT = 10,
    padB = 22;
  const r = RANGES[currentRange];
  const n = r.present.length,
    maxY = 250;
  const X = (i) => padL + (i * (W - padL - padR)) / (n - 1);
  const Y = (v) => padT + (H - padT - padB) * (1 - v / maxY);
  const svg = svgEl("svg", {
    width: W,
    height: H,
    role: "img",
    "aria-label":
      "Attendance line chart, " +
      r.label +
      ": Present and Work-from-home headcount per working day",
  });

  // gradient for the teal area
  const defs = svgEl("defs", {});
  defs.innerHTML =
    '<linearGradient id="tealFade" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0" stop-color="rgba(80,152,136,0.35)"/><stop offset="1" stop-color="rgba(80,152,136,0)"/></linearGradient>';
  svg.appendChild(defs);

  // horizontal grid + y labels (ticks every 50)
  for (let v = 0; v <= maxY; v += 50) {
    svg.appendChild(
      svgEl("line", {
        x1: padL,
        x2: W - padR,
        y1: Y(v),
        y2: Y(v),
        stroke: "#243352",
        "stroke-width": 1,
      }),
    );
    const t = svgEl("text", {
      x: padL - 8,
      y: Y(v) + 4,
      "text-anchor": "end",
      style: "font:500 11px var(--mono);fill:#64748B",
    });
    t.textContent = v;
    svg.appendChild(t);
  }
  // x labels: one per week + "Today" on ranges ending today
  const labIdx = n === 20 ? [0, 5, 10, 15, 19] : [0, 10, 20, 30, 40, 50, 59];
  labIdx.forEach((i) => {
    const t = svgEl("text", {
      x: X(i),
      y: H - 6,
      "text-anchor": i === 0 ? "start" : i === n - 1 ? "end" : "middle",
      style: "font:500 11px var(--mono);fill:#64748B",
    });
    t.textContent = i === n - 1 && r.endsToday ? "Today" : dShort(r.dates[i]);
    svg.appendChild(t);
  });

  // smooth path builder (Catmull-Rom → cubic bézier)
  function smoothPath(vals) {
    const pts = vals.map((v, i) => [X(i), Y(v)]);
    let d = "M" + pts[0][0] + " " + pts[0][1];
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)],
        p1 = pts[i],
        p2 = pts[i + 1],
        p3 = pts[Math.min(pts.length - 1, i + 2)];
      const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
      const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      d +=
        "C" +
        c1[0].toFixed(1) +
        " " +
        c1[1].toFixed(1) +
        " " +
        c2[0].toFixed(1) +
        " " +
        c2[1].toFixed(1) +
        " " +
        p2[0].toFixed(1) +
        " " +
        p2[1].toFixed(1);
    }
    return d;
  }
  const dPresent = smoothPath(r.present);
  // area fill under the Present line
  const area = svgEl("path", {
    d:
      dPresent + " L" + X(n - 1) + " " + Y(0) + " L" + X(0) + " " + Y(0) + " Z",
    fill: "url(#tealFade)",
    stroke: "none",
  });
  svg.appendChild(area);
  // WFH dashed violet line
  const wfhLine = svgEl("path", {
    d: smoothPath(r.wfh),
    fill: "none",
    stroke: "#8B5CF6",
    "stroke-width": 2,
    "stroke-dasharray": "6 4",
  });
  svg.appendChild(wfhLine);
  // Present teal line, drawn in over 400ms
  const line = svgEl("path", {
    d: dPresent,
    fill: "none",
    stroke: "#509888",
    "stroke-width": 2,
    "stroke-linecap": "round",
  });
  svg.appendChild(line);
  try {
    const len = line.getTotalLength();
    line.style.strokeDasharray = len;
    line.style.strokeDashoffset = len;
    line.getBoundingClientRect(); // force layout so the transition runs
    line.style.transition = "stroke-dashoffset .4s ease-out";
    line.style.strokeDashoffset = "0";
    area.style.opacity = "0";
    area.style.transition = "opacity .4s ease-out";
    requestAnimationFrame(() => (area.style.opacity = "1"));
  } catch (e) {
    /* older engines: show instantly */
  }

  // crosshair + hover dots + capture rect
  const cross = svgEl("line", {
    y1: padT,
    y2: H - padB,
    stroke: "#34456B",
    "stroke-width": 1,
    visibility: "hidden",
  });
  const dotP = svgEl("circle", {
    r: 6,
    fill: "#509888",
    stroke: "#172238",
    "stroke-width": 2,
    visibility: "hidden",
  });
  const dotW = svgEl("circle", {
    r: 6,
    fill: "#8B5CF6",
    stroke: "#172238",
    "stroke-width": 2,
    visibility: "hidden",
  });
  svg.appendChild(cross);
  svg.appendChild(dotP);
  svg.appendChild(dotW);
  const cap = svgEl("rect", {
    x: padL,
    y: padT,
    width: W - padL - padR,
    height: H - padT - padB,
    fill: "transparent",
  });
  cap.style.cursor = "crosshair";
  cap.addEventListener("mousemove", (ev) => {
    const bb = svg.getBoundingClientRect();
    const i = Math.max(
      0,
      Math.min(
        n - 1,
        Math.round(
          (ev.clientX - bb.left - padL) / ((W - padL - padR) / (n - 1)),
        ),
      ),
    );
    cross.setAttribute("x1", X(i));
    cross.setAttribute("x2", X(i));
    cross.setAttribute("visibility", "visible");
    dotP.setAttribute("cx", X(i));
    dotP.setAttribute("cy", Y(r.present[i]));
    dotP.setAttribute("visibility", "visible");
    dotW.setAttribute("cx", X(i));
    dotW.setAttribute("cy", Y(r.wfh[i]));
    dotW.setAttribute("visibility", "visible");
    tipShow(
      '<div class="tt-title">' +
        DAYS[r.dates[i].getDay()] +
        ", " +
        dShort(r.dates[i]) +
        "</div>" +
        '<div class="tt-row"><span class="dot" style="background:#509888"></span>Present<b>' +
        r.present[i] +
        "</b></div>" +
        '<div class="tt-row"><span class="dot" style="background:#8B5CF6"></span>Work from home<b>' +
        r.wfh[i] +
        "</b></div>",
      ev.clientX,
      ev.clientY,
    );
  });
  cap.addEventListener("mouseleave", () => {
    tipHide();
    [cross, dotP, dotW].forEach((o) => o.setAttribute("visibility", "hidden"));
  });
  svg.appendChild(cap);
  box.appendChild(svg);

  // visually hidden data table for screen readers (spec 7)
  const sr = document.createElement("div");
  sr.className = "sr-only";
  sr.textContent =
    "Attendance data, " +
    r.label +
    ". Present: " +
    r.present.join(", ") +
    ". Work from home: " +
    r.wfh.join(", ") +
    ".";
  box.appendChild(sr);
}
function buildRangePills() {
  const wrap = $("rangePills");
  wrap.innerHTML = "";
  Object.keys(RANGES).forEach((key) => {
    const b = document.createElement("button");
    b.className = "pill" + (key === currentRange ? " active" : "");
    b.textContent = RANGES[key].label;
    b.setAttribute("aria-pressed", key === currentRange ? "true" : "false");
    b.addEventListener("click", () => {
      currentRange = key;
      buildRangePills();
      renderLineChart();
    });
    wrap.appendChild(b);
  });
}

/* ============================================================
   ROW 2 RIGHT — Department donut (spec 4.5)
   ============================================================ */
const DEPT_HEX = {
  "var(--teal)": "#509888",
  "var(--violet)": "#8B5CF6",
  "var(--orange)": "#F97316",
  "var(--blue)": "#3B82F6",
};
function renderDonut() {
  const box = $("donutBox");
  box.innerHTML = "";
  const size = 160,
    ring = 22,
    r = (size - ring) / 2,
    cx = size / 2,
    cy = size / 2;
  const total = DATA.departments.reduce((s, d) => s + d.count, 0);
  const gap = 2.5; // degrees between segments
  const svg = svgEl("svg", {
    width: size,
    height: size,
    role: "img",
    "aria-label":
      "Department distribution donut: " +
      DATA.departments.map((d) => d.name + " " + d.count).join(", "),
  });
  let angle = -90;
  DATA.departments.forEach((d, idx) => {
    const sweep = (d.count / total) * 360 - gap;
    const a0 = angle + gap / 2,
      a1 = a0 + sweep;
    const p0 = [
      cx + r * Math.cos((a0 * Math.PI) / 180),
      cy + r * Math.sin((a0 * Math.PI) / 180),
    ];
    const p1 = [
      cx + r * Math.cos((a1 * Math.PI) / 180),
      cy + r * Math.sin((a1 * Math.PI) / 180),
    ];
    const seg = svgEl("path", {
      d:
        "M" +
        p0[0].toFixed(2) +
        " " +
        p0[1].toFixed(2) +
        " A" +
        r +
        " " +
        r +
        " 0 " +
        (sweep > 180 ? 1 : 0) +
        " 1 " +
        p1[0].toFixed(2) +
        " " +
        p1[1].toFixed(2),
      fill: "none",
      stroke: DEPT_HEX[d.color] || d.color,
      "stroke-width": ring,
    });
    seg.style.transition = "stroke-width .15s ease";
    seg.dataset.idx = idx;
    seg.addEventListener("mousemove", (ev) => {
      highlightDept(idx, true);
      tipShow(
        '<div class="tt-title">' +
          d.name +
          '</div><div class="tt-row">' +
          d.count +
          " employees (" +
          Math.round((d.count / total) * 100) +
          "%)</div>",
        ev.clientX,
        ev.clientY,
      );
    });
    seg.addEventListener("mouseleave", () => {
      highlightDept(idx, false);
      tipHide();
    });
    svg.appendChild(seg);
    angle += (d.count / total) * 360;
  });
  box.appendChild(svg);
  const center = document.createElement("div");
  center.className = "donut-center";
  center.innerHTML = "<div><b>" + total + "</b><span>Employees</span></div>";
  box.appendChild(center);

  const leg = $("deptLegend");
  leg.innerHTML = "";
  DATA.departments.forEach((d, idx) => {
    const row = document.createElement("button");
    row.className = "dept-row";
    row.dataset.idx = idx;
    row.innerHTML =
      '<span class="dot" style="width:8px;height:8px;border-radius:50%;background:' +
      (DEPT_HEX[d.color] || d.color) +
      ';flex:0 0 auto"></span>' +
      '<span class="name">' +
      d.name +
      '</span><span class="nums">' +
      d.count +
      " · " +
      Math.round((d.count / total) * 100) +
      "%</span>";
    row.addEventListener("mouseenter", () => highlightDept(idx, true));
    row.addEventListener("mouseleave", () => highlightDept(idx, false));
    row.addEventListener("click", () => {
      navigate("Employees");
      toast("Filtered by " + d.name);
    });
    leg.appendChild(row);
  });
}
function highlightDept(idx, on) {
  const seg = document.querySelector('#donutBox path[data-idx="' + idx + '"]');
  if (seg) seg.setAttribute("stroke-width", on ? 26 : 22);
  const row = document.querySelector('.dept-row[data-idx="' + idx + '"]');
  if (row) row.style.background = on ? "var(--hover)" : "";
}

/* ============================================================
   ROW 3 LEFT — Leave requests table (spec 4.6)
   ============================================================ */
const AV_COLORS = [
  "var(--teal)",
  "var(--violet)",
  "var(--blue)",
  "var(--orange)",
  "var(--amber)",
];
const initials = (name) =>
  name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
function renderLeaveTable() {
  const q = ($("searchInput").value || "").trim().toLowerCase();
  const tb = $("leaveRows");
  tb.innerHTML = "";
  const rows = DATA.leaveRequests.filter(
    (l) => !q || l.name.toLowerCase().includes(q),
  );
  if (!rows.length) {
    tb.innerHTML =
      '<tr><td colspan="6"><div class="empty">No requests match “' +
      $("searchInput").value.trim() +
      "”</div></td></tr>";
    return;
  }
  rows.forEach((l) => {
    const i = DATA.leaveRequests.indexOf(l);
    const tr = document.createElement("tr");
    const stCls =
      l.status === "Pending"
        ? "st-pending"
        : l.status === "Approved"
          ? "st-approved"
          : "st-rejected";
    tr.innerHTML =
      '<td><span class="emp"><span class="avatar" style="width:32px;height:32px;background:' +
      AV_COLORS[i % 5] +
      '">' +
      initials(l.name) +
      "</span>" +
      '<span class="who"><b>' +
      l.name +
      "</b><span>" +
      l.role +
      "</span></span></span></td>" +
      "<td>" +
      l.type +
      '</td><td class="num">' +
      l.dates +
      '</td><td class="num">' +
      l.days +
      "</td>" +
      '<td><span class="pill-status ' +
      stCls +
      '">' +
      l.status +
      "</span></td>" +
      "<td>" +
      (l.status === "Pending"
        ? '<button class="btn btn-outline btn-sm" data-act="approve" data-i="' +
          i +
          '">Approve</button> ' +
          '<button class="btn btn-danger-outline btn-sm" data-act="reject" data-i="' +
          i +
          '" style="margin-left:6px">Reject</button>'
        : '<span style="color:var(--muted)">—</span>') +
      "</td>";
    tb.appendChild(tr);
  });
}
function decideLeave(i, approve) {
  const l = DATA.leaveRequests[i];
  if (!l || l.status !== "Pending") return;
  l.status = approve ? "Approved" : "Rejected";
  DATA.kpis.pendingApprovals = Math.max(0, DATA.kpis.pendingApprovals - 1);
  renderLeaveTable();
  renderKPIs(false);
  toast("Leave " + (approve ? "approved" : "rejected") + " for " + l.name);
}

/* ============================================================
   ROW 3 RIGHT — Recruitment funnel (spec 4.7)
   ============================================================ */
function renderFunnel() {
  const box = $("funnel");
  box.innerHTML = "";
  const max = DATA.funnel[0].count;
  DATA.funnel.forEach((f, i) => {
    const row = document.createElement("button");
    row.className = "funnel-row";
    row.style.width = "100%";
    row.style.border = "none";
    row.innerHTML =
      '<span class="stage">' +
      f.stage +
      "</span>" +
      '<span class="track"><span class="bar" style="background:' +
      f.color +
      '" data-w="' +
      (f.count / max) * 100 +
      '"></span></span>' +
      '<span class="count">' +
      f.count +
      "</span>";
    row.addEventListener("mousemove", (ev) => {
      const conv =
        i === 0
          ? "100% of all candidates"
          : Math.round((f.count / DATA.funnel[i - 1].count) * 100) +
            "% of " +
            DATA.funnel[i - 1].stage;
      tipShow(
        '<div class="tt-title">' +
          f.stage +
          ": " +
          f.count +
          '</div><div class="tt-row">' +
          conv +
          "</div>",
        ev.clientX,
        ev.clientY,
      );
    });
    row.addEventListener("mouseleave", tipHide);
    row.addEventListener("click", () => {
      navigate("Recruitment");
      toast("Showing " + f.stage + " candidates");
    });
    box.appendChild(row);
  });
  const joined = DATA.funnel[DATA.funnel.length - 1].count;
  $("funnelFoot").textContent =
    "Applied → Joined conversion " +
    ((joined / max) * 100).toFixed(1) +
    "% · 36 new candidates this week";
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      document
        .querySelectorAll(".funnel-row .bar")
        .forEach((b) => (b.style.width = b.dataset.w + "%"));
    }),
  );
}

/* ============================================================
   ROW 4 — events, announcements, payroll (spec 4.8–4.10)
   ============================================================ */
function renderRow4() {
  $("eventList").innerHTML = DATA.events
    .map(
      (e) =>
        '<div class="event"><span class="date-chip"><b>' +
        e.day +
        "</b><span>" +
        e.month +
        "</span></span>" +
        '<span class="what"><b>' +
        e.title +
        "</b><span>" +
        e.detail +
        "</span></span></div>",
    )
    .join("");
  $("annList").innerHTML = DATA.announcements
    .map(
      (a) =>
        '<div class="ann"><b>' +
        a.title +
        "</b><p>" +
        a.text +
        '</p><span class="meta">' +
        a.meta +
        "</span></div>",
    )
    .join("");
}

/* ============================================================
   TOP BAR — menus, notifications, search, modals (spec 4.2/4.11)
   ============================================================ */
const QUICK = [
  { label: "Add Employee", icon: "userPlus", act: () => openAddEmployee() },
  {
    label: "Mark Attendance",
    icon: "userCheck",
    act: () => toast("Mark Attendance — this will open the Attendance module"),
  },
  {
    label: "Approve Leaves",
    icon: "clipboardCheck",
    act: () => toast("Approve Leaves — this will open the Leave module"),
  },
  {
    label: "Run Payroll",
    icon: "banknote",
    act: () => toast("Run Payroll — this will open the Payroll module"),
  },
  {
    label: "Post a Job",
    icon: "briefcase",
    act: () => toast("Post a Job — this will open the Recruitment module"),
  },
  {
    label: "Generate Report",
    icon: "barChart",
    act: () => toast("Generate Report — this will open the Reports module"),
  },
];
function buildMenus() {
  const qm = $("quickMenu");
  qm.style.width = "240px";
  qm.innerHTML = "";
  QUICK.forEach((q) => {
    const b = document.createElement("button");
    b.className = "menu-item";
    b.innerHTML = icon(q.icon, 16) + q.label;
    b.addEventListener("click", () => {
      closeMenus();
      q.act();
    });
    qm.appendChild(b);
  });
  renderBellMenu();
  const am = $("avatarMenu");
  am.innerHTML = "";
  [
    ["user", "Profile"],
    ["settings", "Settings"],
    ["logout", "Log out"],
  ].forEach((p) => {
    const b = document.createElement("button");
    b.className = "menu-item";
    b.innerHTML = icon(p[0], 16) + p[1];
    b.addEventListener("click", () => {
      closeMenus();
      toast(p[1] + " — coming soon in the full portal");
    });
    am.appendChild(b);
  });
}
function renderBellMenu() {
  const bm = $("bellMenu");
  bm.innerHTML =
    '<div class="panel-head">Notifications</div>' +
    DATA.notifications
      .map(
        (n) =>
          '<div class="notif' +
          (n.read ? " read" : "") +
          '"><span class="dot"></span><span><p>' +
          n.text +
          "</p><time>" +
          n.time +
          "</time></span></div>",
      )
      .join("") +
    '<div class="panel-foot"><button class="link" id="markRead">Mark all as read</button></div>';
  const unread = DATA.notifications.filter((n) => !n.read).length;
  $("bellBadge").textContent = unread;
  $("bellBadge").style.display = unread ? "grid" : "none";
  const mr = bm.querySelector("#markRead");
  if (mr)
    mr.addEventListener("click", () => {
      DATA.notifications.forEach((n) => (n.read = true));
      renderBellMenu();
      $("bellMenu").hidden = false;
    });
}
function closeMenus() {
  ["quickMenu", "bellMenu", "avatarMenu"].forEach(
    (id) => ($(id).hidden = true),
  );
  ["quickBtn", "bellBtn", "avatarBtn"].forEach((id) =>
    $(id).setAttribute("aria-expanded", "false"),
  );
}
function wireMenu(btnId, menuId) {
  $(btnId).addEventListener("click", (ev) => {
    ev.stopPropagation();
    const m = $(menuId),
      open = m.hidden;
    closeMenus();
    m.hidden = !open;
    $(btnId).setAttribute("aria-expanded", open ? "true" : "false");
  });
}

/* Modal machinery with a small focus trap (spec 4.11) */
let lastFocus = null;
function openModal(html) {
  lastFocus = document.activeElement;
  const s = $("modalScrim");
  s.innerHTML =
    '<div class="modal" role="dialog" aria-modal="true">' + html + "</div>";
  s.hidden = false;
  const modal = s.firstChild;
  const focusables = () =>
    modal.querySelectorAll("button,input,select,[tabindex]");
  const f = focusables();
  if (f.length) f[0].focus();
  modal.addEventListener("keydown", (ev) => {
    if (ev.key !== "Tab") return;
    const list = [...focusables()];
    if (!list.length) return;
    const first = list[0],
      last = list[list.length - 1];
    if (ev.shiftKey && document.activeElement === first) {
      ev.preventDefault();
      last.focus();
    } else if (!ev.shiftKey && document.activeElement === last) {
      ev.preventDefault();
      first.focus();
    }
  });
  s.addEventListener(
    "mousedown",
    (ev) => {
      if (ev.target === s) closeModal();
    },
    { once: true },
  );
}
function closeModal() {
  const s = $("modalScrim");
  s.hidden = true;
  s.innerHTML = "";
  if (lastFocus && lastFocus.focus) lastFocus.focus();
}

/* Add Employee (spec 4.11) — really adds one */
function openAddEmployee() {
  const today = new Date().toISOString().slice(0, 10);
  openModal(
    '<div class="modal-head"><h3>Add Employee</h3><button class="icon-btn" style="width:32px;height:32px" aria-label="Close" data-close="1">✕</button></div>' +
      '<div class="modal-body">' +
      '<div class="field" id="fName"><label for="empName">Full name</label><input id="empName" type="text" autocomplete="off"><div class="err">Please enter the employee’s full name.</div></div>' +
      '<div class="field"><label for="empDept">Department</label><select id="empDept">' +
      DATA.departments.map((d) => "<option>" + d.name + "</option>").join("") +
      "</select></div>" +
      '<div class="field"><label for="empRole">Role / Designation</label><input id="empRole" type="text" autocomplete="off"></div>' +
      '<div class="field"><label for="empDate">Joining date</label><input id="empDate" type="date" value="' +
      today +
      '"></div>' +
      "</div>" +
      '<div class="modal-foot"><button class="btn btn-ghost" data-close="1">Cancel</button>' +
      '<button class="btn btn-primary" id="empSubmit">Add employee</button></div>',
  );
  $("empSubmit").addEventListener("click", () => {
    const name = $("empName").value.trim();
    if (!name) {
      $("fName").classList.add("invalid");
      $("empName").focus();
      return;
    }
    const dept = $("empDept").value;
    DATA.kpis.totalEmployees += 1;
    const d = DATA.departments.find((x) => x.name === dept);
    if (d) d.count += 1;
    closeModal();
    renderKPIs(false);
    renderDonut();
    toast("Employee added: " + name);
  });
}

/* Payroll confirm (spec 4.10) */
function openPayroll() {
  openModal(
    '<div class="modal-head"><h3>Run August payroll</h3><button class="icon-btn" style="width:32px;height:32px" aria-label="Close" data-close="1">✕</button></div>' +
      '<div class="modal-body">Run August payroll for ' +
      DATA.kpis.totalEmployees +
      " employees? Locked cycles cannot be edited afterwards.</div>" +
      '<div class="modal-foot"><button class="btn btn-ghost" data-close="1">Cancel</button>' +
      '<button class="btn btn-primary" id="payRun">Run payroll</button></div>',
  );
  $("payRun").addEventListener("click", () => {
    closeModal();
    $("payFill").style.width = "100%";
    $("payPct").textContent = "100%";
    const st = $("payStatus");
    st.textContent = "Completed";
    st.className = "pill-status st-approved";
    toast("Payroll run completed");
  });
}

/* ============================================================
   BOOT
   ============================================================ */
function boot() {
  // static icons (the Cyethack logo itself is an <img> data URI in the sidebar markup)
  $("searchIcon").innerHTML = icon("search", 16);
  $("plusIcon").innerHTML = icon("plus", 16);
  $("bellIcon").innerHTML = icon("bell", 18);
  $("hamburger").innerHTML = icon("menu", 20);
  $("collapseBtn").innerHTML = icon("chevrons", 14);
  $("logoutBtn").innerHTML = icon("logout", 16);

  // today's date, formatted "Wed, 26 Aug 2026" (spec 4.2)
  const now = new Date();
  $("todayDate").textContent =
    DAYS[now.getDay()] +
    ", " +
    now.getDate() +
    " " +
    MONTHS[now.getMonth()] +
    " " +
    now.getFullYear();

  buildNav();
  navigate("Dashboard");
  renderKPIs(true);
  buildRangePills();
  renderLineChart();
  renderDonut();
  renderLeaveTable();
  renderFunnel();
  renderRow4();
  buildMenus();
  wireMenu("quickBtn", "quickMenu");
  wireMenu("bellBtn", "bellMenu");
  wireMenu("avatarBtn", "avatarMenu");

  // table actions (event delegation)
  $("leaveRows").addEventListener("click", (ev) => {
    const b = ev.target.closest("button[data-act]");
    if (!b) return;
    decideLeave(+b.dataset.i, b.dataset.act === "approve");
  });
  $("viewAllLeaves").addEventListener("click", () =>
    toast("Opening Leave module"),
  );
  $("viewCalendar").addEventListener("click", () =>
    toast("Opening the calendar"),
  );
  $("newAnnBtn").addEventListener("click", () =>
    toast("New announcement — coming soon in the full portal"),
  );
  $("logoutBtn").addEventListener("click", () =>
    toast("Log out — coming soon in the full portal"),
  );
  $("payBtn").addEventListener("click", openPayroll);

  // search: live filter + Ctrl/Cmd+K + Escape (spec 4.2)
  $("searchInput").addEventListener("input", renderLeaveTable);
  document.addEventListener("keydown", (ev) => {
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === "k") {
      ev.preventDefault();
      $("searchInput").focus();
    }
    if (ev.key === "Escape") {
      if (!$("modalScrim").hidden) {
        closeModal();
        return;
      }
      closeMenus();
      document.body.classList.remove("drawer-open");
      $("mobileScrim").hidden = true;
      if (document.activeElement === $("searchInput")) {
        $("searchInput").value = "";
        renderLeaveTable();
        $("searchInput").blur();
      }
    }
  });
  document.addEventListener("click", (ev) => {
    if (!ev.target.closest(".menu")) closeMenus();
  });

  // sidebar collapse, remembered (spec 4.1)
  let railSaved = false;
  try {
    railSaved = localStorage.getItem("chs-rail") === "1";
  } catch (e) {}
  if (railSaved) document.body.classList.add("rail");
  $("collapseBtn").addEventListener("click", () => {
    document.body.classList.toggle("rail");
    try {
      localStorage.setItem(
        "chs-rail",
        document.body.classList.contains("rail") ? "1" : "0",
      );
    } catch (e) {}
  });

  // mobile drawer
  $("hamburger").addEventListener("click", () => {
    document.body.classList.add("drawer-open");
    $("mobileScrim").hidden = false;
  });
  $("mobileScrim").addEventListener("click", () => {
    document.body.classList.remove("drawer-open");
    $("mobileScrim").hidden = true;
  });

  // charts follow their card's size
  if (window.ResizeObserver) {
    new ResizeObserver(() => renderLineChart()).observe($("lineChart"));
  } else window.addEventListener("resize", renderLineChart);
}
boot();

/* ===== portal inline block 2/11 (externalized for CSP; order preserved) ===== */

("use strict");
/* ============================================================
   ADDED FEATURE — Leave & Attendance Calendar (JavaScript) · start
   Added as a SECOND <script> block: no existing script line was
   edited. Everything here uses new names (hrLeave… prefix or the
   agreed function names) so nothing collides with existing code.

   Existing pieces intentionally REUSED (read-only, unchanged):
     $()          — element lookup helper
     toast()      — toast notifications
     openModal()/closeModal() — the portal's modal machinery
     MONTHS, DAYS — month/day name arrays
     navigate()   — extended below by WRAPPING it (never edited)

   Backend integration: replace the three data stores below with
   API responses of the same shape, then call
   hrLeaveCalendarRefreshAll(). Nothing else needs to change.
   ============================================================ */

/* ---------------- 1. DATA (swap these with API responses) ---------------- */

// Attendance keyed by ISO date. Employees can never write to this
// from the UI — attendance is read-only by design.
const employeeAttendanceData = {
  "2026-09-01": {
    status: "present",
    checkIn: "09:12 AM",
    checkOut: "06:05 PM",
    workingHours: "8h 53m",
  },
  "2026-09-02": {
    status: "leave",
    leaveType: "Casual Leave",
    approvalStatus: "approved",
  },
};

// The employee's leave requests (drives the calendar overlays,
// the history table, "Pending Requests" and "Upcoming").
const employeeLeaveRequests = [
  {
    id: "LR-1019",
    type: "Casual Leave",
    from: "2026-09-02",
    to: "2026-09-02",
    days: 1,
    halfDay: false,
    reason: "Bank & registration work",
    appliedOn: "2026-08-28",
    status: "Approved",
    managerNote: "",
  },
  {
    id: "LR-1020",
    type: "Casual Leave",
    from: "2026-08-14",
    to: "2026-08-14",
    days: 1,
    halfDay: false,
    reason: "Personal errand",
    appliedOn: "2026-08-10",
    status: "Rejected",
    managerNote: "Release week — please reschedule",
  },
  {
    id: "LR-1021",
    type: "Sick Leave",
    from: "2026-08-20",
    to: "2026-08-21",
    days: 2,
    halfDay: false,
    reason: "Viral fever",
    appliedOn: "2026-08-20",
    status: "Approved",
    managerNote: "",
  },
  {
    id: "LR-1022",
    type: "Casual Leave",
    from: "2026-09-14",
    to: "2026-09-14",
    days: 1,
    halfDay: false,
    reason: "Family function",
    appliedOn: "2026-09-01",
    status: "Approved",
    managerNote: "",
  },
  {
    id: "LR-1023",
    type: "Work From Home",
    from: "2026-09-25",
    to: "2026-09-25",
    days: 1,
    halfDay: false,
    reason: "Fibre installation at home",
    appliedOn: "2026-09-02",
    status: "Approved",
    managerNote: "",
  },
  {
    id: "LR-1024",
    type: "Earned Leave",
    from: "2026-09-29",
    to: "2026-09-30",
    days: 2,
    halfDay: false,
    reason: "Trip to Jaipur",
    appliedOn: "2026-09-03",
    status: "Pending",
    managerNote: "",
  },
  {
    id: "LR-1025",
    type: "Casual Leave",
    from: "2026-10-09",
    to: "2026-10-09",
    days: 1,
    halfDay: false,
    reason: "College reunion",
    appliedOn: "2026-09-03",
    status: "Pending",
    managerNote: "",
  },
];

const companyHolidays = [
  { date: "2026-09-17", name: "Vishwakarma Puja" },
  { date: "2026-10-02", name: "Gandhi Jayanti" },
  { date: "2026-11-08", name: "Diwali" },
  { date: "2026-11-09", name: "Govardhan Puja" },
  { date: "2026-12-25", name: "Christmas" },
  { date: "2027-01-26", name: "Republic Day" },
];

// Demo balances — replace with GET /api/leave/balance later.
const hrLeaveCalendarConfig = {
  employee: { name: "", id: "", department: "", designation: "" },
  balances: { total: 24, used: 8, casual: 6, sick: 5, paidEarned: 5 },
  leaveTypes: [
    "Casual Leave",
    "Sick Leave",
    "Paid Leave",
    "Unpaid Leave",
    "Earned Leave",
    "Bereavement Leave",
    "Maternity/Paternity Leave",
    "Work From Home",
  ],
};

/* ---------------- 2. Small self-contained helpers ---------------- */

const hrLeaveCalendarState = {
  year: new Date().getFullYear(),
  month: new Date().getMonth(),
  seq: 1025,
};

function hrLeavePad(n) {
  return (n < 10 ? "0" : "") + n;
}
function hrLeaveISO(d) {
  return (
    d.getFullYear() +
    "-" +
    hrLeavePad(d.getMonth() + 1) +
    "-" +
    hrLeavePad(d.getDate())
  );
}
function hrLeaveParse(iso) {
  const p = iso.split("-");
  return new Date(+p[0], +p[1] - 1, +p[2]);
}
function hrLeaveTodayISO() {
  return hrLeaveISO(new Date());
}
function hrLeaveIsWeekend(d) {
  return d.getDay() === 0 || d.getDay() === 6;
}
function hrLeaveHolidayOn(iso) {
  for (let i = 0; i < companyHolidays.length; i++) {
    if (companyHolidays[i].date === iso) return companyHolidays[i];
  }
  return null;
}
function hrLeaveNiceDate(iso) {
  const d = hrLeaveParse(iso);
  return d.getDate() + " " + MONTHS[d.getMonth()] + " " + d.getFullYear();
}
function hrLeaveEsc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
function hrLeaveHash(str) {
  // deterministic 0..1 per string, so demo data is stable on every reload
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}
function hrLeaveFmtTime(mins) {
  let h = Math.floor(mins / 60),
    m = Math.round(mins % 60);
  const ap = h >= 12 ? "PM" : "AM";
  h = h % 12;
  if (h === 0) h = 12;
  return hrLeavePad(h) + ":" + hrLeavePad(m) + " " + ap;
}
// Non-cancelled leave request covering a date (ISO string compare works for ranges)
function hrLeaveRequestOn(iso) {
  for (let i = 0; i < employeeLeaveRequests.length; i++) {
    const r = employeeLeaveRequests[i];
    if (r.status !== "Cancelled" && iso >= r.from && iso <= r.to) return r;
  }
  return null;
}
function hrLeaveCountWorkingDays(fromIso, toIso) {
  let n = 0,
    guard = 0;
  const end = hrLeaveParse(toIso);
  for (
    let d = hrLeaveParse(fromIso);
    d <= end && guard < 400;
    d.setDate(d.getDate() + 1), guard++
  ) {
    if (!hrLeaveIsWeekend(d) && !hrLeaveHolidayOn(hrLeaveISO(d))) n++;
  }
  return n;
}
const hrLeaveTypeColors = {
  "Casual Leave": "#7FD4C1",
  "Sick Leave": "#F59E0B",
  "Paid Leave": "#3B82F6",
  "Unpaid Leave": "#94A3B8",
  "Earned Leave": "#3B82F6",
  "Bereavement Leave": "#94A3B8",
  "Maternity/Paternity Leave": "#8B5CF6",
  "Work From Home": "#8B5CF6",
};
const hrLeaveAttendanceMeta = {
  present: { label: "Present", color: "#22C55E" },
  absent: { label: "Absent", color: "#EF4444" },
  halfday: { label: "Half Day", color: "#F97316" },
  wfh: { label: "Work From Home", color: "#8B5CF6" },
  leave: { label: "Leave", color: "#F59E0B" },
};

/* Deterministic demo attendance for past working days (never overwrites
   explicit entries; skipped entirely once real API data fills the store). */
function hrLeaveSeedDemoAttendance() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = 1; i <= 75; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const iso = hrLeaveISO(d);
    if (
      hrLeaveIsWeekend(d) ||
      hrLeaveHolidayOn(iso) ||
      employeeAttendanceData[iso]
    )
      continue;
    const req = hrLeaveRequestOn(iso);
    if (req && req.status === "Approved") {
      employeeAttendanceData[iso] = {
        status: "leave",
        leaveType: req.type,
        approvalStatus: "approved",
      };
      continue;
    }
    const r = hrLeaveHash(iso);
    if (r < 0.04) {
      employeeAttendanceData[iso] = { status: "absent" };
      continue;
    }
    if (r < 0.1) {
      employeeAttendanceData[iso] = {
        status: "halfday",
        checkIn: "09:05 AM",
        checkOut: "01:35 PM",
        workingHours: "4h 30m",
      };
      continue;
    }
    const inMin = 540 + Math.floor(hrLeaveHash(iso + "i") * 55); // 09:00–09:55
    const outMin = 1070 + Math.floor(hrLeaveHash(iso + "o") * 90); // 17:50–19:20
    const total = outMin - inMin;
    const rec = {
      status: r < 0.22 ? "wfh" : "present",
      checkIn: hrLeaveFmtTime(inMin),
      checkOut: hrLeaveFmtTime(outMin),
      workingHours:
        Math.floor(total / 60) + "h " + hrLeavePad(total % 60) + "m",
    };
    if (inMin > 570) rec.lateBy = inMin - 570 + " min"; // after 09:30
    if (outMin < 1080) rec.earlyOut = 1080 - outMin + " min"; // before 06:00 PM
    if (outMin > 1125) rec.overtime = outMin - 1125 + " min"; // after 06:45 PM
    employeeAttendanceData[iso] = rec;
  }
}

/* ---------------- 3. Legend ---------------- */
function hrLeaveBuildLegend() {
  const items = [
    ["dot", "#22C55E", "Present"],
    ["dot", "#EF4444", "Absent"],
    ["dot", "#F97316", "Half Day"],
    ["dot", "#8B5CF6", "Work From Home"],
    ["dot", "#3B82F6", "Paid Leave"],
    ["dot", "#F59E0B", "Sick Leave"],
    ["dot", "#7FD4C1", "Casual Leave"],
    ["sw", "var(--blue-tint)", "Holiday"],
    ["sw", "var(--sidebar)", "Weekend"],
    ["sw", "var(--amber-tint)", "Pending Leave"],
    ["sw", "var(--teal-tint)", "Approved Leave"],
    ["dot", "#EF4444", "Rejected Leave"],
  ];
  $("hrLeaveLegend").innerHTML = items
    .map(function (it) {
      const shape =
        it[0] === "dot"
          ? '<span class="hr-leave-calendar-dot" style="background:' +
            it[1] +
            '"></span>'
          : '<span class="hr-leave-calendar-swatch" style="background:' +
            it[1] +
            '"></span>';
      return '<span class="hlc-li">' + shape + it[2] + "</span>";
    })
    .join("");
}

/* ---------------- 4. Calendar ---------------- */
function renderLeaveAttendanceCalendar() {
  const y = hrLeaveCalendarState.year,
    m = hrLeaveCalendarState.month;
  $("hrLeaveMonthHeading").textContent =
    [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ][m] +
    " " +
    y;
  const grid = $("hrLeaveCalendarGrid");
  const todayIso = hrLeaveTodayISO();
  const offset = (new Date(y, m, 1).getDay() + 6) % 7; // Monday-first
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  let html = "";
  for (let b = 0; b < offset; b++)
    html +=
      '<span class="hr-leave-calendar-day hlc-blank" aria-hidden="true"></span>';
  for (let day = 1; day <= daysInMonth; day++) {
    const d = new Date(y, m, day),
      iso = hrLeaveISO(d);
    const weekend = hrLeaveIsWeekend(d),
      holiday = hrLeaveHolidayOn(iso);
    const att = employeeAttendanceData[iso],
      req = hrLeaveRequestOn(iso);
    let cls = "hr-leave-calendar-day";
    if (iso === todayIso) cls += " hlc-today";
    if (weekend) cls += " hlc-weekend";
    if (holiday) cls += " hlc-holiday";
    if (req && req.status === "Pending") cls += " hlc-pending";
    if (req && req.status === "Approved" && !holiday) cls += " hlc-approved";
    let flag = "";
    if (req) {
      const f =
        req.status === "Pending"
          ? "hlc-f-pending"
          : req.status === "Approved"
            ? "hlc-f-approved"
            : "hlc-f-rejected";
      flag =
        '<span class="hr-leave-calendar-flag ' +
        f +
        '">' +
        req.status +
        "</span>";
    } else if (holiday) {
      flag =
        '<span class="hr-leave-calendar-flag hlc-f-holiday">Holiday</span>';
    }
    // one status line per cell, in priority order
    let dot = "",
      txt = "";
    if (holiday) {
      dot = "#3B82F6";
      txt = holiday.name;
    } else if (req && req.status !== "Rejected") {
      dot = hrLeaveTypeColors[req.type] || "#F59E0B";
      txt = (req.halfDay ? "Half Day · " : "") + req.type;
    } else if (att) {
      const meta =
        hrLeaveAttendanceMeta[att.status] || hrLeaveAttendanceMeta.present;
      dot =
        att.status === "leave"
          ? hrLeaveTypeColors[att.leaveType] || meta.color
          : meta.color;
      txt = att.status === "leave" ? att.leaveType || "Leave" : meta.label;
    } else if (weekend) {
      txt = "Weekend";
    }
    const statusLine = dot
      ? '<span class="hlc-cellstatus"><span class="hr-leave-calendar-dot" style="background:' +
        dot +
        '"></span><span class="hlc-txt">' +
        hrLeaveEsc(txt) +
        "</span></span>"
      : txt
        ? '<span class="hlc-cellstatus"><span class="hlc-txt">' +
          txt +
          "</span></span>"
        : "";
    html +=
      '<button type="button" class="' +
      cls +
      '" data-date="' +
      iso +
      '" aria-label="' +
      day +
      " " +
      MONTHS[m] +
      " " +
      y +
      (txt ? " — " + hrLeaveEsc(txt) : "") +
      '">' +
      '<span class="hlc-num">' +
      day +
      "</span>" +
      flag +
      statusLine +
      "</button>";
  }
  grid.innerHTML = html;
  calculateMonthlyAttendance();
}

function changeLeaveCalendarMonth(delta) {
  if (delta === "today") {
    hrLeaveCalendarState.year = new Date().getFullYear();
    hrLeaveCalendarState.month = new Date().getMonth();
  } else {
    let m = hrLeaveCalendarState.month + delta,
      y = hrLeaveCalendarState.year;
    if (m < 0) {
      m = 11;
      y--;
    }
    if (m > 11) {
      m = 0;
      y++;
    }
    hrLeaveCalendarState.month = m;
    hrLeaveCalendarState.year = y;
  }
  renderLeaveAttendanceCalendar();
}

/* ---------------- 5. Monthly attendance summary ---------------- */
function calculateMonthlyAttendance() {
  const y = hrLeaveCalendarState.year,
    m = hrLeaveCalendarState.month;
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const startToday = new Date();
  startToday.setHours(0, 0, 0, 0);
  let present = 0,
    absent = 0,
    half = 0,
    wfh = 0,
    leave = 0,
    working = 0,
    elapsed = 0;
  for (let day = 1; day <= daysInMonth; day++) {
    const d = new Date(y, m, day),
      iso = hrLeaveISO(d);
    if (hrLeaveIsWeekend(d) || hrLeaveHolidayOn(iso)) continue;
    working++;
    if (d >= startToday) continue; // count only completed working days (today is still in progress)
    elapsed++;
    const att = employeeAttendanceData[iso],
      req = hrLeaveRequestOn(iso);
    if (att) {
      if (att.status === "present") present++;
      else if (att.status === "absent") absent++;
      else if (att.status === "halfday") half++;
      else if (att.status === "wfh") wfh++;
      else if (att.status === "leave") leave++;
    } else if (req && req.status === "Approved") {
      if (req.type === "Work From Home") wfh++;
      else leave++;
    }
  }
  // Attendance rate excludes authorised leave from the denominator (standard HR definition).
  const payableDays = elapsed - leave;
  const pct =
    payableDays > 0
      ? Math.round(((present + wfh + half * 0.5) / payableDays) * 100)
      : null;
  $("hrLeaveMonthlySub").textContent =
    MONTHS[m] + " " + y + " · " + working + " working days";
  $("hrLeaveMonthlySummary").innerHTML =
    '<div class="hr-leave-calendar-statgrid">' +
    '<span class="hlc-stat">Present<b>' +
    present +
    "</b></span>" +
    '<span class="hlc-stat">Absent<b>' +
    absent +
    "</b></span>" +
    '<span class="hlc-stat">Leave days<b>' +
    leave +
    "</b></span>" +
    '<span class="hlc-stat">Half days<b>' +
    half +
    "</b></span>" +
    '<span class="hlc-stat">WFH days<b>' +
    wfh +
    "</b></span>" +
    '<span class="hlc-stat">Working days<b>' +
    working +
    "</b></span>" +
    "</div>" +
    '<div class="progress-label"><span>Attendance</span><span class="pct">' +
    (pct === null ? "—" : pct + "%") +
    "</span></div>" +
    '<div class="progress"><div class="fill" style="width:' +
    (pct === null ? 0 : Math.min(100, pct)) +
    '%"></div></div>';
  return {
    present: present,
    absent: absent,
    half: half,
    wfh: wfh,
    leave: leave,
    working: working,
    pct: pct,
  };
}

/* ---------------- 6. Leave balance summary cards ---------------- */
function updateLeaveSummary() {
  const b = hrLeaveCalendarConfig.balances;
  const pending = employeeLeaveRequests.filter(function (r) {
    return r.status === "Pending";
  }).length;
  const cards = [
    [
      "Total Leave Balance",
      b.total,
      b.total - b.used + " available · " + b.used + " used",
    ],
    ["Casual Leave", b.casual, "remaining"],
    ["Sick Leave", b.sick, "remaining"],
    ["Paid / Earned Leave", b.paidEarned, "remaining"],
    ["Leaves Taken", b.used, "this year"],
    ["Pending Requests", pending, pending ? "awaiting approval" : "all clear"],
  ];
  $("hrLeaveSummaryCards").innerHTML = cards
    .map(function (c) {
      return (
        '<div class="card hr-leave-calendar-sumcard"><span class="hlc-label">' +
        c[0] +
        "</span>" +
        '<span class="hlc-value">' +
        c[1] +
        '</span><span class="hlc-sub">' +
        c[2] +
        "</span></div>"
      );
    })
    .join("");
}

/* ---------------- 7. Upcoming leaves & holidays ---------------- */
function renderHrLeaveUpcoming() {
  const todayIso = hrLeaveTodayISO();
  const horizon = new Date();
  horizon.setDate(horizon.getDate() + 75);
  const items = [];
  employeeLeaveRequests.forEach(function (r) {
    if (r.status === "Approved" && r.from >= todayIso) {
      items.push({
        date: r.from,
        title: (r.halfDay ? "Half Day · " : "") + r.type,
        sub:
          hrLeaveNiceDate(r.from) +
          (r.to !== r.from ? " – " + hrLeaveNiceDate(r.to) : "") +
          " · " +
          r.days +
          (r.days === 1 ? " day" : " days"),
        flag: r.type === "Work From Home" ? "WFH" : "Approved",
        cls: "hlc-f-approved",
      });
    }
  });
  companyHolidays.forEach(function (h) {
    if (h.date >= todayIso && hrLeaveParse(h.date) <= horizon) {
      items.push({
        date: h.date,
        title: h.name,
        sub: hrLeaveNiceDate(h.date) + " · Company holiday",
        flag: "Holiday",
        cls: "hlc-f-holiday",
      });
    }
  });
  items.sort(function (a, b) {
    return a.date < b.date ? -1 : 1;
  });
  const top = items.slice(0, 5);
  $("hrLeaveUpcoming").innerHTML = top.length
    ? top
        .map(function (it) {
          const d = hrLeaveParse(it.date);
          return (
            '<div class="event"><span class="date-chip"><b>' +
            hrLeavePad(d.getDate()) +
            "</b><span>" +
            MONTHS[d.getMonth()].toUpperCase() +
            "</span></span>" +
            '<span class="what"><b>' +
            hrLeaveEsc(it.title) +
            "</b><span>" +
            it.sub +
            "</span></span>" +
            '<span class="hr-leave-calendar-flag hr-leave-calendar-upcoming-pill ' +
            it.cls +
            '">' +
            it.flag +
            "</span></div>"
          );
        })
        .join("")
    : '<div class="empty">Nothing coming up in the next few weeks</div>';
}

/* ---------------- 8. Day details modal ---------------- */
function showAttendanceDayDetails(iso) {
  const d = hrLeaveParse(iso),
    todayIso = hrLeaveTodayISO();
  const att = employeeAttendanceData[iso],
    req = hrLeaveRequestOn(iso),
    holiday = hrLeaveHolidayOn(iso);
  const weekend = hrLeaveIsWeekend(d);
  let attStatus = "--";
  if (holiday) attStatus = "Holiday — " + holiday.name;
  else if (att)
    attStatus =
      att.status === "leave"
        ? att.leaveType || "Leave"
        : (hrLeaveAttendanceMeta[att.status] || {}).label || att.status;
  else if (weekend) attStatus = "Weekend";
  else if (iso > todayIso) attStatus = "Upcoming — not recorded yet";
  const rows = [
    [
      "Date",
      [
        "Sunday",
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday",
      ][d.getDay()] +
        ", " +
        hrLeaveNiceDate(iso),
    ],
    ["Attendance Status", attStatus],
    ["Check-in Time", (att && att.checkIn) || "--"],
    ["Check-out Time", (att && att.checkOut) || "--"],
    ["Total Working Hours", (att && att.workingHours) || "--"],
    ["Late Arrival", (att && att.lateBy) || "--"],
    ["Early Checkout", (att && att.earlyOut) || "--"],
    ["Overtime", (att && att.overtime) || "--"],
    [
      "Leave Status",
      req
        ? req.status
        : att && att.status === "leave"
          ? att.approvalStatus || "Approved"
          : "--",
    ],
    [
      "Leave Type",
      req
        ? (req.halfDay ? "Half Day · " : "") + req.type
        : (att && att.leaveType) || "--",
    ],
    ["Leave Reason", req ? req.reason : "--"],
    [
      "Manager Approval",
      req
        ? req.status === "Pending"
          ? "Awaiting manager approval"
          : req.status + (req.managerNote ? " — " + req.managerNote : "")
        : "--",
    ],
  ];
  const canApply =
    iso >= todayIso &&
    !weekend &&
    !holiday &&
    !(req && (req.status === "Pending" || req.status === "Approved"));
  openModal(
    '<div class="modal-head"><h3>Day Details</h3><button class="icon-btn" style="width:32px;height:32px" aria-label="Close" data-close="1">✕</button></div>' +
      '<div class="modal-body hr-leave-calendar-modalbody"><dl class="hr-leave-calendar-detail">' +
      rows
        .map(function (r) {
          return "<dt>" + r[0] + "</dt><dd>" + hrLeaveEsc(r[1]) + "</dd>";
        })
        .join("") +
      "</dl></div>" +
      '<div class="modal-foot"><button class="btn btn-ghost" data-close="1">Close</button>' +
      (canApply
        ? '<button class="btn btn-primary" data-close="1" data-open-leave="' +
          iso +
          '">Apply Leave</button>'
        : "") +
      "</div>",
  );
}

/* ---------------- 9. Apply-leave modal + validation ---------------- */
function openLeaveApplicationModal(presetIso) {
  const todayIso = hrLeaveTodayISO();
  const start = presetIso && presetIso >= todayIso ? presetIso : todayIso;
  openModal(
    '<div class="modal-head"><h3>Apply for Leave</h3><button class="icon-btn" style="width:32px;height:32px" aria-label="Close" data-close="1">✕</button></div>' +
      '<div class="modal-body hr-leave-calendar-modalbody hr-leave-calendar-form">' +
      '<div class="hlc-2col">' +
      '<div class="field"><label for="hrLeaveEmpName">Employee name</label><input id="hrLeaveEmpName" type="text" value="' +
      hrLeaveEsc(hrLeaveCalendarConfig.employee.name) +
      '" disabled></div>' +
      '<div class="field"><label for="hrLeaveEmpId">Employee ID</label><input id="hrLeaveEmpId" type="text" value="' +
      hrLeaveEsc(hrLeaveCalendarConfig.employee.id) +
      '" disabled></div>' +
      "</div>" +
      '<div class="hlc-2col">' +
      '<div class="field"><label for="hrLeaveEmpDepartment">Department</label><input id="hrLeaveEmpDepartment" type="text" value="' +
      hrLeaveEsc(hrLeaveCalendarConfig.employee.department) +
      '" disabled></div>' +
      '<div class="field"><label for="hrLeaveEmpDesignation">Designation</label><input id="hrLeaveEmpDesignation" type="text" value="' +
      hrLeaveEsc(hrLeaveCalendarConfig.employee.designation) +
      '" disabled></div>' +
      "</div>" +
      '<div class="field" id="hrLeaveTypeField"><label for="hrLeaveType">Leave type</label><select id="hrLeaveType">' +
      '<option value="" selected>Select leave type…</option>' +
      hrLeaveCalendarConfig.leaveTypes
        .map(function (t) {
          return "<option>" + t + "</option>";
        })
        .join("") +
      '</select><div class="err">Please select a leave type.</div></div>' +
      '<div class="hlc-2col">' +
      '<div class="field" id="hrLeaveStartField"><label for="hrLeaveStart">Start date</label><input id="hrLeaveStart" type="date" value="' +
      start +
      '" min="' +
      todayIso +
      '"><div class="err">Pick a valid start date.</div></div>' +
      '<div class="field" id="hrLeaveEndField"><label for="hrLeaveEnd">End date</label><input id="hrLeaveEnd" type="date" value="' +
      start +
      '" min="' +
      todayIso +
      '"><div class="err">Pick a valid end date.</div></div>' +
      "</div>" +
      '<label class="hlc-check"><input type="checkbox" id="hrLeaveHalf"> Half day (single-day leave only)</label>' +
      '<div class="field" id="hrLeaveReasonField"><label for="hrLeaveReason">Reason for leave</label><textarea id="hrLeaveReason" placeholder="Briefly describe the reason…"></textarea><div class="err">Reason cannot be empty.</div></div>' +
      '<div class="field"><label for="hrLeaveContact">Emergency contact (optional)</label><input id="hrLeaveContact" type="tel" placeholder="Phone number while on leave"></div>' +
      '<div class="hlc-attach">📎 Attachment (medical certificate, etc.) — upload is enabled once the backend is connected.</div>' +
      '<div class="hr-leave-calendar-formerr" id="hrLeaveFormError" role="alert"></div>' +
      "</div>" +
      '<div class="modal-foot"><button class="btn btn-ghost" data-close="1">Cancel</button>' +
      '<button class="btn btn-primary" id="hrLeaveSubmitBtn">Submit Leave Request</button></div>',
  );
  $("hrLeaveSubmitBtn").addEventListener("click", submitEmployeeLeaveRequest);
}

function submitEmployeeLeaveRequest() {
  const type = $("hrLeaveType").value,
    from = $("hrLeaveStart").value,
    to = $("hrLeaveEnd").value;
  const half = $("hrLeaveHalf").checked,
    reason = $("hrLeaveReason").value.trim();
  const todayIso = hrLeaveTodayISO();
  const errors = [];
  [
    "hrLeaveTypeField",
    "hrLeaveStartField",
    "hrLeaveEndField",
    "hrLeaveReasonField",
  ].forEach(function (id) {
    $(id).classList.remove("invalid");
  });
  if (!type) {
    errors.push("Select a leave type.");
    $("hrLeaveTypeField").classList.add("invalid");
  }
  if (!from) {
    errors.push("Pick a start date.");
    $("hrLeaveStartField").classList.add("invalid");
  }
  if (!to) {
    errors.push("Pick an end date.");
    $("hrLeaveEndField").classList.add("invalid");
  }
  if (from && to && from > to) {
    errors.push("Start date cannot be after the end date.");
    $("hrLeaveStartField").classList.add("invalid");
    $("hrLeaveEndField").classList.add("invalid");
  }
  if (from && from < todayIso) {
    errors.push("Leave can only be applied for today or future dates.");
    $("hrLeaveStartField").classList.add("invalid");
  }
  if (half && from !== to) {
    errors.push(
      "Half day applies to a single date — set the same start and end date.",
    );
  }
  if (!reason) {
    errors.push("Reason cannot be empty.");
    $("hrLeaveReasonField").classList.add("invalid");
  }
  let workDays = 0;
  if (from && to && from <= to) {
    workDays = hrLeaveCountWorkingDays(from, to);
    if (workDays === 0)
      errors.push("The selected dates fall only on weekends or holidays.");
  }
  if (from && to && from <= to) {
    for (let i = 0; i < employeeLeaveRequests.length; i++) {
      const r = employeeLeaveRequests[i];
      if (
        (r.status === "Pending" || r.status === "Approved") &&
        from <= r.to &&
        to >= r.from
      ) {
        errors.push(
          "These dates overlap with request " + r.id + " (" + r.status + ").",
        );
        break;
      }
    }
  }
  const errBox = $("hrLeaveFormError");
  if (errors.length) {
    errBox.innerHTML = errors.map(hrLeaveEsc).join("<br>");
    errBox.classList.add("hlc-show");
    return;
  }
  hrLeaveCalendarState.seq++;
  employeeLeaveRequests.unshift({
    id: "LR-" + hrLeaveCalendarState.seq,
    type: type,
    from: from,
    to: to,
    days: half ? 0.5 : workDays,
    halfDay: half,
    reason: reason,
    emergencyContact: $("hrLeaveContact").value.trim(),
    appliedOn: todayIso,
    status: "Pending",
    managerNote: "",
  });
  closeModal();
  toast(
    "Leave request LR-" +
      hrLeaveCalendarState.seq +
      " submitted — pending approval",
  );
  hrLeaveCalendarRefreshAll();
}

/* ---------------- 10. Leave request history table ---------------- */
function renderEmployeeLeaveRequests() {
  const rows = employeeLeaveRequests.slice().sort(function (a, b) {
    return a.appliedOn < b.appliedOn ? 1 : -1;
  });
  const pending = rows.filter(function (r) {
    return r.status === "Pending";
  }).length;
  $("hrLeaveReqCount").textContent =
    rows.length + " requests · " + pending + " pending";
  const pill = {
    Pending: "st-pending",
    Approved: "st-approved",
    Rejected: "st-rejected",
    Cancelled: "hr-leave-calendar-st-cancelled",
  };
  $("hrLeaveReqRows").innerHTML = rows.length
    ? rows
        .map(function (r) {
          const shortReason =
            r.reason.length > 34 ? r.reason.slice(0, 34) + "…" : r.reason;
          const action =
            r.status === "Pending"
              ? '<button class="btn btn-danger-outline btn-sm" data-hlc-act="cancel" data-hlc-id="' +
                r.id +
                '">Cancel Request</button>'
              : '<button class="btn btn-outline btn-sm" data-hlc-act="view" data-hlc-id="' +
                r.id +
                '">View Details</button>';
          return (
            '<tr><td class="num">' +
            r.id +
            "</td><td>" +
            hrLeaveEsc(r.type) +
            (r.halfDay
              ? ' <span style="color:var(--muted)">(half day)</span>'
              : "") +
            "</td>" +
            '<td class="num">' +
            hrLeaveNiceDate(r.from) +
            '</td><td class="num">' +
            hrLeaveNiceDate(r.to) +
            "</td>" +
            '<td class="num">' +
            r.days +
            '</td><td title="' +
            hrLeaveEsc(r.reason) +
            '">' +
            hrLeaveEsc(shortReason) +
            "</td>" +
            '<td class="num">' +
            hrLeaveNiceDate(r.appliedOn) +
            "</td>" +
            '<td><span class="pill-status ' +
            (pill[r.status] || "st-pending") +
            '">' +
            r.status +
            "</span></td>" +
            "<td>" +
            action +
            "</td></tr>"
          );
        })
        .join("")
    : '<tr><td colspan="9"><div class="empty">No leave requests yet</div></td></tr>';
}

function hrLeaveCancelRequest(id) {
  const r = employeeLeaveRequests.find(function (x) {
    return x.id === id;
  });
  if (!r || r.status !== "Pending") return;
  openModal(
    '<div class="modal-head"><h3>Cancel leave request?</h3><button class="icon-btn" style="width:32px;height:32px" aria-label="Close" data-close="1">✕</button></div>' +
      '<div class="modal-body">Cancel <b>' +
      r.id +
      "</b> — " +
      hrLeaveEsc(r.type) +
      ", " +
      hrLeaveNiceDate(r.from) +
      (r.to !== r.from ? " – " + hrLeaveNiceDate(r.to) : "") +
      "? This cannot be undone.</div>" +
      '<div class="modal-foot"><button class="btn btn-ghost" data-close="1">Keep request</button>' +
      '<button class="btn btn-danger-outline" id="hrLeaveConfirmCancel">Cancel request</button></div>',
  );
  $("hrLeaveConfirmCancel").addEventListener("click", function () {
    r.status = "Cancelled";
    closeModal();
    toast("Leave request " + r.id + " cancelled");
    hrLeaveCalendarRefreshAll();
  });
}

function hrLeaveViewRequestDetails(id) {
  const r = employeeLeaveRequests.find(function (x) {
    return x.id === id;
  });
  if (!r) return;
  const rows = [
    ["Request ID", r.id],
    ["Leave Type", (r.halfDay ? "Half Day · " : "") + r.type],
    ["From", hrLeaveNiceDate(r.from)],
    ["To", hrLeaveNiceDate(r.to)],
    ["Days", r.days],
    ["Reason", r.reason],
    ["Emergency Contact", r.emergencyContact || "--"],
    ["Applied On", hrLeaveNiceDate(r.appliedOn)],
    ["Status", r.status],
    ["Manager Note", r.managerNote || "--"],
  ];
  openModal(
    '<div class="modal-head"><h3>Leave Request ' +
      r.id +
      '</h3><button class="icon-btn" style="width:32px;height:32px" aria-label="Close" data-close="1">✕</button></div>' +
      '<div class="modal-body hr-leave-calendar-modalbody"><dl class="hr-leave-calendar-detail">' +
      rows
        .map(function (x) {
          return "<dt>" + x[0] + "</dt><dd>" + hrLeaveEsc(x[1]) + "</dd>";
        })
        .join("") +
      "</dl></div>" +
      '<div class="modal-foot"><button class="btn btn-ghost" data-close="1">Close</button></div>',
  );
}

/* ---------------- 11. Wiring + router extension (additive) ---------------- */
function hrLeaveCalendarRefreshAll() {
  updateLeaveSummary();
  renderLeaveAttendanceCalendar();
  renderEmployeeLeaveRequests();
  renderHrLeaveUpcoming();
}

// Extend the existing router by WRAPPING navigate() — the original
// function body is untouched and still runs first for every page.
const hrLeaveCalendarBaseNavigate = navigate;
navigate = function (page) {
  hrLeaveCalendarBaseNavigate(page);
  const lp = $("hrLeaveCalendarPage");
  if (!lp) return;
  if (page === "Leave") {
    $("modulePage").hidden = true; // replace the "coming soon" placeholder for Leave only
    lp.hidden = false;
    hrLeaveCalendarRefreshAll();
  } else {
    lp.hidden = true;
  }
};

(function hrLeaveCalendarInit() {
  hrLeaveSeedDemoAttendance();
  hrLeaveBuildLegend();
  $("hrLeavePrevBtn").addEventListener("click", function () {
    changeLeaveCalendarMonth(-1);
  });
  $("hrLeaveNextBtn").addEventListener("click", function () {
    changeLeaveCalendarMonth(1);
  });
  $("hrLeaveTodayBtn").addEventListener("click", function () {
    changeLeaveCalendarMonth("today");
  });
  $("hrLeaveApplyBtn").addEventListener("click", function () {
    openLeaveApplicationModal(null);
  });
  $("hrLeaveCalendarGrid").addEventListener("click", function (ev) {
    const cell = ev.target.closest(".hr-leave-calendar-day[data-date]");
    if (cell) showAttendanceDayDetails(cell.dataset.date);
  });
  $("hrLeaveReqRows").addEventListener("click", function (ev) {
    const b = ev.target.closest("button[data-hlc-act]");
    if (!b) return;
    if (b.dataset.hlcAct === "cancel") hrLeaveCancelRequest(b.dataset.hlcId);
    else hrLeaveViewRequestDetails(b.dataset.hlcId);
  });
  hrLeaveCalendarRefreshAll(); // pre-render so the section is ready the moment "Leave" is opened
})();
/* ===== ADDED FEATURE — Leave & Attendance Calendar (JavaScript) · end ===== */

/* ===== portal inline block 3/11 (externalized for CSP; order preserved) ===== */

("use strict");
/* ============================================================
   ADDED FEATURE — HR Management Suite (JavaScript) · start
   A third <script> block. No existing script line was edited.
   Everything lives inside one IIFE and on window.HRX; all names
   are hrx-prefixed. Reuses existing globals (read-only):
     $, openModal, closeModal, toast, MONTHS, DAYS, navigate,
     and the Leave data (employeeLeaveRequests, companyHolidays).
   The router is extended by WRAPPING navigate() again.
   Backend integration: HRX.store is one connected in-memory
   database keyed by IDs — swap each array for an API response of
   the same shape and call HRX.renderRoute(current).
   ============================================================ */
(function () {
  var doc = document;
  function $id(x) {
    return doc.getElementById(x);
  }
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
  var MON =
    typeof MONTHS !== "undefined"
      ? MONTHS
      : [
          "Jan",
          "Feb",
          "Mar",
          "Apr",
          "May",
          "Jun",
          "Jul",
          "Aug",
          "Sep",
          "Oct",
          "Nov",
          "Dec",
        ];

  /* ---------------- Shared connected store (swap with API later) ---------------- */
  var S = {
    departments: [
      {
        id: "DEP-01",
        name: "Security Operations",
        head: "CHS-0004",
        budget: "₹3.2 Cr",
        active: true,
      },
      {
        id: "DEP-02",
        name: "Engineering",
        head: "CHS-0007",
        budget: "₹2.6 Cr",
        active: true,
      },
      {
        id: "DEP-03",
        name: "Sales & Marketing",
        head: "CHS-0010",
        budget: "₹1.4 Cr",
        active: true,
      },
      {
        id: "DEP-04",
        name: "Operations",
        head: "CHS-0012",
        budget: "₹0.9 Cr",
        active: true,
      },
      {
        id: "DEP-05",
        name: "Human Resources",
        head: "CHS-0001",
        budget: "₹0.6 Cr",
        active: true,
      },
    ],
    designations: [
      {
        id: "DSG-01",
        title: "SOC Analyst",
        deptId: "DEP-01",
        min: "₹5.0L",
        max: "₹9.0L",
      },
      {
        id: "DSG-02",
        title: "Security Engineer",
        deptId: "DEP-01",
        min: "₹8.0L",
        max: "₹16.0L",
      },
      {
        id: "DSG-03",
        title: "Frontend Developer",
        deptId: "DEP-02",
        min: "₹6.0L",
        max: "₹14.0L",
      },
      {
        id: "DSG-04",
        title: "Backend Developer",
        deptId: "DEP-02",
        min: "₹7.0L",
        max: "₹18.0L",
      },
      {
        id: "DSG-05",
        title: "Sales Executive",
        deptId: "DEP-03",
        min: "₹4.0L",
        max: "₹8.0L",
      },
      {
        id: "DSG-06",
        title: "HR Executive",
        deptId: "DEP-05",
        min: "₹4.5L",
        max: "₹9.0L",
      },
      {
        id: "DSG-07",
        title: "Operations Lead",
        deptId: "DEP-04",
        min: "₹6.0L",
        max: "₹12.0L",
      },
    ],
    // Salary is monthly in-hand (₹) — matches the portal's "in-hand only" rule.
    employees: [
      {
        id: "CHS-0001",
        name: "Kriti Singh",
        gender: "Female",
        dob: "1990-05-11",
        phone: "+91 98110 20001",
        email: "kriti.singh@cyethack.com",
        dept: "DEP-05",
        designation: "HR Manager",
        joining: "2021-02-01",
        empType: "Full-time",
        location: "Noida",
        manager: "",
        status: "Active",
        probation: false,
        experience: "9 yrs",
        salary: 145000,
        grade: "M2",
      },
      {
        id: "CHS-0004",
        name: "Aditya Sharma",
        gender: "Male",
        dob: "1988-09-22",
        phone: "+91 98110 20004",
        email: "aditya.sharma@cyethack.com",
        dept: "DEP-01",
        designation: "SOC Manager",
        joining: "2020-06-15",
        empType: "Full-time",
        location: "Noida",
        manager: "",
        status: "Active",
        probation: false,
        experience: "12 yrs",
        salary: 190000,
        grade: "M2",
      },
      {
        id: "CHS-0005",
        name: "Rahul Mehta",
        gender: "Male",
        dob: "1994-01-30",
        phone: "+91 98110 20005",
        email: "rahul.mehta@cyethack.com",
        dept: "DEP-01",
        designation: "SOC Analyst",
        joining: "2023-03-10",
        empType: "Full-time",
        location: "Noida",
        manager: "CHS-0004",
        status: "Active",
        probation: false,
        experience: "4 yrs",
        salary: 62000,
        grade: "E2",
      },
      {
        id: "CHS-0006",
        name: "Vikram Singh",
        gender: "Male",
        dob: "1992-07-18",
        phone: "+91 98110 20006",
        email: "vikram.singh@cyethack.com",
        dept: "DEP-01",
        designation: "Security Engineer",
        joining: "2022-08-01",
        empType: "Full-time",
        location: "Remote",
        manager: "CHS-0004",
        status: "Active",
        probation: false,
        experience: "6 yrs",
        salary: 118000,
        grade: "E3",
      },
      {
        id: "CHS-0007",
        name: "Neha Kapoor",
        gender: "Female",
        dob: "1989-11-05",
        phone: "+91 98110 20007",
        email: "neha.kapoor@cyethack.com",
        dept: "DEP-02",
        designation: "Engineering Lead",
        joining: "2020-01-20",
        empType: "Full-time",
        location: "Noida",
        manager: "",
        status: "Active",
        probation: false,
        experience: "11 yrs",
        salary: 205000,
        grade: "M2",
      },
      {
        id: "CHS-0008",
        name: "Priya Nair",
        gender: "Female",
        dob: "1996-03-14",
        phone: "+91 98110 20008",
        email: "priya.nair@cyethack.com",
        dept: "DEP-02",
        designation: "Frontend Developer",
        joining: "2023-07-03",
        empType: "Full-time",
        location: "Noida",
        manager: "CHS-0007",
        status: "Active",
        probation: false,
        experience: "3 yrs",
        salary: 78000,
        grade: "E2",
      },
      {
        id: "CHS-0009",
        name: "Aviral Gupta",
        gender: "Male",
        dob: "1995-12-02",
        phone: "+91 98110 20009",
        email: "aviral.gupta@cyethack.com",
        dept: "DEP-02",
        designation: "Backend Developer",
        joining: "2024-11-01",
        empType: "Full-time",
        location: "Noida",
        manager: "CHS-0007",
        status: "Probation",
        probation: true,
        experience: "2 yrs",
        salary: 72000,
        grade: "E1",
      },
      {
        id: "CHS-0010",
        name: "Sanjay Rao",
        gender: "Male",
        dob: "1987-06-27",
        phone: "+91 98110 20010",
        email: "sanjay.rao@cyethack.com",
        dept: "DEP-03",
        designation: "Sales Manager",
        joining: "2021-09-12",
        empType: "Full-time",
        location: "Noida",
        manager: "",
        status: "Active",
        probation: false,
        experience: "13 yrs",
        salary: 160000,
        grade: "M2",
      },
      {
        id: "CHS-0011",
        name: "Karan Gupta",
        gender: "Male",
        dob: "1997-04-09",
        phone: "+91 98110 20011",
        email: "karan.gupta@cyethack.com",
        dept: "DEP-03",
        designation: "Sales Executive",
        joining: "2024-02-19",
        empType: "Full-time",
        location: "Noida",
        manager: "CHS-0010",
        status: "Active",
        probation: false,
        experience: "3 yrs",
        salary: 54000,
        grade: "E1",
      },
      {
        id: "CHS-0012",
        name: "Meera Iyer",
        gender: "Female",
        dob: "1991-08-21",
        phone: "+91 98110 20012",
        email: "meera.iyer@cyethack.com",
        dept: "DEP-04",
        designation: "Operations Lead",
        joining: "2021-05-04",
        empType: "Full-time",
        location: "Noida",
        manager: "",
        status: "Active",
        probation: false,
        experience: "10 yrs",
        salary: 132000,
        grade: "M1",
      },
      {
        id: "CHS-0013",
        name: "Sneha Iyer",
        gender: "Female",
        dob: "1998-10-16",
        phone: "+91 98110 20013",
        email: "sneha.iyer@cyethack.com",
        dept: "DEP-05",
        designation: "HR Executive",
        joining: "2024-06-10",
        empType: "Full-time",
        location: "Noida",
        manager: "CHS-0001",
        status: "Active",
        probation: false,
        experience: "2 yrs",
        salary: 49000,
        grade: "E1",
      },
      {
        id: "CHS-0014",
        name: "Rohit Verma",
        gender: "Male",
        dob: "1993-02-25",
        phone: "+91 98110 20014",
        email: "rohit.verma@cyethack.com",
        dept: "DEP-04",
        designation: "Operations Executive",
        joining: "2023-11-22",
        empType: "Full-time",
        location: "Remote",
        manager: "CHS-0012",
        status: "On Leave",
        probation: false,
        experience: "5 yrs",
        salary: 58000,
        grade: "E2",
      },
    ],
    jobs: [
      {
        id: "JOB-101",
        title: "Senior SOC Analyst",
        dept: "DEP-01",
        designation: "SOC Analyst",
        location: "Noida",
        empType: "Full-time",
        workMode: "On-site",
        experience: "4-6 yrs",
        qualification: "B.Tech / BCA",
        skills: "SIEM, Threat Hunting, EDR",
        salMin: "₹9.0L",
        salMax: "₹15.0L",
        vacancies: 2,
        deadline: "2026-09-30",
        recruiter: "CHS-0001",
        description:
          "Investigate and respond to security incidents; tune detections.",
        status: "Open",
      },
      {
        id: "JOB-102",
        title: "React Frontend Developer",
        dept: "DEP-02",
        designation: "Frontend Developer",
        location: "Noida",
        empType: "Full-time",
        workMode: "Hybrid",
        experience: "2-4 yrs",
        qualification: "B.Tech",
        skills: "React, TypeScript, CSS",
        salMin: "₹8.0L",
        salMax: "₹14.0L",
        vacancies: 1,
        deadline: "2026-09-20",
        recruiter: "CHS-0001",
        description: "Build the customer-facing dashboard and internal tools.",
        status: "Open",
      },
      {
        id: "JOB-103",
        title: "Enterprise Sales Executive",
        dept: "DEP-03",
        designation: "Sales Executive",
        location: "Noida",
        empType: "Full-time",
        workMode: "On-site",
        experience: "2-5 yrs",
        qualification: "MBA preferred",
        skills: "B2B Sales, VAPT domain",
        salMin: "₹6.0L",
        salMax: "₹10.0L",
        vacancies: 3,
        deadline: "2026-10-15",
        recruiter: "CHS-0010",
        description:
          "Own the CERT-In / VAPT services pipeline for North India.",
        status: "Published",
      },
      {
        id: "JOB-104",
        title: "DevSecOps Engineer",
        dept: "DEP-02",
        designation: "Backend Developer",
        location: "Remote",
        empType: "Full-time",
        workMode: "Remote",
        experience: "3-6 yrs",
        qualification: "B.Tech",
        skills: "CI/CD, Kubernetes, SAST/DAST",
        salMin: "₹12.0L",
        salMax: "₹20.0L",
        vacancies: 1,
        deadline: "2026-11-01",
        recruiter: "CHS-0007",
        description: "Own the pipeline and cloud security posture.",
        status: "Draft",
      },
      {
        id: "JOB-105",
        title: "HR Executive",
        dept: "DEP-05",
        designation: "HR Executive",
        location: "Noida",
        empType: "Full-time",
        workMode: "On-site",
        experience: "1-3 yrs",
        qualification: "MBA HR",
        skills: "Recruitment, Onboarding, HRMS",
        salMin: "₹4.5L",
        salMax: "₹7.5L",
        vacancies: 1,
        deadline: "2026-09-12",
        recruiter: "CHS-0001",
        description:
          "Support the full-cycle recruitment and employee lifecycle.",
        status: "Closed",
      },
    ],
    candidates: [
      {
        id: "CAN-2001",
        name: "Ishaan Malhotra",
        email: "ishaan.m@example.com",
        phone: "+91 90000 12001",
        location: "Delhi",
        qualification: "B.Tech CSE",
        experience: "5 yrs",
        skills: "SIEM, Splunk, IR",
        jobId: "JOB-101",
        applied: "2026-08-18",
        recruiter: "CHS-0001",
        source: "LinkedIn",
        stage: "Interview",
        notes: "Strong incident-response background.",
      },
      {
        id: "CAN-2002",
        name: "Ananya Rao",
        email: "ananya.rao@example.com",
        phone: "+91 90000 12002",
        location: "Noida",
        qualification: "B.Tech IT",
        experience: "3 yrs",
        skills: "React, TS, Redux",
        jobId: "JOB-102",
        applied: "2026-08-22",
        recruiter: "CHS-0001",
        source: "Careers page",
        stage: "Technical Round",
        notes: "Good portfolio; clean React code.",
      },
      {
        id: "CAN-2003",
        name: "Zoya Khan",
        email: "zoya.khan@example.com",
        phone: "+91 90000 12003",
        location: "Gurugram",
        qualification: "MBA",
        experience: "4 yrs",
        skills: "B2B Sales",
        jobId: "JOB-103",
        applied: "2026-08-25",
        recruiter: "CHS-0010",
        source: "Referral",
        stage: "Shortlisted",
        notes: "Referred by Sanjay Rao.",
      },
      {
        id: "CAN-2004",
        name: "Dev Patel",
        email: "dev.patel@example.com",
        phone: "+91 90000 12004",
        location: "Remote",
        qualification: "B.Tech",
        experience: "6 yrs",
        skills: "K8s, CI/CD",
        jobId: "JOB-104",
        applied: "2026-08-28",
        recruiter: "CHS-0007",
        source: "LinkedIn",
        stage: "Applied",
        notes: "",
      },
      {
        id: "CAN-2005",
        name: "Ritika Sharma",
        email: "ritika.s@example.com",
        phone: "+91 90000 12005",
        location: "Delhi",
        qualification: "B.Tech",
        experience: "4 yrs",
        skills: "EDR, Threat Hunting",
        jobId: "JOB-101",
        applied: "2026-08-15",
        recruiter: "CHS-0001",
        source: "Naukri",
        stage: "HR Round",
        notes: "Cleared technical round comfortably.",
      },
      {
        id: "CAN-2006",
        name: "Arjun Nanda",
        email: "arjun.n@example.com",
        phone: "+91 90000 12006",
        location: "Noida",
        qualification: "B.Tech",
        experience: "3 yrs",
        skills: "React, Next.js",
        jobId: "JOB-102",
        applied: "2026-08-10",
        recruiter: "CHS-0001",
        source: "Careers page",
        stage: "Selected",
        notes: "Top choice for the frontend role.",
      },
      {
        id: "CAN-2007",
        name: "Fatima Sheikh",
        email: "fatima.s@example.com",
        phone: "+91 90000 12007",
        location: "Mumbai",
        qualification: "MBA",
        experience: "5 yrs",
        skills: "Enterprise sales",
        jobId: "JOB-103",
        applied: "2026-08-05",
        recruiter: "CHS-0010",
        source: "LinkedIn",
        stage: "Rejected",
        notes: "Compensation expectation out of band.",
      },
      {
        id: "CAN-2008",
        name: "Kabir Chawla",
        email: "kabir.c@example.com",
        phone: "+91 90000 12008",
        location: "Noida",
        qualification: "B.Tech",
        experience: "4 yrs",
        skills: "SIEM, Python",
        jobId: "JOB-101",
        applied: "2026-08-26",
        recruiter: "CHS-0001",
        source: "Referral",
        stage: "Screening",
        notes: "",
      },
    ],
    interviews: [
      {
        id: "INT-301",
        candidateId: "CAN-2001",
        type: "Technical Interview",
        date: "2026-09-05",
        time: "11:00 AM",
        interviewer: "CHS-0004",
        mode: "Video",
        link: "https://meet.example/soc-101",
        status: "Scheduled",
        rating: "",
        feedback: "",
      },
      {
        id: "INT-302",
        candidateId: "CAN-2002",
        type: "Technical Interview",
        date: "2026-09-04",
        time: "03:30 PM",
        interviewer: "CHS-0007",
        mode: "Video",
        link: "https://meet.example/fe-102",
        status: "Completed",
        rating: "4/5",
        feedback: "Solid fundamentals, good communication.",
      },
      {
        id: "INT-303",
        candidateId: "CAN-2005",
        type: "HR Interview",
        date: "2026-09-06",
        time: "12:00 PM",
        interviewer: "CHS-0001",
        mode: "On-site",
        link: "",
        status: "Scheduled",
        rating: "",
        feedback: "",
      },
      {
        id: "INT-304",
        candidateId: "CAN-2006",
        type: "Final Interview",
        date: "2026-08-30",
        time: "10:00 AM",
        interviewer: "CHS-0007",
        mode: "On-site",
        link: "",
        status: "Selected",
        rating: "5/5",
        feedback: "Excellent — recommend offer.",
      },
    ],
    offers: [
      {
        id: "OFF-401",
        candidateId: "CAN-2006",
        jobId: "JOB-102",
        joining: "2026-09-22",
        salary: 82000,
        empType: "Full-time",
        manager: "CHS-0007",
        offerDate: "2026-09-01",
        expiry: "2026-09-12",
        status: "Sent",
      },
      {
        id: "OFF-402",
        candidateId: "CAN-2003",
        jobId: "JOB-103",
        joining: "2026-10-01",
        salary: 66000,
        empType: "Full-time",
        manager: "CHS-0010",
        offerDate: "2026-09-02",
        expiry: "2026-09-15",
        status: "Draft",
      },
    ],
    // Onboarding checklist items shared by every onboarding record
    onboardingItems: [
      "Personal Information",
      "Contact Information",
      "Bank Details",
      "Government ID",
      "Educational Documents",
      "Previous Employment",
      "Offer Letter",
      "Joining Letter",
      "Company Policies",
      "IT Equipment",
      "Email Account",
      "System Access",
      "Department Assignment",
      "Manager Assignment",
    ],
    onboarding: [
      {
        id: "ONB-501",
        candidateId: "CAN-2006",
        name: "Arjun Nanda",
        dept: "DEP-02",
        joining: "2026-09-22",
        done: [
          "Personal Information",
          "Contact Information",
          "Offer Letter",
          "Joining Letter",
          "Department Assignment",
          "Manager Assignment",
        ],
      },
    ],
    projects: [
      {
        id: "PRJ-01",
        name: "FinServe VAPT",
        client: "FinServe Bank",
        dept: "DEP-01",
        manager: "CHS-0004",
        start: "2026-07-01",
        end: "2026-09-20",
        budget: "₹28.0L",
        priority: "High",
        status: "Active",
        progress: 74,
        members: ["CHS-0005", "CHS-0006"],
      },
      {
        id: "PRJ-02",
        name: "HRMS Portal v2",
        client: "Internal",
        dept: "DEP-02",
        manager: "CHS-0007",
        start: "2026-06-15",
        end: "2026-10-10",
        budget: "₹12.0L",
        priority: "Medium",
        status: "Active",
        progress: 58,
        members: ["CHS-0008", "CHS-0009"],
      },
      {
        id: "PRJ-03",
        name: "Retail Chain Pentest",
        client: "MartMax",
        dept: "DEP-01",
        manager: "CHS-0004",
        start: "2026-08-05",
        end: "2026-09-12",
        budget: "₹9.0L",
        priority: "High",
        status: "Active",
        progress: 40,
        members: ["CHS-0006"],
      },
      {
        id: "PRJ-04",
        name: "Sales CRM Rollout",
        client: "Internal",
        dept: "DEP-03",
        manager: "CHS-0010",
        start: "2026-09-01",
        end: "2026-11-30",
        budget: "₹6.0L",
        priority: "Low",
        status: "Planning",
        progress: 8,
        members: ["CHS-0011"],
      },
      {
        id: "PRJ-05",
        name: "Gov Portal Audit",
        client: "State e-Gov",
        dept: "DEP-01",
        manager: "CHS-0004",
        start: "2026-05-10",
        end: "2026-07-30",
        budget: "₹15.0L",
        priority: "High",
        status: "Completed",
        progress: 100,
        members: ["CHS-0005", "CHS-0006"],
      },
    ],
    tasks: [
      {
        id: "TSK-01",
        title: "External network VAPT — FinServe",
        projectId: "PRJ-01",
        assignee: "CHS-0005",
        assignedBy: "CHS-0004",
        priority: "High",
        start: "2026-08-20",
        due: "2026-09-08",
        status: "In Progress",
        progress: 65,
        est: 40,
        actual: 26,
      },
      {
        id: "TSK-02",
        title: "Web app pentest report — FinServe",
        projectId: "PRJ-01",
        assignee: "CHS-0006",
        assignedBy: "CHS-0004",
        priority: "Critical",
        start: "2026-09-01",
        due: "2026-09-14",
        status: "To Do",
        progress: 0,
        est: 24,
        actual: 0,
      },
      {
        id: "TSK-03",
        title: "Leave calendar module",
        projectId: "PRJ-02",
        assignee: "CHS-0008",
        assignedBy: "CHS-0007",
        priority: "Medium",
        start: "2026-08-25",
        due: "2026-09-03",
        status: "Completed",
        progress: 100,
        est: 16,
        actual: 15,
      },
      {
        id: "TSK-04",
        title: "Payroll API integration",
        projectId: "PRJ-02",
        assignee: "CHS-0009",
        assignedBy: "CHS-0007",
        priority: "High",
        start: "2026-09-02",
        due: "2026-09-18",
        status: "In Progress",
        progress: 30,
        est: 32,
        actual: 9,
      },
      {
        id: "TSK-05",
        title: "MartMax store network scan",
        projectId: "PRJ-03",
        assignee: "CHS-0006",
        assignedBy: "CHS-0004",
        priority: "High",
        start: "2026-08-28",
        due: "2026-08-31",
        status: "Overdue",
        progress: 50,
        est: 20,
        actual: 12,
      },
      {
        id: "TSK-06",
        title: "CRM data migration plan",
        projectId: "PRJ-04",
        assignee: "CHS-0011",
        assignedBy: "CHS-0010",
        priority: "Low",
        start: "2026-09-03",
        due: "2026-09-25",
        status: "To Do",
        progress: 0,
        est: 12,
        actual: 0,
      },
      {
        id: "TSK-07",
        title: "Final report — Gov Portal",
        projectId: "PRJ-05",
        assignee: "CHS-0005",
        assignedBy: "CHS-0004",
        priority: "Medium",
        start: "2026-07-20",
        due: "2026-07-29",
        status: "Completed",
        progress: 100,
        est: 18,
        actual: 18,
      },
      {
        id: "TSK-08",
        title: "Remediation review — FinServe",
        projectId: "PRJ-01",
        assignee: "CHS-0006",
        assignedBy: "CHS-0004",
        priority: "Medium",
        start: "2026-09-05",
        due: "2026-09-16",
        status: "Review",
        progress: 80,
        est: 10,
        actual: 8,
      },
    ],
    targets: [
      {
        id: "TGT-01",
        employeeId: "CHS-0005",
        dept: "DEP-01",
        name: "Vulnerabilities triaged",
        kpi: "Tickets closed",
        target: 120,
        achieved: 96,
        unit: "tickets",
        start: "2026-07-01",
        end: "2026-09-30",
        weightage: 30,
        status: "In Progress",
      },
      {
        id: "TGT-02",
        employeeId: "CHS-0006",
        dept: "DEP-01",
        name: "Pentest reports delivered",
        kpi: "Reports",
        target: 6,
        achieved: 5,
        unit: "reports",
        start: "2026-07-01",
        end: "2026-09-30",
        weightage: 40,
        status: "In Progress",
      },
      {
        id: "TGT-03",
        employeeId: "CHS-0008",
        dept: "DEP-02",
        name: "UI stories shipped",
        kpi: "Story points",
        target: 80,
        achieved: 82,
        unit: "points",
        start: "2026-07-01",
        end: "2026-09-30",
        weightage: 35,
        status: "Achieved",
      },
      {
        id: "TGT-04",
        employeeId: "CHS-0011",
        dept: "DEP-03",
        name: "Qualified leads",
        kpi: "SQLs",
        target: 40,
        achieved: 22,
        unit: "leads",
        start: "2026-07-01",
        end: "2026-09-30",
        weightage: 50,
        status: "In Progress",
      },
      {
        id: "TGT-05",
        employeeId: "CHS-0009",
        dept: "DEP-02",
        name: "API endpoints delivered",
        kpi: "Endpoints",
        target: 25,
        achieved: 9,
        unit: "endpoints",
        start: "2026-07-01",
        end: "2026-09-30",
        weightage: 30,
        status: "In Progress",
      },
      {
        id: "TGT-06",
        employeeId: "CHS-0014",
        dept: "DEP-04",
        name: "Process SLAs met",
        kpi: "SLA %",
        target: 95,
        achieved: 70,
        unit: "%",
        start: "2026-07-01",
        end: "2026-09-30",
        weightage: 25,
        status: "Partially Achieved",
      },
    ],
    reviews: [
      {
        id: "REV-01",
        employeeId: "CHS-0005",
        cycle: "Quarterly",
        period: "Q2 2026",
        score: 82,
        rating: "Excellent",
        manager: "CHS-0004",
        date: "2026-07-05",
        comments: "Reliable analyst, strong ownership.",
      },
      {
        id: "REV-02",
        employeeId: "CHS-0008",
        cycle: "Quarterly",
        period: "Q2 2026",
        score: 88,
        rating: "Outstanding",
        manager: "CHS-0007",
        date: "2026-07-06",
        comments: "Shipped the calendar module ahead of time.",
      },
      {
        id: "REV-03",
        employeeId: "CHS-0011",
        cycle: "Quarterly",
        period: "Q2 2026",
        score: 64,
        rating: "Needs Improvement",
        manager: "CHS-0010",
        date: "2026-07-07",
        comments: "Lead conversion below target; coaching in place.",
      },
      {
        id: "REV-04",
        employeeId: "CHS-0006",
        cycle: "Quarterly",
        period: "Q2 2026",
        score: 79,
        rating: "Good",
        manager: "CHS-0004",
        date: "2026-07-05",
        comments: "Consistent delivery on pentests.",
      },
    ],
    promotions: [
      {
        id: "PMO-01",
        employeeId: "CHS-0005",
        from: "SOC Analyst",
        to: "Senior SOC Analyst",
        effective: "2026-10-01",
        prevSalary: 62000,
        newSalary: 75000,
        reason: "Consistent high performance",
        approvedBy: "CHS-0004",
      },
    ],
    transfers: [
      {
        id: "TRF-01",
        employeeId: "CHS-0014",
        fromDept: "DEP-04",
        toDept: "DEP-01",
        fromLoc: "Remote",
        toLoc: "Noida",
        effective: "2026-10-15",
        reason: "SOC capacity expansion",
        approvedBy: "CHS-0004",
      },
    ],
    training: [
      {
        id: "TRN-01",
        name: "Advanced Threat Hunting",
        employeeId: "CHS-0005",
        trainer: "External — SANS",
        dept: "DEP-01",
        start: "2026-09-10",
        end: "2026-09-14",
        status: "In Progress",
        completion: 40,
        certification: "GCTI (pending)",
      },
      {
        id: "TRN-02",
        name: "React Performance Workshop",
        employeeId: "CHS-0008",
        trainer: "CHS-0007",
        dept: "DEP-02",
        start: "2026-08-20",
        end: "2026-08-21",
        status: "Completed",
        completion: 100,
        certification: "Internal",
      },
      {
        id: "TRN-03",
        name: "POSH & Compliance",
        employeeId: "CHS-0011",
        trainer: "CHS-0001",
        dept: "DEP-03",
        start: "2026-09-12",
        end: "2026-09-12",
        status: "Not Started",
        completion: 0,
        certification: "—",
      },
    ],
    exits: [
      {
        id: "EXT-01",
        employeeId: "CHS-0014",
        resignationDate: "2026-08-20",
        lastDay: "2026-10-20",
        reason: "Higher studies",
        noticePeriod: "60 days",
        assetReturn: "Pending",
        clearance: "Pending",
        settlement: "Pending",
        status: "Notice Period",
      },
    ],
    audit: [],
  };

  /* ---------------- Helpers ---------------- */
  function empName(id) {
    var e = S.employees.find(function (x) {
      return x.id === id;
    });
    return e ? e.name : id || "—";
  }
  function deptName(id) {
    var d = S.departments.find(function (x) {
      return x.id === id;
    });
    return d ? d.name : id || "—";
  }
  function jobTitle(id) {
    var j = S.jobs.find(function (x) {
      return x.id === id;
    });
    return j ? j.title : id || "—";
  }
  function candName(id) {
    var c = S.candidates.find(function (x) {
      return x.id === id;
    });
    return c ? c.name : id || "—";
  }
  function projName(id) {
    var p = S.projects.find(function (x) {
      return x.id === id;
    });
    return p ? p.name : id || "—";
  }
  function initials(n) {
    return String(n || "?")
      .split(" ")
      .map(function (w) {
        return w[0];
      })
      .join("")
      .slice(0, 2)
      .toUpperCase();
  }
  function money(n) {
    return "₹" + Number(n || 0).toLocaleString("en-IN");
  }
  function niceDate(iso) {
    if (!iso) return "—";
    var p = String(iso).split("-");
    if (p.length < 3) return iso;
    return +p[2] + " " + MON[+p[1] - 1] + " " + p[0];
  }
  var AVCLR = [
    "var(--teal)",
    "var(--violet)",
    "var(--blue)",
    "var(--orange)",
    "var(--amber)",
    "var(--green)",
  ];
  function avatarFor(id, name) {
    var i = 0,
      s = String(id || name || "");
    for (var k = 0; k < s.length; k++) i = (i + s.charCodeAt(k)) % AVCLR.length;
    return (
      '<span class="avatar" style="width:32px;height:32px;background:' +
      AVCLR[i] +
      '">' +
      initials(name) +
      "</span>"
    );
  }
  function empCell(id) {
    var n = empName(id);
    if (n === "—") return "—";
    return (
      '<span class="hrx-emp">' +
      avatarFor(id, n) +
      '<span class="who"><b>' +
      esc(n) +
      "</b><span>" +
      id +
      "</span></span></span>"
    );
  }

  // Status → badge class (reuses existing st-* pills, adds a few hrx- ones)
  var BADGE = {
    Active: "st-approved",
    Completed: "st-approved",
    Approved: "st-approved",
    Accepted: "st-approved",
    Selected: "st-approved",
    Hired: "st-approved",
    Achieved: "st-approved",
    Paid: "st-approved",
    Processed: "st-approved",
    Outstanding: "st-approved",
    Excellent: "st-approved",
    Published: "st-approved",
    Open: "st-approved",
    Pending: "st-pending",
    Draft: "st-pending",
    Scheduled: "st-pending",
    Sent: "st-pending",
    "In Progress": "st-pending",
    Screening: "st-pending",
    Shortlisted: "st-pending",
    Probation: "st-pending",
    "On Hold": "st-pending",
    Calculated: "st-pending",
    "Partially Achieved": "st-pending",
    "Notice Period": "st-pending",
    Planning: "st-pending",
    Review: "st-pending",
    "Pending Feedback": "st-pending",
    Good: "st-pending",
    Notice: "st-pending",
    Rejected: "st-rejected",
    Cancelled: "hr-leave-calendar-st-cancelled",
    Terminated: "st-rejected",
    Missed: "st-rejected",
    Overdue: "st-rejected",
    Unsatisfactory: "st-rejected",
    Blocked: "st-rejected",
    Withdrawn: "st-rejected",
    Expired: "st-rejected",
    Closed: "hr-leave-calendar-st-cancelled",
    Interview: "hrx-st-info",
    "Technical Round": "hrx-st-info",
    "HR Round": "hrx-st-info",
    "Offer Sent": "hrx-st-info",
    "On Leave": "hrx-st-info",
    "Not Started": "hrx-st-muted",
    "To Do": "hrx-st-muted",
    Applied: "hrx-st-muted",
    "Needs Improvement": "hrx-st-orange",
    Resigned: "hrx-st-muted",
    Retired: "hrx-st-muted",
    Suspended: "hrx-st-orange",
  };
  function badge(status) {
    if (status == null || status === "") return "—";
    var c = BADGE[status] || "hrx-st-muted";
    return '<span class="pill-status ' + c + '">' + esc(status) + "</span>";
  }
  function bar(pct) {
    pct = Math.max(0, Math.min(100, Math.round(pct || 0)));
    return (
      '<span class="hrx-barwrap"><span class="hrx-bar"><i style="width:' +
      pct +
      '%"></i></span><span class="hrx-pct">' +
      pct +
      "%</span></span>"
    );
  }

  function audit(action, record) {
    var d = new Date();
    S.audit.unshift({
      action: action,
      user:
        (typeof window !== "undefined" &&
          window.__hrUser &&
          window.__hrUser.name) ||
        "System",
      date:
        d.getFullYear() +
        "-" +
        String(d.getMonth() + 1).padStart(2, "0") +
        "-" +
        String(d.getDate()).padStart(2, "0"),
      time: d.toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
      }),
      record: record || "",
    });
  }
  function notify(text) {
    try {
      if (typeof DATA !== "undefined" && DATA.notifications) {
        DATA.notifications.unshift({
          text: text,
          time: "just now",
          read: false,
        });
        if (typeof renderBellMenu === "function") renderBellMenu();
      }
    } catch (e) {}
  }

  var seq = 9000;
  function nextId(prefix) {
    seq++;
    return prefix + "-" + seq;
  }

  // Expose the store + a few helpers for backend integration / debugging.
  window.HRX = {
    store: S,
    helpers: {
      empName: empName,
      deptName: deptName,
      money: money,
      badge: badge,
    },
    renderRoute: null,
  };

  /* ============================================================
     Generic engine — resource tables, forms, detail views
     ============================================================ */
  var uiState = {};
  function stateFor(key) {
    if (!uiState[key]) uiState[key] = { search: "", filters: {} };
    return uiState[key];
  }
  function openModalX(html) {
    if (typeof openModal === "function") openModal(html);
  }
  function closeModalX() {
    if (typeof closeModal === "function") closeModal();
  }
  function toastX(m) {
    if (typeof toast === "function") toast(m);
  }
  window.closeModal && (window.hrxCloseModal = window.closeModal);

  var RES = {}; // resource registry
  HRX.cur = null; // {type:'res', key} or {type:'special', ...}

  function resFilteredRows(key) {
    var cfg = RES[key],
      st = stateFor(key),
      q = st.search.trim().toLowerCase();
    return cfg.data().filter(function (r) {
      if (q) {
        var hay = (cfg.search ? cfg.search(r) : "").toLowerCase();
        if (hay.indexOf(q) < 0) return false;
      }
      if (cfg.filters) {
        for (var i = 0; i < cfg.filters.length; i++) {
          var f = cfg.filters[i],
            v = st.filters[f.k];
          if (v && !f.match(r, v)) return false;
        }
      }
      return true;
    });
  }
  function resView(key) {
    var cfg = RES[key],
      st = stateFor(key);
    HRX.cur = { type: "res", key: key };
    var h = "";
    if (cfg.summary) {
      h +=
        '<div class="hrx-statrow" id="hrxResStat">' +
        cfg
          .summary()
          .map(function (c) {
            return (
              '<div class="hrx-statchip"><span class="k">' +
              esc(c.k) +
              '</span><span class="v">' +
              esc(String(c.v)) +
              "</span>" +
              (c.s ? '<span class="s">' + esc(c.s) + "</span>" : "") +
              "</div>"
            );
          })
          .join("") +
        "</div>";
    }
    h += '<div class="hrx-toolbar">';
    h +=
      '<label class="hrx-search" data-hrx-res="' +
      key +
      '"><span>🔍</span><input type="text" placeholder="Search ' +
      esc(cfg.title.toLowerCase()) +
      '…" value="' +
      esc(st.search) +
      '" aria-label="Search ' +
      esc(cfg.title) +
      '"></label>';
    if (cfg.filters)
      cfg.filters.forEach(function (f) {
        h +=
          '<select data-hrx-filter="' +
          f.k +
          '" data-hrx-res="' +
          key +
          '"><option value="">' +
          esc(f.label) +
          "</option>" +
          f
            .opts()
            .map(function (o) {
              return (
                '<option value="' +
                esc(o.v) +
                '"' +
                (st.filters[f.k] === o.v ? " selected" : "") +
                ">" +
                esc(o.l) +
                "</option>"
              );
            })
            .join("") +
          "</select>";
      });
    h += '<span class="hrx-spacer"></span>';
    if (cfg.form)
      h +=
        '<button class="btn btn-primary btn-sm" data-hrx-add="' +
        key +
        '">+ ' +
        esc(cfg.addLabel || "Add " + cfg.singular) +
        "</button>";
    h += "</div>";
    h +=
      '<div class="table-scroll"><table aria-label="' +
      esc(cfg.title) +
      '"><thead><tr>' +
      cfg.columns
        .map(function (c) {
          return "<th>" + esc(c.h) + "</th>";
        })
        .join("") +
      (cfg.actions ? "<th>Action</th>" : "") +
      '</tr></thead><tbody id="hrxResBody"></tbody></table></div>';
    setTimeout(function () {
      resFillBody(key);
    }, 0);
    return h;
  }
  function resFillBody(key) {
    var cfg = RES[key],
      body = $id("hrxResBody");
    if (!body) return;
    var rows = resFilteredRows(key);
    var colspan = cfg.columns.length + (cfg.actions ? 1 : 0);
    if (!rows.length) {
      var emptyMessage =
        key === "employees" && window.__hrEmployeesLoading
          ? "Loading employee records…"
          : key === "employees" && window.__hrEmployeeLoadError
            ? "Unable to load employee records from the server."
            : "No " + cfg.title.toLowerCase() + " match your filters";
      body.innerHTML =
        '<tr><td colspan="' +
        colspan +
        '"><div class="empty">' +
        esc(emptyMessage) +
        (key === "employees" && window.__hrEmployeeLoadError
          ? ' <button type="button" class="btn btn-outline btn-sm" data-employee-retry>Retry</button>'
          : "") +
        "</div></td></tr>";
    } else
      body.innerHTML = rows
        .map(function (r) {
          var tds = cfg.columns
            .map(function (c) {
              return (
                "<td" + (c.num ? ' class="num"' : "") + ">" + c.c(r) + "</td>"
              );
            })
            .join("");
          if (cfg.actions) {
            var acts = cfg.actions(r) || [];
            tds +=
              '<td><div class="hrx-actbtns">' +
              acts
                .map(function (a) {
                  return (
                    '<button class="btn ' +
                    (a.cls || "btn-outline") +
                    ' btn-sm" data-hrx-act="' +
                    a.k +
                    '" data-hrx-res="' +
                    key +
                    '" data-hrx-id="' +
                    r[cfg.idKey || "id"] +
                    '">' +
                    esc(a.label) +
                    "</button>"
                  );
                })
                .join("") +
              "</div></td>";
          }
          return "<tr>" + tds + "</tr>";
        })
        .join("");
    var stat = $id("hrxResStat");
    if (stat && cfg.summary)
      stat.outerHTML =
        '<div class="hrx-statrow" id="hrxResStat">' +
        cfg
          .summary()
          .map(function (c) {
            return (
              '<div class="hrx-statchip"><span class="k">' +
              esc(c.k) +
              '</span><span class="v">' +
              esc(String(c.v)) +
              "</span>" +
              (c.s ? '<span class="s">' + esc(c.s) + "</span>" : "") +
              "</div>"
            );
          })
          .join("") +
        "</div>";
  }

  /* ---- form modal ---- */
  function fieldHTML(f, val) {
    var id = "hrxF_" + f.k,
      v = val == null ? (f.def != null ? f.def : "") : val;
    var lab =
      '<label for="' +
      id +
      '">' +
      esc(f.label) +
      (f.req ? " *" : "") +
      "</label>";
    var ctrl;
    if (f.type === "select") {
      ctrl =
        '<select id="' +
        id +
        '"><option value="">' +
        esc(f.ph || "Select…") +
        "</option>" +
        (typeof f.opts === "function" ? f.opts() : f.opts)
          .map(function (o) {
            var ov = o.v != null ? o.v : o,
              ol = o.l != null ? o.l : o;
            return (
              '<option value="' +
              esc(ov) +
              '"' +
              (String(v) === String(ov) ? " selected" : "") +
              ">" +
              esc(ol) +
              "</option>"
            );
          })
          .join("") +
        "</select>";
    } else if (f.type === "textarea") {
      ctrl =
        '<textarea id="' +
        id +
        '" placeholder="' +
        esc(f.ph || "") +
        '">' +
        esc(v) +
        "</textarea>";
    } else if (f.type === "checkbox") {
      return (
        '<label class="hrx-check"><input type="checkbox" id="' +
        id +
        '"' +
        (v ? " checked" : "") +
        "> " +
        esc(f.label) +
        "</label>"
      );
    } else if (f.type === "static") {
      ctrl =
        '<input id="' + id + '" type="text" value="' + esc(v) + '" disabled>';
    } else {
      ctrl =
        '<input id="' +
        id +
        '" type="' +
        (f.type || "text") +
        '" value="' +
        esc(v) +
        '" placeholder="' +
        esc(f.ph || "") +
        '"' +
        (f.min != null ? ' min="' + f.min + '"' : "") +
        ">";
    }
    return (
      '<div class="field" data-hrx-field="' +
      f.k +
      '">' +
      lab +
      ctrl +
      '<div class="err">' +
      esc(f.msg || "Please fill " + f.label.toLowerCase() + ".") +
      "</div></div>" +
      (f.hint ? '<div class="hrx-hint">' + esc(f.hint) + "</div>" : "")
    );
  }
  function openForm(key, row) {
    var cfg = RES[key],
      editing = !!row;
    var groups = [];
    var cur = [];
    cfg.form.forEach(function (f) {
      var html = fieldHTML(f, row ? row[f.k] : undefined);
      if (f.half) {
        cur.push(html);
        if (cur.length === 2) {
          groups.push('<div class="hrx-2col">' + cur.join("") + "</div>");
          cur = [];
        }
      } else {
        if (cur.length) {
          groups.push('<div class="hrx-2col">' + cur.join("") + "</div>");
          cur = [];
        }
        groups.push(html);
      }
    });
    if (cur.length)
      groups.push(
        cur.length === 2
          ? '<div class="hrx-2col">' + cur.join("") + "</div>"
          : cur[0],
      );
    openModalX(
      '<div class="modal-head"><h3>' +
        (editing ? "Edit " : "Add ") +
        esc(cfg.singular) +
        '</h3><button class="icon-btn" style="width:32px;height:32px" aria-label="Close" data-close="1">✕</button></div>' +
        '<div class="modal-body hrx-modalbody hrx-form">' +
        groups.join("") +
        '<div class="hrx-formerr" id="hrxFormErr" role="alert"></div></div>' +
        '<div class="modal-foot"><button class="btn btn-ghost" data-close="1">Cancel</button>' +
        '<button class="btn btn-primary" id="hrxFormSubmit">' +
        (editing ? "Save changes" : "Add " + esc(cfg.singular)) +
        "</button></div>",
    );
    $id("hrxFormSubmit").addEventListener("click", function () {
      submitForm(key, row);
    });
  }
  function readField(f) {
    var el = $id("hrxF_" + f.k);
    if (!el) return "";
    if (f.type === "checkbox") return el.checked;
    if (f.type === "number") return el.value === "" ? "" : Number(el.value);
    return el.value;
  }
  function submitForm(key, row) {
    var cfg = RES[key],
      vals = {},
      errors = [];
    doc.querySelectorAll("[data-hrx-field]").forEach(function (d) {
      d.classList.remove("invalid");
    });
    cfg.form.forEach(function (f) {
      var v = readField(f);
      vals[f.k] = v;
      var bad = null;
      if (
        f.req &&
        (v === "" || v == null || (v === false && f.type !== "checkbox"))
      )
        bad = f.label + " is required.";
      if (
        !bad &&
        v !== "" &&
        f.type === "email" &&
        !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)
      )
        bad = "Enter a valid email address.";
      if (
        !bad &&
        v !== "" &&
        f.type === "tel" &&
        String(v).replace(/\D/g, "").length < 10
      )
        bad = "Enter a valid phone number.";
      if (
        !bad &&
        v !== "" &&
        f.type === "number" &&
        f.min != null &&
        Number(v) < f.min
      )
        bad = f.label + " must be at least " + f.min + ".";
      if (!bad && f.validate) {
        var m = f.validate(v, vals, row);
        if (m) bad = m;
      }
      if (bad) {
        errors.push(bad);
        var fd = doc.querySelector('[data-hrx-field="' + f.k + '"]');
        if (fd) fd.classList.add("invalid");
      }
    });
    var eb = $id("hrxFormErr");
    if (errors.length) {
      if (eb) {
        eb.innerHTML = errors.map(esc).join("<br>");
        eb.classList.add("hrx-show");
      }
      return;
    }
    if (row) {
      cfg.form.forEach(function (f) {
        row[f.k] = vals[f.k];
      });
      if (cfg.onEdit) cfg.onEdit(row);
      audit(cfg.singular + " updated", row[cfg.idKey || "id"]);
      toastX(cfg.singular + " updated");
    } else {
      var rec = cfg.onNew ? cfg.onNew(vals) : vals;
      if (!rec[cfg.idKey || "id"])
        rec[cfg.idKey || "id"] = nextId(cfg.idPrefix);
      cfg.data().unshift(rec);
      audit(cfg.singular + " created", rec[cfg.idKey || "id"]);
      if (cfg.notify) notify(cfg.notify(rec));
      toastX(
        cfg.singular +
          " added: " +
          (rec.name || rec.title || rec[cfg.idKey || "id"]),
      );
    }
    closeModalX();
    if (HRX.cur && HRX.cur.type === "res" && HRX.cur.key === key)
      resFillBody(key);
    else renderRoute(HRX.route);
  }

  /* ---- detail modal ---- */
  function openDetail(title, pairs) {
    var body = pairs
      .map(function (p) {
        if (p[0] === "##")
          return '<div class="hrx-sec">' + esc(p[1]) + "</div>";
        return (
          "<dt>" +
          esc(p[0]) +
          "</dt><dd>" +
          (p[2] === "html" ? p[1] : esc(p[1])) +
          "</dd>"
        );
      })
      .join("");
    openModalX(
      '<div class="modal-head"><h3>' +
        esc(title) +
        '</h3><button class="icon-btn" style="width:32px;height:32px" aria-label="Close" data-close="1">✕</button></div>' +
        '<div class="modal-body hrx-modalbody"><dl class="hrx-detail">' +
        body +
        "</dl></div>" +
        '<div class="modal-foot"><button class="btn btn-ghost" data-close="1">Close</button></div>',
    );
  }
  function resDetail(key, id) {
    var cfg = RES[key];
    var r = cfg.data().find(function (x) {
      return x[cfg.idKey || "id"] === id;
    });
    if (r) openDetail(cfg.singular + " · " + id, cfg.detail(r));
  }

  /* ============================================================
     Resource configs
     ============================================================ */
  var deptOpts = function () {
    return S.departments.map(function (d) {
      return { v: d.id, l: d.name };
    });
  };
  var empOpts = function () {
    return S.employees.map(function (e) {
      return { v: e.id, l: e.name + " (" + e.id + ")" };
    });
  };

  RES.employees = {
    title: "Employees",
    singular: "Employee",
    idPrefix: "CHS",
    data: function () {
      return S.employees;
    },
    search: function (r) {
      return [r.name, r.id, r.email, r.designation, deptName(r.dept)].join(" ");
    },
    summary: function () {
      var e = S.employees;
      return [
        { k: "Total", v: e.length },
        {
          k: "Active",
          v: e.filter(function (x) {
            return x.status === "Active";
          }).length,
        },
        {
          k: "On Probation",
          v: e.filter(function (x) {
            return x.probation;
          }).length,
        },
        {
          k: "On Leave",
          v: e.filter(function (x) {
            return x.status === "On Leave";
          }).length,
        },
        {
          k: "Exiting",
          v: S.exits.filter(function (x) {
            return x.status !== "Completed";
          }).length,
        },
      ];
    },
    filters: [
      {
        k: "dept",
        label: "All departments",
        opts: deptOpts,
        match: function (r, v) {
          return r.dept === v;
        },
      },
      {
        k: "status",
        label: "All statuses",
        opts: function () {
          return [
            "Active",
            "Probation",
            "On Leave",
            "Resigned",
            "Terminated",
          ].map(function (s) {
            return { v: s, l: s };
          });
        },
        match: function (r, v) {
          return r.status === v;
        },
      },
    ],
    columns: [
      {
        h: "Employee",
        c: function (r) {
          return empCell(r.id);
        },
      },
      {
        h: "Department",
        c: function (r) {
          return esc(deptName(r.dept));
        },
      },
      {
        h: "Designation",
        c: function (r) {
          return esc(r.designation);
        },
      },
      {
        h: "Joining",
        num: true,
        c: function (r) {
          return niceDate(r.joining);
        },
      },
      {
        h: "Manager",
        c: function (r) {
          return esc(r.manager ? empName(r.manager) : "—");
        },
      },
      {
        h: "Status",
        c: function (r) {
          return badge(r.status);
        },
      },
    ],
    actions: function () {
      var actions = [
        { k: "view", label: "View" },
        { k: "edit", label: "Edit", cls: "btn-outline" },
      ];
      if (window.hrCanReadPayroll && window.hrCanReadPayroll())
        actions.push({
          k: "invoice",
          label: "Raise Invoice",
          cls: "btn-outline",
        });
      return actions;
    },
    onAct: function (action, row) {
      if (action === "invoice" && window.hrRaiseInvoice)
        window.hrRaiseInvoice(row.employeeId || row.id);
    },
    detail: function (r) {
      return [
        ["##", "Personal"],
        ["Employee ID", r.id],
        ["Full Name", r.name],
        ["Gender", r.gender],
        ["Date of Birth", niceDate(r.dob)],
        ["Phone", r.phone],
        ["Email", r.email],
        ["##", "Professional"],
        ["Department", deptName(r.dept)],
        ["Designation", r.designation],
        ["Employment Type", r.empType],
        ["Work Location", r.location],
        ["Reporting Manager", r.manager ? empName(r.manager) : "—"],
        ["Joining Date", niceDate(r.joining)],
        ["Status", badge(r.status), "html"],
        ["Probation", r.probation ? "Yes" : "No"],
        ["##", "Employment"],
        ["Experience", r.experience],
        [
          "Monthly In-hand",
          r.salary === undefined ? "Not available" : money(r.salary),
        ],
        ["Grade", r.grade],
      ];
    },
    form: [
      { k: "name", label: "Full name", req: true, half: true },
      {
        k: "id",
        label: "Employee ID",
        hint: "Leave blank to auto-generate",
        half: true,
        validate: function (v, a, row) {
          if (
            v &&
            !row &&
            S.employees.some(function (e) {
              return e.id === v;
            })
          )
            return "Employee ID " + v + " already exists.";
        },
      },
      {
        k: "gender",
        label: "Gender",
        type: "select",
        opts: ["Male", "Female", "Other"],
        half: true,
      },
      { k: "dob", label: "Date of birth", type: "date", half: true },
      { k: "phone", label: "Phone", type: "tel", req: true, half: true },
      { k: "email", label: "Email", type: "email", req: true, half: true },
      {
        k: "dept",
        label: "Department",
        type: "select",
        req: true,
        opts: deptOpts,
        half: true,
      },
      { k: "designation", label: "Designation", req: true, half: true },
      {
        k: "empType",
        label: "Employment type",
        type: "select",
        opts: ["Full-time", "Part-time", "Contract", "Intern"],
        def: "Full-time",
        half: true,
      },
      { k: "location", label: "Work location", half: true, def: "Noida" },
      {
        k: "manager",
        label: "Reporting manager",
        type: "select",
        opts: empOpts,
        half: true,
      },
      {
        k: "joining",
        label: "Joining date",
        type: "date",
        req: true,
        half: true,
      },
      {
        k: "salary",
        label: "Monthly in-hand (₹)",
        type: "number",
        min: 0,
        req: true,
        half: true,
      },
      {
        k: "status",
        label: "Status",
        type: "select",
        opts: ["Active", "Probation", "On Leave"],
        def: "Active",
        half: true,
      },
      { k: "experience", label: "Experience", half: true, def: "0 yrs" },
      { k: "grade", label: "Salary grade", half: true, def: "E1" },
    ],
    onNew: function (v) {
      v.probation = v.status === "Probation";
      return v;
    },
    onEdit: function (r) {
      r.probation = r.status === "Probation";
    },
    notify: function (r) {
      return "New employee joined: " + r.name + " (" + deptName(r.dept) + ")";
    },
  };

  RES.departments = {
    title: "Departments",
    singular: "Department",
    idPrefix: "DEP",
    data: function () {
      return S.departments;
    },
    search: function (r) {
      return r.name;
    },
    columns: [
      {
        h: "ID",
        num: true,
        c: function (r) {
          return r.id;
        },
      },
      {
        h: "Department",
        c: function (r) {
          return esc(r.name);
        },
      },
      {
        h: "Head",
        c: function (r) {
          return esc(r.head ? empName(r.head) : "—");
        },
      },
      {
        h: "Employees",
        num: true,
        c: function (r) {
          return S.employees.filter(function (e) {
            return e.dept === r.id;
          }).length;
        },
      },
      {
        h: "Budget",
        num: true,
        c: function (r) {
          return esc(r.budget);
        },
      },
      {
        h: "Status",
        c: function (r) {
          return badge(r.active ? "Active" : "Inactive");
        },
      },
    ],
    actions: function () {
      return [{ k: "edit", label: "Edit", cls: "btn-outline" }];
    },
    form: [
      { k: "name", label: "Department name", req: true },
      { k: "head", label: "Department head", type: "select", opts: empOpts },
      { k: "budget", label: "Annual budget" },
    ],
    onNew: function (v) {
      v.active = true;
      return v;
    },
  };

  RES.designations = {
    title: "Designations",
    singular: "Designation",
    idPrefix: "DSG",
    data: function () {
      return S.designations;
    },
    search: function (r) {
      return r.title + " " + deptName(r.deptId);
    },
    filters: [
      {
        k: "deptId",
        label: "All departments",
        opts: deptOpts,
        match: function (r, v) {
          return r.deptId === v;
        },
      },
    ],
    columns: [
      {
        h: "ID",
        num: true,
        c: function (r) {
          return r.id;
        },
      },
      {
        h: "Designation",
        c: function (r) {
          return esc(r.title);
        },
      },
      {
        h: "Department",
        c: function (r) {
          return esc(deptName(r.deptId));
        },
      },
      {
        h: "Salary range",
        num: true,
        c: function (r) {
          return esc(r.min + " – " + r.max);
        },
      },
    ],
    actions: function () {
      return [{ k: "edit", label: "Edit", cls: "btn-outline" }];
    },
    form: [
      { k: "title", label: "Designation title", req: true },
      {
        k: "deptId",
        label: "Department",
        type: "select",
        req: true,
        opts: deptOpts,
      },
      { k: "min", label: "Salary min", half: true, def: "₹0" },
      { k: "max", label: "Salary max", half: true, def: "₹0" },
    ],
  };

  RES.jobs = {
    title: "Job Openings",
    singular: "Job",
    idPrefix: "JOB",
    data: function () {
      return S.jobs;
    },
    search: function (r) {
      return r.title + " " + deptName(r.dept) + " " + r.skills;
    },
    summary: function () {
      var j = S.jobs;
      return [
        {
          k: "Open positions",
          v: j.filter(function (x) {
            return x.status === "Open" || x.status === "Published";
          }).length,
        },
        {
          k: "Total vacancies",
          v: j.reduce(function (a, x) {
            return (
              a +
              (x.status === "Open" || x.status === "Published"
                ? +x.vacancies
                : 0)
            );
          }, 0),
        },
        {
          k: "Draft",
          v: j.filter(function (x) {
            return x.status === "Draft";
          }).length,
        },
        {
          k: "Closed",
          v: j.filter(function (x) {
            return x.status === "Closed";
          }).length,
        },
      ];
    },
    filters: [
      {
        k: "status",
        label: "All statuses",
        opts: function () {
          return ["Draft", "Published", "Open", "On Hold", "Closed"].map(
            function (s) {
              return { v: s, l: s };
            },
          );
        },
        match: function (r, v) {
          return r.status === v;
        },
      },
      {
        k: "dept",
        label: "All departments",
        opts: deptOpts,
        match: function (r, v) {
          return r.dept === v;
        },
      },
    ],
    columns: [
      {
        h: "Job ID",
        num: true,
        c: function (r) {
          return r.id;
        },
      },
      {
        h: "Title",
        c: function (r) {
          return esc(r.title);
        },
      },
      {
        h: "Department",
        c: function (r) {
          return esc(deptName(r.dept));
        },
      },
      {
        h: "Type",
        c: function (r) {
          return esc(r.empType + " · " + r.workMode);
        },
      },
      {
        h: "Vacancies",
        num: true,
        c: function (r) {
          return r.vacancies;
        },
      },
      {
        h: "Applicants",
        num: true,
        c: function (r) {
          return S.candidates.filter(function (c) {
            return c.jobId === r.id;
          }).length;
        },
      },
      {
        h: "Deadline",
        num: true,
        c: function (r) {
          return niceDate(r.deadline);
        },
      },
      {
        h: "Status",
        c: function (r) {
          return badge(r.status);
        },
      },
    ],
    actions: function (r) {
      var a = [
        { k: "view", label: "View" },
        { k: "edit", label: "Edit", cls: "btn-outline" },
      ];
      if (r.status === "Draft")
        a.push({ k: "publish", label: "Publish", cls: "btn-outline" });
      else if (r.status !== "Closed")
        a.push({ k: "close", label: "Close", cls: "btn-danger-outline" });
      else a.push({ k: "reopen", label: "Reopen", cls: "btn-outline" });
      return a;
    },
    onAct: function (k, r) {
      if (k === "publish") {
        r.status = "Published";
      } else if (k === "close") {
        r.status = "Closed";
      } else if (k === "reopen") {
        r.status = "Open";
      }
      audit("Job " + k, r.id);
      resFillBody("jobs");
      toastX("Job " + r.id + " → " + r.status);
    },
    detail: function (r) {
      return [
        ["Job ID", r.id],
        ["Title", r.title],
        ["Department", deptName(r.dept)],
        ["Designation", r.designation],
        ["Location", r.location],
        ["Employment Type", r.empType],
        ["Work Mode", r.workMode],
        ["Experience", r.experience],
        ["Qualification", r.qualification],
        ["Skills", r.skills],
        ["Salary Range", r.salMin + " – " + r.salMax],
        ["Vacancies", String(r.vacancies)],
        ["Application Deadline", niceDate(r.deadline)],
        ["Recruiter", empName(r.recruiter)],
        ["Status", badge(r.status), "html"],
        [
          "Applicants",
          String(
            S.candidates.filter(function (c) {
              return c.jobId === r.id;
            }).length,
          ),
        ],
        ["Description", r.description],
      ];
    },
    form: [
      { k: "title", label: "Job title", req: true },
      {
        k: "dept",
        label: "Department",
        type: "select",
        req: true,
        opts: deptOpts,
        half: true,
      },
      { k: "designation", label: "Designation", half: true },
      { k: "location", label: "Location", half: true, def: "Noida" },
      {
        k: "empType",
        label: "Employment type",
        type: "select",
        opts: ["Full-time", "Part-time", "Contract", "Intern"],
        def: "Full-time",
        half: true,
      },
      {
        k: "workMode",
        label: "Work mode",
        type: "select",
        opts: ["On-site", "Hybrid", "Remote"],
        def: "On-site",
        half: true,
      },
      {
        k: "experience",
        label: "Experience required",
        half: true,
        def: "0-2 yrs",
      },
      { k: "qualification", label: "Qualification", half: true },
      { k: "skills", label: "Skills required", half: true },
      { k: "salMin", label: "Salary min", half: true, def: "₹0" },
      { k: "salMax", label: "Salary max", half: true, def: "₹0" },
      {
        k: "vacancies",
        label: "Vacancies",
        type: "number",
        min: 1,
        def: 1,
        half: true,
        req: true,
      },
      {
        k: "deadline",
        label: "Application deadline",
        type: "date",
        half: true,
      },
      {
        k: "recruiter",
        label: "Recruiter / HR",
        type: "select",
        opts: empOpts,
        half: true,
      },
      {
        k: "status",
        label: "Status",
        type: "select",
        opts: ["Draft", "Published", "Open", "On Hold", "Closed"],
        def: "Draft",
        half: true,
      },
      { k: "description", label: "Job description", type: "textarea" },
    ],
    notify: function (r) {
      return "New job posted: " + r.title;
    },
  };

  var PIPELINE = [
    "Applied",
    "Screening",
    "Shortlisted",
    "Interview",
    "Technical Round",
    "HR Round",
    "Selected",
    "Offer Sent",
    "Offer Accepted",
    "Hired",
    "Rejected",
  ];
  RES.candidates = {
    title: "Candidates",
    singular: "Candidate",
    idPrefix: "CAN",
    data: function () {
      return S.candidates;
    },
    search: function (r) {
      return r.name + " " + r.id + " " + r.skills + " " + jobTitle(r.jobId);
    },
    summary: function () {
      var c = S.candidates;
      function n(s) {
        return c.filter(function (x) {
          return x.stage === s;
        }).length;
      }
      return [
        { k: "Total applicants", v: c.length },
        { k: "Shortlisted", v: n("Shortlisted") },
        {
          k: "In interview",
          v: n("Interview") + n("Technical Round") + n("HR Round"),
        },
        { k: "Selected", v: n("Selected") },
        { k: "Rejected", v: n("Rejected") },
      ];
    },
    filters: [
      {
        k: "stage",
        label: "All stages",
        opts: function () {
          return PIPELINE.map(function (s) {
            return { v: s, l: s };
          });
        },
        match: function (r, v) {
          return r.stage === v;
        },
      },
      {
        k: "jobId",
        label: "All jobs",
        opts: function () {
          return S.jobs.map(function (j) {
            return { v: j.id, l: j.title };
          });
        },
        match: function (r, v) {
          return r.jobId === v;
        },
      },
    ],
    columns: [
      {
        h: "Candidate",
        c: function (r) {
          return (
            '<span class="hrx-emp">' +
            avatarFor(r.id, r.name) +
            '<span class="who"><b>' +
            esc(r.name) +
            "</b><span>" +
            r.id +
            "</span></span></span>"
          );
        },
      },
      {
        h: "Applied for",
        c: function (r) {
          return esc(jobTitle(r.jobId));
        },
      },
      {
        h: "Experience",
        c: function (r) {
          return esc(r.experience);
        },
      },
      {
        h: "Source",
        c: function (r) {
          return esc(r.source);
        },
      },
      {
        h: "Applied",
        num: true,
        c: function (r) {
          return niceDate(r.applied);
        },
      },
      {
        h: "Stage",
        c: function (r) {
          return badge(r.stage);
        },
      },
    ],
    actions: function (r) {
      var a = [{ k: "view", label: "View" }];
      var i = PIPELINE.indexOf(r.stage);
      if (r.stage !== "Hired" && r.stage !== "Rejected" && i < 9)
        a.push({ k: "advance", label: "Advance", cls: "btn-outline" });
      if (r.stage !== "Rejected" && r.stage !== "Hired")
        a.push({ k: "reject", label: "Reject", cls: "btn-danger-outline" });
      return a;
    },
    onAct: function (k, r) {
      if (k === "advance") {
        var i = PIPELINE.indexOf(r.stage);
        if (i < 9) {
          r.stage = PIPELINE[i + 1];
          audit("Candidate advanced", r.id + " → " + r.stage);
          notify(r.name + " moved to " + r.stage);
        }
      } else if (k === "reject") {
        r.stage = "Rejected";
        audit("Candidate rejected", r.id);
      }
      resFillBody("candidates");
      toastX(r.name + " → " + r.stage);
    },
    detail: function (r) {
      var ints = S.interviews.filter(function (x) {
        return x.candidateId === r.id;
      });
      return [
        ["##", "Profile"],
        ["Candidate ID", r.id],
        ["Full Name", r.name],
        ["Email", r.email],
        ["Phone", r.phone],
        ["Location", r.location],
        ["Qualification", r.qualification],
        ["Experience", r.experience],
        ["Skills", r.skills],
        ["##", "Application"],
        ["Applied Position", jobTitle(r.jobId)],
        ["Application Date", niceDate(r.applied)],
        ["Recruiter", empName(r.recruiter)],
        ["Source", r.source],
        ["Current Stage", badge(r.stage), "html"],
        ["Notes", r.notes || "—"],
        ["##", "Interview History"],
        [
          "Interviews",
          ints.length
            ? ints
                .map(function (x) {
                  return (
                    x.type +
                    " — " +
                    x.status +
                    (x.rating ? " (" + x.rating + ")" : "")
                  );
                })
                .join("<br>")
            : "—",
          "html",
        ],
      ];
    },
    form: [
      { k: "name", label: "Full name", req: true, half: true },
      { k: "email", label: "Email", type: "email", req: true, half: true },
      { k: "phone", label: "Phone", type: "tel", req: true, half: true },
      { k: "location", label: "Location", half: true },
      { k: "qualification", label: "Qualification", half: true },
      { k: "experience", label: "Experience", half: true, def: "0 yrs" },
      { k: "skills", label: "Skills", half: true },
      {
        k: "jobId",
        label: "Applied position",
        type: "select",
        req: true,
        opts: function () {
          return S.jobs.map(function (j) {
            return { v: j.id, l: j.title };
          });
        },
        half: true,
      },
      {
        k: "source",
        label: "Source",
        type: "select",
        opts: ["Careers page", "LinkedIn", "Naukri", "Referral", "Other"],
        def: "Careers page",
        half: true,
      },
      {
        k: "recruiter",
        label: "Recruiter",
        type: "select",
        opts: empOpts,
        half: true,
      },
      {
        k: "stage",
        label: "Stage",
        type: "select",
        opts: PIPELINE,
        def: "Applied",
        half: true,
      },
      {
        k: "applied",
        label: "Application date",
        type: "date",
        def: new Date().toISOString().slice(0, 10),
        half: true,
      },
      { k: "notes", label: "Notes", type: "textarea" },
    ],
    notify: function (r) {
      return "New application: " + r.name + " for " + jobTitle(r.jobId);
    },
  };

  RES.interviews = {
    title: "Interviews",
    singular: "Interview",
    idPrefix: "INT",
    data: function () {
      return S.interviews;
    },
    search: function (r) {
      return (
        candName(r.candidateId) + " " + r.type + " " + empName(r.interviewer)
      );
    },
    filters: [
      {
        k: "status",
        label: "All statuses",
        opts: function () {
          return [
            "Scheduled",
            "Completed",
            "Rescheduled",
            "Cancelled",
            "Selected",
            "Rejected",
            "Pending Feedback",
          ].map(function (s) {
            return { v: s, l: s };
          });
        },
        match: function (r, v) {
          return r.status === v;
        },
      },
    ],
    columns: [
      {
        h: "Candidate",
        c: function (r) {
          return esc(candName(r.candidateId));
        },
      },
      {
        h: "Type",
        c: function (r) {
          return esc(r.type);
        },
      },
      {
        h: "Date",
        num: true,
        c: function (r) {
          return niceDate(r.date);
        },
      },
      {
        h: "Time",
        num: true,
        c: function (r) {
          return esc(r.time);
        },
      },
      {
        h: "Interviewer",
        c: function (r) {
          return esc(empName(r.interviewer));
        },
      },
      {
        h: "Mode",
        c: function (r) {
          return esc(r.mode);
        },
      },
      {
        h: "Status",
        c: function (r) {
          return badge(r.status);
        },
      },
    ],
    actions: function (r) {
      var a = [
        { k: "view", label: "View" },
        { k: "edit", label: "Edit", cls: "btn-outline" },
      ];
      if (r.status === "Scheduled")
        a.push({ k: "done", label: "Mark done", cls: "btn-outline" });
      return a;
    },
    onAct: function (k, r) {
      if (k === "done") {
        r.status = "Completed";
        audit("Interview completed", r.id);
        resFillBody("interviews");
        toastX("Interview " + r.id + " completed");
      }
    },
    detail: function (r) {
      return [
        ["Interview ID", r.id],
        ["Candidate", candName(r.candidateId)],
        ["Type", r.type],
        ["Date", niceDate(r.date)],
        ["Time", r.time],
        ["Interviewer", empName(r.interviewer)],
        ["Mode", r.mode],
        ["Meeting Link / Location", r.link || "—"],
        ["Status", badge(r.status), "html"],
        ["Overall Rating", r.rating || "—"],
        ["Feedback", r.feedback || "—"],
      ];
    },
    form: [
      {
        k: "candidateId",
        label: "Candidate",
        type: "select",
        req: true,
        opts: function () {
          return S.candidates.map(function (c) {
            return { v: c.id, l: c.name };
          });
        },
        half: true,
      },
      {
        k: "type",
        label: "Interview type",
        type: "select",
        req: true,
        opts: [
          "Phone Screening",
          "HR Interview",
          "Technical Interview",
          "Managerial Interview",
          "Final Interview",
        ],
        half: true,
      },
      { k: "date", label: "Date", type: "date", req: true, half: true },
      { k: "time", label: "Time", req: true, half: true, def: "11:00 AM" },
      {
        k: "interviewer",
        label: "Interviewer",
        type: "select",
        req: true,
        opts: empOpts,
        half: true,
      },
      {
        k: "mode",
        label: "Mode",
        type: "select",
        opts: ["Video", "On-site", "Phone"],
        def: "Video",
        half: true,
      },
      { k: "link", label: "Meeting link / location", half: true },
      {
        k: "status",
        label: "Status",
        type: "select",
        opts: [
          "Scheduled",
          "Completed",
          "Rescheduled",
          "Cancelled",
          "Selected",
          "Rejected",
          "Pending Feedback",
        ],
        def: "Scheduled",
        half: true,
      },
      { k: "rating", label: "Overall rating", half: true, ph: "e.g. 4/5" },
      { k: "feedback", label: "Feedback", type: "textarea" },
    ],
    notify: function (r) {
      return (
        "Interview scheduled: " + candName(r.candidateId) + " (" + r.type + ")"
      );
    },
  };

  RES.offers = {
    title: "Offers",
    singular: "Offer",
    idPrefix: "OFF",
    data: function () {
      return S.offers;
    },
    search: function (r) {
      return candName(r.candidateId) + " " + jobTitle(r.jobId);
    },
    filters: [
      {
        k: "status",
        label: "All statuses",
        opts: function () {
          return [
            "Draft",
            "Sent",
            "Accepted",
            "Rejected",
            "Expired",
            "Withdrawn",
          ].map(function (s) {
            return { v: s, l: s };
          });
        },
        match: function (r, v) {
          return r.status === v;
        },
      },
    ],
    columns: [
      {
        h: "Offer ID",
        num: true,
        c: function (r) {
          return r.id;
        },
      },
      {
        h: "Candidate",
        c: function (r) {
          return esc(candName(r.candidateId));
        },
      },
      {
        h: "Position",
        c: function (r) {
          return esc(jobTitle(r.jobId));
        },
      },
      {
        h: "Joining",
        num: true,
        c: function (r) {
          return niceDate(r.joining);
        },
      },
      {
        h: "Monthly",
        num: true,
        c: function (r) {
          return money(r.salary);
        },
      },
      {
        h: "Expiry",
        num: true,
        c: function (r) {
          return niceDate(r.expiry);
        },
      },
      {
        h: "Status",
        c: function (r) {
          return badge(r.status);
        },
      },
    ],
    actions: function (r) {
      var a = [{ k: "view", label: "View" }];
      if (r.status === "Draft")
        a.push({ k: "send", label: "Send", cls: "btn-outline" });
      if (r.status === "Sent") {
        a.push({ k: "accept", label: "Accept", cls: "btn-outline" });
        a.push({ k: "reject", label: "Reject", cls: "btn-danger-outline" });
      }
      return a;
    },
    onAct: function (k, r) {
      if (k === "send") {
        r.status = "Sent";
        notify("Offer sent to " + candName(r.candidateId));
      } else if (k === "accept") {
        r.status = "Accepted";
        var c = S.candidates.find(function (x) {
          return x.id === r.candidateId;
        });
        if (c) c.stage = "Offer Accepted";
        if (
          !S.onboarding.some(function (o) {
            return o.candidateId === r.candidateId;
          })
        ) {
          S.onboarding.unshift({
            id: nextId("ONB"),
            candidateId: r.candidateId,
            name: candName(r.candidateId),
            dept:
              (
                S.jobs.find(function (j) {
                  return j.id === r.jobId;
                }) || {}
              ).dept || "",
            joining: r.joining,
            done: ["Offer Letter"],
          });
        }
        notify(
          candName(r.candidateId) + " accepted the offer — onboarding started",
        );
      } else if (k === "reject") {
        r.status = "Rejected";
      }
      audit("Offer " + k, r.id);
      resFillBody("offers");
      toastX("Offer " + r.id + " → " + r.status);
    },
    detail: function (r) {
      return [
        ["Offer ID", r.id],
        ["Candidate", candName(r.candidateId)],
        ["Position", jobTitle(r.jobId)],
        [
          "Department",
          deptName(
            (
              S.jobs.find(function (j) {
                return j.id === r.jobId;
              }) || {}
            ).dept,
          ),
        ],
        ["Joining Date", niceDate(r.joining)],
        ["Monthly In-hand", money(r.salary)],
        ["Employment Type", r.empType],
        ["Reporting Manager", empName(r.manager)],
        ["Offer Date", niceDate(r.offerDate)],
        ["Expiry Date", niceDate(r.expiry)],
        ["Status", badge(r.status), "html"],
      ];
    },
    form: [
      {
        k: "candidateId",
        label: "Candidate",
        type: "select",
        req: true,
        opts: function () {
          return S.candidates.map(function (c) {
            return { v: c.id, l: c.name };
          });
        },
        half: true,
      },
      {
        k: "jobId",
        label: "Position",
        type: "select",
        req: true,
        opts: function () {
          return S.jobs.map(function (j) {
            return { v: j.id, l: j.title };
          });
        },
        half: true,
      },
      {
        k: "joining",
        label: "Joining date",
        type: "date",
        req: true,
        half: true,
      },
      {
        k: "salary",
        label: "Monthly in-hand (₹)",
        type: "number",
        min: 0,
        req: true,
        half: true,
      },
      {
        k: "empType",
        label: "Employment type",
        type: "select",
        opts: ["Full-time", "Part-time", "Contract"],
        def: "Full-time",
        half: true,
      },
      {
        k: "manager",
        label: "Reporting manager",
        type: "select",
        opts: empOpts,
        half: true,
      },
      {
        k: "offerDate",
        label: "Offer date",
        type: "date",
        def: new Date().toISOString().slice(0, 10),
        half: true,
      },
      { k: "expiry", label: "Expiry date", type: "date", half: true },
      {
        k: "status",
        label: "Status",
        type: "select",
        opts: ["Draft", "Sent", "Accepted", "Rejected", "Expired", "Withdrawn"],
        def: "Draft",
        half: true,
      },
    ],
  };

  RES.projects = {
    title: "Projects",
    singular: "Project",
    idPrefix: "PRJ",
    data: function () {
      return S.projects;
    },
    search: function (r) {
      return r.name + " " + r.client + " " + deptName(r.dept);
    },
    summary: function () {
      var p = S.projects;
      return [
        {
          k: "Active",
          v: p.filter(function (x) {
            return x.status === "Active";
          }).length,
        },
        {
          k: "Completed",
          v: p.filter(function (x) {
            return x.status === "Completed";
          }).length,
        },
        {
          k: "Planning",
          v: p.filter(function (x) {
            return x.status === "Planning";
          }).length,
        },
        {
          k: "On hold",
          v: p.filter(function (x) {
            return x.status === "On Hold";
          }).length,
        },
      ];
    },
    filters: [
      {
        k: "status",
        label: "All statuses",
        opts: function () {
          return [
            "Planning",
            "Not Started",
            "Active",
            "On Hold",
            "Completed",
            "Cancelled",
          ].map(function (s) {
            return { v: s, l: s };
          });
        },
        match: function (r, v) {
          return r.status === v;
        },
      },
      {
        k: "dept",
        label: "All departments",
        opts: deptOpts,
        match: function (r, v) {
          return r.dept === v;
        },
      },
    ],
    columns: [
      {
        h: "Project",
        c: function (r) {
          return (
            "<b>" +
            esc(r.name) +
            '</b><br><span style="color:var(--text-2);font-size:12px">' +
            esc(r.client) +
            "</span>"
          );
        },
      },
      {
        h: "Manager",
        c: function (r) {
          return esc(empName(r.manager));
        },
      },
      {
        h: "Priority",
        c: function (r) {
          return badge(
            r.priority === "High" || r.priority === "Critical"
              ? "Needs Improvement"
              : r.priority === "Medium"
                ? "In Progress"
                : "To Do",
          ).replace(/>[^<]*</, ">" + r.priority + "<");
        },
      },
      {
        h: "Timeline",
        num: true,
        c: function (r) {
          return niceDate(r.start) + " → " + niceDate(r.end);
        },
      },
      {
        h: "Team",
        num: true,
        c: function (r) {
          return r.members.length;
        },
      },
      {
        h: "Progress",
        c: function (r) {
          return bar(r.progress);
        },
      },
      {
        h: "Status",
        c: function (r) {
          return badge(r.status);
        },
      },
    ],
    actions: function () {
      return [
        { k: "view", label: "View" },
        { k: "edit", label: "Edit", cls: "btn-outline" },
      ];
    },
    detail: function (r) {
      return [
        ["Project ID", r.id],
        ["Name", r.name],
        ["Client", r.client],
        ["Department", deptName(r.dept)],
        ["Project Manager", empName(r.manager)],
        ["Start Date", niceDate(r.start)],
        ["End Date", niceDate(r.end)],
        ["Budget", r.budget],
        ["Priority", r.priority],
        ["Status", badge(r.status), "html"],
        ["Progress", bar(r.progress), "html"],
        [
          "Team Members",
          r.members
            .map(function (m) {
              return empName(m);
            })
            .join(", ") || "—",
        ],
        [
          "Tasks",
          String(
            S.tasks.filter(function (t) {
              return t.projectId === r.id;
            }).length,
          ),
        ],
        ["Description", r.description || "—"],
      ];
    },
    form: [
      { k: "name", label: "Project name", req: true, half: true },
      { k: "client", label: "Client", half: true, def: "Internal" },
      {
        k: "dept",
        label: "Department",
        type: "select",
        req: true,
        opts: deptOpts,
        half: true,
      },
      {
        k: "manager",
        label: "Project manager",
        type: "select",
        req: true,
        opts: empOpts,
        half: true,
      },
      { k: "start", label: "Start date", type: "date", req: true, half: true },
      {
        k: "end",
        label: "End date",
        type: "date",
        req: true,
        half: true,
        validate: function (v, a) {
          if (a.start && v && v < a.start)
            return "End date cannot be before start date.";
        },
      },
      { k: "budget", label: "Budget", half: true, def: "₹0" },
      {
        k: "priority",
        label: "Priority",
        type: "select",
        opts: ["Low", "Medium", "High", "Critical"],
        def: "Medium",
        half: true,
      },
      {
        k: "status",
        label: "Status",
        type: "select",
        opts: [
          "Planning",
          "Not Started",
          "Active",
          "On Hold",
          "Completed",
          "Cancelled",
        ],
        def: "Planning",
        half: true,
      },
      {
        k: "progress",
        label: "Progress %",
        type: "number",
        min: 0,
        def: 0,
        half: true,
      },
      { k: "description", label: "Description", type: "textarea" },
    ],
    onNew: function (v) {
      v.members = [];
      v.progress = Number(v.progress) || 0;
      return v;
    },
    onEdit: function (r) {
      r.progress = Number(r.progress) || 0;
    },
  };

  var TASK_ST = [
    "To Do",
    "In Progress",
    "Review",
    "Blocked",
    "Completed",
    "Overdue",
  ];
  RES.tasks = {
    title: "Tasks",
    singular: "Task",
    idPrefix: "TSK",
    data: function () {
      return S.tasks;
    },
    search: function (r) {
      return r.title + " " + projName(r.projectId) + " " + empName(r.assignee);
    },
    summary: function () {
      var t = S.tasks;
      function n(s) {
        return t.filter(function (x) {
          return x.status === s;
        }).length;
      }
      return [
        { k: "To do", v: n("To Do") },
        { k: "In progress", v: n("In Progress") },
        { k: "Review", v: n("Review") },
        { k: "Completed", v: n("Completed") },
        { k: "Overdue", v: n("Overdue") },
      ];
    },
    filters: [
      {
        k: "status",
        label: "All statuses",
        opts: function () {
          return TASK_ST.map(function (s) {
            return { v: s, l: s };
          });
        },
        match: function (r, v) {
          return r.status === v;
        },
      },
      {
        k: "projectId",
        label: "All projects",
        opts: function () {
          return S.projects.map(function (p) {
            return { v: p.id, l: p.name };
          });
        },
        match: function (r, v) {
          return r.projectId === v;
        },
      },
      {
        k: "assignee",
        label: "All assignees",
        opts: empOpts,
        match: function (r, v) {
          return r.assignee === v;
        },
      },
    ],
    columns: [
      {
        h: "Task",
        c: function (r) {
          return "<b>" + esc(r.title) + "</b>";
        },
      },
      {
        h: "Project",
        c: function (r) {
          return esc(projName(r.projectId));
        },
      },
      {
        h: "Assignee",
        c: function (r) {
          return esc(empName(r.assignee));
        },
      },
      {
        h: "Priority",
        c: function (r) {
          return esc(r.priority);
        },
      },
      {
        h: "Due",
        num: true,
        c: function (r) {
          return niceDate(r.due);
        },
      },
      {
        h: "Progress",
        c: function (r) {
          return bar(r.progress);
        },
      },
      {
        h: "Status",
        c: function (r) {
          return badge(r.status);
        },
      },
    ],
    actions: function () {
      return [
        { k: "view", label: "View" },
        { k: "edit", label: "Edit", cls: "btn-outline" },
      ];
    },
    detail: function (r) {
      return [
        ["Task ID", r.id],
        ["Title", r.title],
        ["Project", projName(r.projectId)],
        ["Assigned To", empName(r.assignee)],
        ["Assigned By", empName(r.assignedBy)],
        ["Priority", r.priority],
        ["Start Date", niceDate(r.start)],
        ["Due Date", niceDate(r.due)],
        ["Status", badge(r.status), "html"],
        ["Progress", bar(r.progress), "html"],
        ["Estimated Hours", r.est + "h"],
        ["Actual Hours", r.actual + "h"],
      ];
    },
    form: [
      { k: "title", label: "Task title", req: true },
      {
        k: "projectId",
        label: "Project",
        type: "select",
        req: true,
        opts: function () {
          return S.projects.map(function (p) {
            return { v: p.id, l: p.name };
          });
        },
        half: true,
      },
      {
        k: "assignee",
        label: "Assign to",
        type: "select",
        req: true,
        opts: empOpts,
        half: true,
      },
      {
        k: "assignedBy",
        label: "Assigned by",
        type: "select",
        opts: empOpts,
        def: "CHS-0001",
        half: true,
      },
      {
        k: "priority",
        label: "Priority",
        type: "select",
        opts: ["Low", "Medium", "High", "Critical"],
        def: "Medium",
        half: true,
      },
      { k: "start", label: "Start date", type: "date", half: true },
      { k: "due", label: "Due date", type: "date", req: true, half: true },
      {
        k: "status",
        label: "Status",
        type: "select",
        opts: TASK_ST,
        def: "To Do",
        half: true,
      },
      {
        k: "progress",
        label: "Progress %",
        type: "number",
        min: 0,
        def: 0,
        half: true,
      },
      {
        k: "est",
        label: "Estimated hours",
        type: "number",
        min: 0,
        def: 0,
        half: true,
      },
      {
        k: "actual",
        label: "Actual hours",
        type: "number",
        min: 0,
        def: 0,
        half: true,
      },
    ],
    onNew: function (v) {
      v.progress = Number(v.progress) || 0;
      v.est = Number(v.est) || 0;
      v.actual = Number(v.actual) || 0;
      return v;
    },
    notify: function (r) {
      return "Task assigned to " + empName(r.assignee) + ": " + r.title;
    },
  };

  RES.targets = {
    title: "Targets",
    singular: "Target",
    idPrefix: "TGT",
    data: function () {
      return S.targets;
    },
    search: function (r) {
      return r.name + " " + empName(r.employeeId) + " " + r.kpi;
    },
    filters: [
      {
        k: "status",
        label: "All statuses",
        opts: function () {
          return [
            "Not Started",
            "In Progress",
            "Achieved",
            "Partially Achieved",
            "Missed",
            "Overdue",
          ].map(function (s) {
            return { v: s, l: s };
          });
        },
        match: function (r, v) {
          return r.status === v;
        },
      },
      {
        k: "dept",
        label: "All departments",
        opts: deptOpts,
        match: function (r, v) {
          return r.dept === v;
        },
      },
    ],
    columns: [
      {
        h: "Employee",
        c: function (r) {
          return empCell(r.employeeId);
        },
      },
      {
        h: "Target",
        c: function (r) {
          return (
            "<b>" +
            esc(r.name) +
            '</b><br><span style="color:var(--text-2);font-size:12px">' +
            esc(r.kpi) +
            "</span>"
          );
        },
      },
      {
        h: "Progress",
        c: function (r) {
          return bar(r.target ? (r.achieved / r.target) * 100 : 0);
        },
      },
      {
        h: "Achieved",
        num: true,
        c: function (r) {
          return r.achieved + " / " + r.target + " " + esc(r.unit);
        },
      },
      {
        h: "Weightage",
        num: true,
        c: function (r) {
          return r.weightage + "%";
        },
      },
      {
        h: "Status",
        c: function (r) {
          return badge(r.status);
        },
      },
    ],
    actions: function () {
      return [
        { k: "view", label: "View" },
        { k: "edit", label: "Edit", cls: "btn-outline" },
      ];
    },
    detail: function (r) {
      var pct = r.target ? Math.round((r.achieved / r.target) * 100) : 0;
      return [
        ["Target ID", r.id],
        ["Employee", empName(r.employeeId)],
        ["Department", deptName(r.dept)],
        ["Target Name", r.name],
        ["KPI", r.kpi],
        ["Target Value", r.target + " " + r.unit],
        ["Achieved Value", r.achieved + " " + r.unit],
        ["Achievement %", pct + "%"],
        ["Weightage", r.weightage + "%"],
        ["Start", niceDate(r.start)],
        ["End", niceDate(r.end)],
        ["Status", badge(r.status), "html"],
      ];
    },
    form: [
      {
        k: "employeeId",
        label: "Employee",
        type: "select",
        req: true,
        opts: empOpts,
        half: true,
      },
      {
        k: "dept",
        label: "Department",
        type: "select",
        opts: deptOpts,
        half: true,
      },
      { k: "name", label: "Target name", req: true },
      { k: "kpi", label: "KPI", half: true },
      { k: "unit", label: "Unit", half: true, def: "units" },
      {
        k: "target",
        label: "Target value",
        type: "number",
        min: 0,
        req: true,
        half: true,
      },
      {
        k: "achieved",
        label: "Achieved value",
        type: "number",
        min: 0,
        def: 0,
        half: true,
      },
      {
        k: "weightage",
        label: "Weightage %",
        type: "number",
        min: 0,
        def: 10,
        half: true,
      },
      {
        k: "status",
        label: "Status",
        type: "select",
        opts: [
          "Not Started",
          "In Progress",
          "Achieved",
          "Partially Achieved",
          "Missed",
          "Overdue",
        ],
        def: "In Progress",
        half: true,
      },
      { k: "start", label: "Start date", type: "date", half: true },
      { k: "end", label: "End date", type: "date", half: true },
    ],
    onNew: function (v) {
      v.target = Number(v.target) || 0;
      v.achieved = Number(v.achieved) || 0;
      v.weightage = Number(v.weightage) || 0;
      return v;
    },
  };

  RES.reviews = {
    title: "Performance Reviews",
    singular: "Review",
    idPrefix: "REV",
    data: function () {
      return S.reviews;
    },
    search: function (r) {
      return empName(r.employeeId) + " " + r.period + " " + r.rating;
    },
    filters: [
      {
        k: "cycle",
        label: "All cycles",
        opts: function () {
          return ["Monthly", "Quarterly", "Half-Yearly", "Annual"].map(
            function (s) {
              return { v: s, l: s };
            },
          );
        },
        match: function (r, v) {
          return r.cycle === v;
        },
      },
      {
        k: "rating",
        label: "All ratings",
        opts: function () {
          return [
            "Outstanding",
            "Excellent",
            "Good",
            "Needs Improvement",
            "Unsatisfactory",
          ].map(function (s) {
            return { v: s, l: s };
          });
        },
        match: function (r, v) {
          return r.rating === v;
        },
      },
    ],
    columns: [
      {
        h: "Employee",
        c: function (r) {
          return empCell(r.employeeId);
        },
      },
      {
        h: "Cycle",
        c: function (r) {
          return esc(r.cycle);
        },
      },
      {
        h: "Period",
        c: function (r) {
          return esc(r.period);
        },
      },
      {
        h: "Score",
        num: true,
        c: function (r) {
          return r.score;
        },
      },
      {
        h: "Rating",
        c: function (r) {
          return badge(r.rating);
        },
      },
      {
        h: "Reviewed by",
        c: function (r) {
          return esc(empName(r.manager));
        },
      },
    ],
    actions: function () {
      return [
        { k: "view", label: "View" },
        { k: "edit", label: "Edit", cls: "btn-outline" },
      ];
    },
    detail: function (r) {
      var hist = S.reviews.filter(function (x) {
        return x.employeeId === r.employeeId;
      });
      return [
        ["Review ID", r.id],
        ["Employee", empName(r.employeeId)],
        ["Cycle", r.cycle],
        ["Review Period", r.period],
        ["Performance Score", r.score + " / 100"],
        ["Overall Rating", badge(r.rating), "html"],
        ["Reviewed By", empName(r.manager)],
        ["Date", niceDate(r.date)],
        ["Manager Comments", r.comments || "—"],
        ["##", "Performance History"],
        [
          "Previous reviews",
          hist
            .map(function (x) {
              return x.period + ": " + x.rating + " (" + x.score + ")";
            })
            .join("<br>"),
          "html",
        ],
      ];
    },
    form: [
      {
        k: "employeeId",
        label: "Employee",
        type: "select",
        req: true,
        opts: empOpts,
        half: true,
      },
      {
        k: "cycle",
        label: "Review cycle",
        type: "select",
        opts: ["Monthly", "Quarterly", "Half-Yearly", "Annual"],
        def: "Quarterly",
        half: true,
      },
      {
        k: "period",
        label: "Period",
        req: true,
        half: true,
        ph: "e.g. Q3 2026",
      },
      {
        k: "score",
        label: "Score (0-100)",
        type: "number",
        min: 0,
        req: true,
        half: true,
      },
      {
        k: "rating",
        label: "Overall rating",
        type: "select",
        req: true,
        opts: [
          "Outstanding",
          "Excellent",
          "Good",
          "Needs Improvement",
          "Unsatisfactory",
        ],
        half: true,
      },
      {
        k: "manager",
        label: "Reviewed by",
        type: "select",
        opts: empOpts,
        half: true,
      },
      {
        k: "date",
        label: "Review date",
        type: "date",
        def: new Date().toISOString().slice(0, 10),
        half: true,
      },
      { k: "comments", label: "Manager comments", type: "textarea" },
    ],
    onNew: function (v) {
      v.score = Number(v.score) || 0;
      return v;
    },
    notify: function (r) {
      return (
        "Performance review completed: " +
        empName(r.employeeId) +
        " (" +
        r.rating +
        ")"
      );
    },
  };

  RES.training = {
    title: "Training",
    singular: "Training",
    idPrefix: "TRN",
    data: function () {
      return S.training;
    },
    search: function (r) {
      return r.name + " " + empName(r.employeeId);
    },
    columns: [
      {
        h: "Training",
        c: function (r) {
          return "<b>" + esc(r.name) + "</b>";
        },
      },
      {
        h: "Employee",
        c: function (r) {
          return esc(empName(r.employeeId));
        },
      },
      {
        h: "Trainer",
        c: function (r) {
          return esc(r.trainer);
        },
      },
      {
        h: "Dates",
        num: true,
        c: function (r) {
          return niceDate(r.start) + " → " + niceDate(r.end);
        },
      },
      {
        h: "Progress",
        c: function (r) {
          return bar(r.completion);
        },
      },
      {
        h: "Status",
        c: function (r) {
          return badge(r.status);
        },
      },
    ],
    actions: function () {
      return [{ k: "edit", label: "Edit", cls: "btn-outline" }];
    },
    form: [
      { k: "name", label: "Training name", req: true },
      {
        k: "employeeId",
        label: "Employee",
        type: "select",
        req: true,
        opts: empOpts,
        half: true,
      },
      { k: "trainer", label: "Trainer", half: true },
      {
        k: "dept",
        label: "Department",
        type: "select",
        opts: deptOpts,
        half: true,
      },
      { k: "start", label: "Start date", type: "date", half: true },
      { k: "end", label: "End date", type: "date", half: true },
      {
        k: "status",
        label: "Status",
        type: "select",
        opts: ["Not Started", "In Progress", "Completed"],
        def: "Not Started",
        half: true,
      },
      {
        k: "completion",
        label: "Completion %",
        type: "number",
        min: 0,
        def: 0,
        half: true,
      },
      { k: "certification", label: "Certification", half: true, def: "—" },
    ],
    onNew: function (v) {
      v.completion = Number(v.completion) || 0;
      return v;
    },
  };

  RES.promotions = {
    title: "Promotions",
    singular: "Promotion",
    idPrefix: "PMO",
    data: function () {
      return S.promotions;
    },
    search: function (r) {
      return empName(r.employeeId) + " " + r.to;
    },
    columns: [
      {
        h: "Employee",
        c: function (r) {
          return empCell(r.employeeId);
        },
      },
      {
        h: "From",
        c: function (r) {
          return esc(r.from);
        },
      },
      {
        h: "To",
        c: function (r) {
          return esc(r.to);
        },
      },
      {
        h: "Effective",
        num: true,
        c: function (r) {
          return niceDate(r.effective);
        },
      },
      {
        h: "Salary",
        num: true,
        c: function (r) {
          return money(r.prevSalary) + " → " + money(r.newSalary);
        },
      },
      {
        h: "Approved by",
        c: function (r) {
          return esc(empName(r.approvedBy));
        },
      },
    ],
    form: [
      {
        k: "employeeId",
        label: "Employee",
        type: "select",
        req: true,
        opts: empOpts,
        half: true,
      },
      {
        k: "effective",
        label: "Effective date",
        type: "date",
        req: true,
        half: true,
      },
      { k: "from", label: "Current designation", half: true },
      { k: "to", label: "New designation", req: true, half: true },
      {
        k: "prevSalary",
        label: "Previous salary (₹)",
        type: "number",
        min: 0,
        half: true,
      },
      {
        k: "newSalary",
        label: "New salary (₹)",
        type: "number",
        min: 0,
        half: true,
      },
      { k: "reason", label: "Reason", type: "textarea" },
      {
        k: "approvedBy",
        label: "Approved by",
        type: "select",
        opts: empOpts,
        half: true,
      },
    ],
  };

  RES.transfers = {
    title: "Transfers",
    singular: "Transfer",
    idPrefix: "TRF",
    data: function () {
      return S.transfers;
    },
    search: function (r) {
      return empName(r.employeeId);
    },
    columns: [
      {
        h: "Employee",
        c: function (r) {
          return empCell(r.employeeId);
        },
      },
      {
        h: "From dept",
        c: function (r) {
          return esc(deptName(r.fromDept));
        },
      },
      {
        h: "To dept",
        c: function (r) {
          return esc(deptName(r.toDept));
        },
      },
      {
        h: "Location",
        c: function (r) {
          return esc(r.fromLoc + " → " + r.toLoc);
        },
      },
      {
        h: "Effective",
        num: true,
        c: function (r) {
          return niceDate(r.effective);
        },
      },
      {
        h: "Approved by",
        c: function (r) {
          return esc(empName(r.approvedBy));
        },
      },
    ],
    form: [
      {
        k: "employeeId",
        label: "Employee",
        type: "select",
        req: true,
        opts: empOpts,
        half: true,
      },
      {
        k: "effective",
        label: "Effective date",
        type: "date",
        req: true,
        half: true,
      },
      {
        k: "fromDept",
        label: "From department",
        type: "select",
        opts: deptOpts,
        half: true,
      },
      {
        k: "toDept",
        label: "To department",
        type: "select",
        req: true,
        opts: deptOpts,
        half: true,
      },
      { k: "fromLoc", label: "Current location", half: true },
      { k: "toLoc", label: "New location", half: true },
      { k: "reason", label: "Reason", type: "textarea" },
      {
        k: "approvedBy",
        label: "Approved by",
        type: "select",
        opts: empOpts,
        half: true,
      },
    ],
  };

  RES.exits = {
    title: "Exits",
    singular: "Exit",
    idPrefix: "EXT",
    data: function () {
      return S.exits;
    },
    search: function (r) {
      return empName(r.employeeId) + " " + r.reason;
    },
    columns: [
      {
        h: "Employee",
        c: function (r) {
          return empCell(r.employeeId);
        },
      },
      {
        h: "Resigned",
        num: true,
        c: function (r) {
          return niceDate(r.resignationDate);
        },
      },
      {
        h: "Last day",
        num: true,
        c: function (r) {
          return niceDate(r.lastDay);
        },
      },
      {
        h: "Notice",
        c: function (r) {
          return esc(r.noticePeriod);
        },
      },
      {
        h: "Clearance",
        c: function (r) {
          return badge(r.clearance === "Pending" ? "Pending" : "Approved");
        },
      },
      {
        h: "Status",
        c: function (r) {
          return badge(r.status);
        },
      },
    ],
    actions: function () {
      return [
        { k: "view", label: "View" },
        { k: "edit", label: "Edit", cls: "btn-outline" },
      ];
    },
    detail: function (r) {
      return [
        ["Exit ID", r.id],
        ["Employee", empName(r.employeeId)],
        ["Resignation Date", niceDate(r.resignationDate)],
        ["Last Working Day", niceDate(r.lastDay)],
        ["Reason", r.reason],
        ["Notice Period", r.noticePeriod],
        ["Asset Return", r.assetReturn],
        ["Clearance", r.clearance],
        ["Final Settlement", r.settlement],
        ["Exit Status", badge(r.status), "html"],
      ];
    },
    form: [
      {
        k: "employeeId",
        label: "Employee",
        type: "select",
        req: true,
        opts: empOpts,
        half: true,
      },
      { k: "reason", label: "Reason", half: true },
      {
        k: "resignationDate",
        label: "Resignation date",
        type: "date",
        req: true,
        half: true,
      },
      {
        k: "lastDay",
        label: "Last working day",
        type: "date",
        req: true,
        half: true,
      },
      { k: "noticePeriod", label: "Notice period", half: true, def: "60 days" },
      {
        k: "status",
        label: "Status",
        type: "select",
        opts: [
          "Resignation Submitted",
          "Notice Period",
          "Clearance Pending",
          "Final Settlement",
          "Completed",
        ],
        def: "Resignation Submitted",
        half: true,
      },
      {
        k: "assetReturn",
        label: "Asset return",
        type: "select",
        opts: ["Pending", "Completed"],
        def: "Pending",
        half: true,
      },
      {
        k: "clearance",
        label: "Clearance",
        type: "select",
        opts: ["Pending", "Completed"],
        def: "Pending",
        half: true,
      },
      {
        k: "settlement",
        label: "Final settlement",
        type: "select",
        opts: ["Pending", "Processed"],
        def: "Pending",
        half: true,
      },
    ],
  };

  RES.documents = {
    title: "Documents",
    singular: "Document",
    idPrefix: "DOC",
    data: function () {
      if (!S.documents)
        S.documents = [
          {
            id: "DOC-01",
            name: "Offer Letter — Arjun Nanda",
            type: "Offer Letter",
            owner: "CAN-2006",
            uploaded: "2026-09-01",
            status: "Signed",
          },
          {
            id: "DOC-02",
            name: "Resume — Ishaan Malhotra",
            type: "Resume/CV",
            owner: "CAN-2001",
            uploaded: "2026-08-18",
            status: "Verified",
          },
          {
            id: "DOC-03",
            name: "ID Proof — Priya Nair",
            type: "ID Document",
            owner: "CHS-0008",
            uploaded: "2023-07-03",
            status: "Verified",
          },
          {
            id: "DOC-04",
            name: "Experience Letter — Rahul Mehta",
            type: "Experience Letter",
            owner: "CHS-0005",
            uploaded: "2023-03-10",
            status: "Verified",
          },
          {
            id: "DOC-05",
            name: "Degree Certificate — Aviral Gupta",
            type: "Qualification",
            owner: "CHS-0009",
            uploaded: "2024-11-01",
            status: "Pending",
          },
        ];
      return S.documents;
    },
    search: function (r) {
      return r.name + " " + r.type;
    },
    filters: [
      {
        k: "type",
        label: "All types",
        opts: function () {
          return [
            "Resume/CV",
            "Cover Letter",
            "Certificate",
            "ID Document",
            "Qualification",
            "Experience Letter",
            "Offer Letter",
            "Joining Document",
          ].map(function (s) {
            return { v: s, l: s };
          });
        },
        match: function (r, v) {
          return r.type === v;
        },
      },
    ],
    columns: [
      {
        h: "Document",
        c: function (r) {
          return "<b>" + esc(r.name) + "</b>";
        },
      },
      {
        h: "Type",
        c: function (r) {
          return esc(r.type);
        },
      },
      {
        h: "Owner",
        c: function (r) {
          var n = empName(r.owner);
          return esc(n === "—" ? candName(r.owner) : n);
        },
      },
      {
        h: "Uploaded",
        num: true,
        c: function (r) {
          return niceDate(r.uploaded);
        },
      },
      {
        h: "Status",
        c: function (r) {
          return badge(
            r.status === "Signed" || r.status === "Verified"
              ? "Approved"
              : "Pending",
          );
        },
      },
    ],
    actions: function () {
      return [
        { k: "preview", label: "Preview" },
        { k: "download", label: "Download", cls: "btn-outline" },
      ];
    },
    onAct: function (k, r) {
      toastX(
        (k === "preview" ? "Preview" : "Download") +
          ": " +
          r.name +
          " — enabled once the backend is connected",
      );
    },
    form: [
      { k: "name", label: "Document name", req: true },
      {
        k: "type",
        label: "Type",
        type: "select",
        req: true,
        opts: [
          "Resume/CV",
          "Cover Letter",
          "Certificate",
          "ID Document",
          "Qualification",
          "Experience Letter",
          "Offer Letter",
          "Joining Document",
        ],
      },
      { k: "owner", label: "Owner (Employee/Candidate ID)", half: true },
      {
        k: "uploaded",
        label: "Upload date",
        type: "date",
        def: new Date().toISOString().slice(0, 10),
        half: true,
      },
      {
        k: "status",
        label: "Status",
        type: "select",
        opts: ["Pending", "Verified", "Signed"],
        def: "Pending",
        half: true,
      },
    ],
  };

  /* ============================================================
     Special (hand-built) views
     ============================================================ */
  function specialBtn(k, label, cls) {
    return (
      '<button class="btn ' +
      (cls || "btn-outline") +
      ' btn-sm" data-hrx-special="' +
      k +
      '">' +
      esc(label) +
      "</button>"
    );
  }

  // Onboarding — checklist with progress
  function renderOnboarding() {
    if (!S.onboarding.length)
      return '<div class="empty">No onboarding in progress. Accept an offer to start onboarding.</div>';
    return S.onboarding
      .map(function (o) {
        var pct = Math.round((o.done.length / S.onboardingItems.length) * 100);
        var items = S.onboardingItems
          .map(function (it) {
            var done = o.done.indexOf(it) >= 0;
            return (
              '<li><input type="checkbox" data-hrx-special="onb:' +
              o.id +
              ":" +
              esc(it) +
              '"' +
              (done ? " checked" : "") +
              '><span class="' +
              (done ? "done" : "") +
              '">' +
              esc(it) +
              "</span></li>"
            );
          })
          .join("");
        return (
          '<div style="margin-bottom:20px"><div class="card-head"><div><h2 style="font-size:15px">' +
          esc(o.name) +
          " · " +
          deptName(o.dept) +
          '</h2><div class="sub">Joining ' +
          niceDate(o.joining) +
          " · " +
          badge(
            pct === 100
              ? "Completed"
              : pct === 0
                ? "Not Started"
                : "In Progress",
          ) +
          '</div></div><div style="min-width:160px">' +
          bar(pct) +
          '</div></div><ul class="hrx-checklist">' +
          items +
          "</ul></div>"
        );
      })
      .join("");
  }

  // Attendance register (reuses the Leave feature's attendance data if present)
  function renderAttendanceRegister() {
    var att =
      typeof employeeAttendanceData !== "undefined"
        ? employeeAttendanceData
        : {};
    var st = stateFor("attreg");
    var emp = st.filters.emp || "CHS-0001";
    var now = new Date(),
      y = now.getFullYear(),
      m = now.getMonth(),
      days = new Date(y, m + 1, 0).getDate();
    var rowsHtml = "",
      present = 0,
      absent = 0,
      leave = 0,
      half = 0,
      late = 0,
      ot = 0,
      working = 0,
      anyRec = false;
    for (var d = 1; d <= days; d++) {
      var iso =
        y +
        "-" +
        String(m + 1).padStart(2, "0") +
        "-" +
        String(d).padStart(2, "0");
      var dt = new Date(y, m, d),
        wknd = dt.getDay() === 0 || dt.getDay() === 6;
      var hol =
        typeof companyHolidays !== "undefined" &&
        companyHolidays.filter(function (h) {
          return h.date === iso;
        })[0];
      var rec = att[iso];
      var status = wknd
        ? "Weekend"
        : hol
          ? "Holiday"
          : rec
            ? rec.status
            : iso > new Date().toISOString().slice(0, 10)
              ? "—"
              : "No Data";
      if (!wknd && !hol) working++;
      if (rec) {
        anyRec = true;
        if (rec.status === "present") present++;
        else if (rec.status === "wfh") present++;
        else if (rec.status === "absent") absent++;
        else if (rec.status === "halfday") half++;
        else if (rec.status === "leave") leave++;
        if (rec.lateBy) late++;
        if (rec.overtime) ot++;
      }
      var label =
        {
          present: "Present",
          wfh: "Work From Home",
          absent: "Absent",
          halfday: "Half Day",
          leave: (rec && rec.leaveType) || "Leave",
        }[rec && rec.status] || status;
      rowsHtml +=
        '<tr><td class="num">' +
        niceDate(iso) +
        "</td><td>" +
        badge(label === "present" ? "Active" : label) +
        '</td><td class="num">' +
        ((rec && rec.checkIn) || "--") +
        '</td><td class="num">' +
        ((rec && rec.checkOut) || "--") +
        '</td><td class="num">' +
        ((rec && rec.workingHours) || "--") +
        '</td><td class="num">' +
        ((rec && rec.overtime) || "--") +
        "</td></tr>";
    }
    var head =
      '<div class=\"hrx-toolbar\"><select data-hrx-special=\"attemp\"><option value=\"' +
      ((window.__hrUser && window.__hrUser.employeeId) || "") +
      '\">Attendance for: ' +
      ((typeof window !== "undefined" &&
        window.__hrUser &&
        window.__hrUser.name) ||
        (emp && empById(emp) && empById(emp).name) ||
        "Employee") +
      ' (self)</option></select><span class=\"hrx-spacer\"></span></div>' +
      '<div class="hrx-statrow"><div class="hrx-statchip"><span class="k">Working days</span><span class="v">' +
      working +
      "</span></div>" +
      '<div class="hrx-statchip"><span class="k">Present</span><span class="v">' +
      present +
      "</span></div>" +
      '<div class="hrx-statchip"><span class="k">Absent</span><span class="v">' +
      absent +
      "</span></div>" +
      '<div class="hrx-statchip"><span class="k">Leave</span><span class="v">' +
      leave +
      "</span></div>" +
      '<div class="hrx-statchip"><span class="k">Half days</span><span class="v">' +
      half +
      "</span></div>" +
      '<div class="hrx-statchip"><span class="k">Late / OT</span><span class="v">' +
      late +
      " / " +
      ot +
      "</span></div></div>";
    if (!anyRec)
      return (
        head +
        '<div class="hrx-hint" style="margin-bottom:10px">No attendance data available.</div>'
      );
    return (
      head +
      '<div class="hrx-hint" style="margin-bottom:10px">Attendance is read-only for employees. The interactive month view with leave application lives under the <b>Leave</b> section.</div>' +
      '<div class="table-scroll"><table><thead><tr><th>Date</th><th>Status</th><th>Check-in</th><th>Check-out</th><th>Working hours</th><th>Overtime</th></tr></thead><tbody>' +
      rowsHtml +
      "</tbody></table></div>"
    );
  }

  // Payroll processing
  function renderPayrollProcess() {
    return '<div class="hrx-hint">Loading salary records…</div>';
  }
  function renderPayslips() {
    return '<div class="hrx-hint">Loading salary records…</div>';
  }
  function renderSalaryStructure() {
    return '<div class="hrx-hint">Loading salary records…</div>';
  }
  function renderPayrollHistory() {
    return '<div class="hrx-hint">Loading salary records…</div>';
  }

  // Work tracking (per-employee overview)
  function renderWork() {
    var st = stateFor("work");
    var pick = st.filters.emp || "";
    var opts =
      '<option value="">All employees</option>' +
      S.employees
        .map(function (e) {
          return (
            '<option value="' +
            e.id +
            '"' +
            (pick === e.id ? " selected" : "") +
            ">" +
            esc(e.name) +
            "</option>"
          );
        })
        .join("");
    var emps = pick
      ? S.employees.filter(function (e) {
          return e.id === pick;
        })
      : S.employees;
    var rows = emps
      .map(function (e) {
        var pr = S.projects.filter(function (p) {
          return p.members.indexOf(e.id) >= 0 || p.manager === e.id;
        });
        var ts = S.tasks.filter(function (t) {
          return t.assignee === e.id;
        });
        var done = ts.filter(function (t) {
            return t.status === "Completed";
          }).length,
          over = ts.filter(function (t) {
            return t.status === "Overdue";
          }).length,
          pend = ts.length - done;
        var tg = S.targets.filter(function (t) {
          return t.employeeId === e.id;
        });
        var ach = tg.length
          ? Math.round(
              tg.reduce(function (a, t) {
                return (
                  a +
                  (t.target ? Math.min(100, (t.achieved / t.target) * 100) : 0)
                );
              }, 0) / tg.length,
            )
          : 0;
        if (!ts.length && !pr.length && !tg.length) return "";
        return (
          "<tr><td>" +
          empCell(e.id) +
          '</td><td class="num">' +
          pr.length +
          '</td><td class="num">' +
          ts.length +
          '</td><td class="num">' +
          done +
          '</td><td class="num">' +
          pend +
          '</td><td class="num" style="color:' +
          (over ? "var(--red)" : "var(--text-2)") +
          '">' +
          over +
          "</td><td>" +
          bar(ach) +
          "</td></tr>"
        );
      })
      .filter(Boolean)
      .join("");
    return (
      '<div class="hrx-toolbar"><select data-hrx-special="workemp">' +
      opts +
      '</select><span class="hrx-spacer"></span></div>' +
      '<div class="table-scroll"><table><thead><tr><th>Employee</th><th>Projects</th><th>Tasks</th><th>Completed</th><th>Pending</th><th>Overdue</th><th>Target achievement</th></tr></thead><tbody>' +
      (rows ||
        '<tr><td colspan="7"><div class="empty">No workload data</div></td></tr>') +
      "</tbody></table></div>"
    );
  }

  // Reports
  var REPORTS = [
    ["Employee Report", "Headcount, departments, status"],
    ["Recruitment Report", "Jobs, applicants, funnel"],
    ["Hiring Report", "Offers sent vs accepted"],
    ["Attendance Report", "Present, absent, leave by month"],
    ["Leave Report", "Balances and requests"],
    ["Payroll Report", "Gross, deductions, net"],
    ["Performance Report", "Ratings and scores"],
    ["Project Report", "Status and progress"],
    ["Task Report", "Workload and overdue"],
    ["Target Report", "KPI achievement"],
  ];
  function renderReports() {
    return (
      '<div class="hrx-hint" style="margin-bottom:14px">Click a report to generate a summary from live data. Date filters and PDF/Excel export connect when a backend is added.</div>' +
      '<div class="hrx-reportgrid">' +
      REPORTS.map(function (r) {
        return (
          '<div class="hrx-reportcard" data-hrx-special="report:' +
          esc(r[0]) +
          '"><div class="ic">📊</div><b>' +
          esc(r[0]) +
          "</b><span>" +
          esc(r[1]) +
          "</span></div>"
        );
      }).join("") +
      "</div>"
    );
  }
  function showReport(name) {
    var lines = [];
    if (name === "Employee Report") {
      S.departments.forEach(function (d) {
        lines.push([
          d.name,
          S.employees.filter(function (e) {
            return e.dept === d.id;
          }).length + " employees",
        ]);
      });
      lines.push(["Total", S.employees.length + " employees"]);
    } else if (name === "Recruitment Report") {
      lines.push([
        "Open jobs",
        S.jobs.filter(function (j) {
          return j.status === "Open" || j.status === "Published";
        }).length,
      ]);
      lines.push(["Total applicants", S.candidates.length]);
      lines.push([
        "Shortlisted",
        S.candidates.filter(function (c) {
          return c.stage === "Shortlisted";
        }).length,
      ]);
      lines.push([
        "Selected",
        S.candidates.filter(function (c) {
          return c.stage === "Selected";
        }).length,
      ]);
    } else if (name === "Hiring Report") {
      lines.push([
        "Offers sent",
        S.offers.filter(function (o) {
          return o.status !== "Draft";
        }).length,
      ]);
      lines.push([
        "Accepted",
        S.offers.filter(function (o) {
          return o.status === "Accepted";
        }).length,
      ]);
      lines.push(["Onboarding", S.onboarding.length]);
    } else if (name === "Payroll Report") {
      var run = currentRun();
      lines.push(["Period", run.period]);
      lines.push([
        "Gross",
        money(
          run.rows.reduce(function (a, r) {
            return a + r.gross;
          }, 0),
        ),
      ]);
      lines.push([
        "Deductions",
        money(
          run.rows.reduce(function (a, r) {
            return a + r.ded;
          }, 0),
        ),
      ]);
      lines.push([
        "Net",
        money(
          run.rows.reduce(function (a, r) {
            return a + r.net;
          }, 0),
        ),
      ]);
    } else if (name === "Performance Report") {
      ["Outstanding", "Excellent", "Good", "Needs Improvement"].forEach(
        function (rt) {
          lines.push([
            rt,
            S.reviews.filter(function (x) {
              return x.rating === rt;
            }).length + " reviews",
          ]);
        },
      );
    } else if (name === "Project Report") {
      ["Active", "Completed", "Planning", "On Hold"].forEach(function (s) {
        lines.push([
          s,
          S.projects.filter(function (p) {
            return p.status === s;
          }).length,
        ]);
      });
    } else if (name === "Task Report") {
      TASK_ST.forEach(function (s) {
        lines.push([
          s,
          S.tasks.filter(function (t) {
            return t.status === s;
          }).length,
        ]);
      });
    } else if (name === "Target Report") {
      S.targets.forEach(function (t) {
        lines.push([
          empName(t.employeeId) + " — " + t.name,
          Math.round((t.achieved / t.target) * 100) + "%",
        ]);
      });
    } else if (name === "Attendance Report") {
      lines.push([
        "See",
        "Attendance register & Leave calendar for full detail",
      ]);
      lines.push(["Working days (month)", "~21"]);
    } else if (name === "Leave Report") {
      var lr =
        typeof employeeLeaveRequests !== "undefined"
          ? employeeLeaveRequests
          : [];
      ["Pending", "Approved", "Rejected", "Cancelled"].forEach(function (s) {
        lines.push([
          s,
          lr.filter(function (x) {
            return x.status === s;
          }).length,
        ]);
      });
    }
    openDetail(
      name,
      lines.map(function (l) {
        return [l[0], String(l[1])];
      }),
    );
  }
  function renderAudit() {
    if (!S.audit.length)
      return '<div class="empty">No activity recorded yet. Actions you take across the modules appear here.</div>';
    return (
      '<div class="table-scroll"><table><thead><tr><th>Action</th><th>User</th><th>Record</th><th>Date</th><th>Time</th></tr></thead><tbody>' +
      S.audit
        .slice(0, 60)
        .map(function (a) {
          return (
            "<tr><td>" +
            esc(a.action) +
            "</td><td>" +
            esc(a.user) +
            '</td><td class="num">' +
            esc(a.record) +
            '</td><td class="num">' +
            niceDate(a.date) +
            '</td><td class="num">' +
            esc(a.time) +
            "</td></tr>"
          );
        })
        .join("") +
      "</tbody></table></div>"
    );
  }

  // Settings — roles & config
  function renderRoles() {
    var mods = [
      "Recruitment",
      "Candidates",
      "Employees",
      "Attendance",
      "Leave",
      "Payroll",
      "Projects",
      "Performance",
      "Reports",
      "Settings",
    ];
    var roles = {
      Admin: function () {
        return true;
      },
      HR: function (m) {
        return (
          [
            "Recruitment",
            "Candidates",
            "Employees",
            "Attendance",
            "Leave",
            "Payroll",
            "Reports",
          ].indexOf(m) >= 0
        );
      },
      Manager: function (m) {
        return (
          ["Projects", "Performance", "Leave", "Employees", "Reports"].indexOf(
            m,
          ) >= 0
        );
      },
      Employee: function (m) {
        return (
          ["Attendance", "Leave", "Payroll", "Projects", "Performance"].indexOf(
            m,
          ) >= 0
        );
      },
    };
    var head =
      "<tr><th>Module</th>" +
      Object.keys(roles)
        .map(function (r) {
          return "<th>" + r + "</th>";
        })
        .join("") +
      "</tr>";
    var body = mods
      .map(function (m) {
        return (
          "<tr><td>" +
          m +
          "</td>" +
          Object.keys(roles)
            .map(function (r) {
              return (
                "<td>" +
                (roles[r](m)
                  ? '<span class="yes">✓</span>'
                  : '<span class="no">—</span>') +
                "</td>"
              );
            })
            .join("") +
          "</tr>"
        );
      })
      .join("");
    return (
      '<div class="hrx-hint" style="margin-bottom:12px">Role-based access matrix. This portal runs as a single Admin persona; the matrix documents the access model to enforce when authentication is connected. Sensitive payroll and employee data is restricted to Admin/HR.</div>' +
      '<div class="hrx-matrix table-scroll"><table><thead>' +
      head +
      "</thead><tbody>" +
      body +
      "</tbody></table></div>"
    );
  }
  function renderConfig() {
    return (
      '<div class="hrx-statrow"><div class="hrx-statchip"><span class="k">Company</span><span class="v" style="font-size:15px">Cyethack Solutions</span></div>' +
      '<div class="hrx-statchip"><span class="k">Departments</span><span class="v">' +
      S.departments.length +
      "</span></div>" +
      '<div class="hrx-statchip"><span class="k">Designations</span><span class="v">' +
      S.designations.length +
      "</span></div>" +
      '<div class="hrx-statchip"><span class="k">Leave types</span><span class="v">8</span></div></div>' +
      '<div class="hrx-hint">Payroll deduction settings (configurable — not hard-coded): Professional Tax ₹200 flat; PF, TDS/Income Tax, ESI, Insurance are off by default and can be enabled per policy when the backend is connected. No CTC breakdown is stored — in-hand salary only, matching the portal\'s payroll rule.</div>'
    );
  }

  /* ============================================================
     Routes + tabbed shell
     ============================================================ */
  function resTab(key) {
    return function () {
      return resView(key);
    };
  }
  var ROUTES = {
    Employees: {
      tabs: [
        { k: "directory", label: "Directory", render: resTab("employees") },
        { k: "depts", label: "Departments", render: resTab("departments") },
        { k: "desig", label: "Designations", render: resTab("designations") },
        {
          k: "career",
          label: "Promotions & Transfers",
          render: function () {
            return (
              '<h2 style="font-size:15px;margin-bottom:12px">Promotions</h2>' +
              resView("promotions") +
              '<h2 style="font-size:15px;margin:24px 0 12px">Transfers</h2>' +
              resView("transfers")
            );
          },
        },
        { k: "training", label: "Training", render: resTab("training") },
        { k: "exit", label: "Exit", render: resTab("exits") },
      ],
    },
    Attendance: {
      tabs: [
        {
          k: "reg",
          label: "Attendance Register",
          render: renderAttendanceRegister,
        },
      ],
    },
    Payroll: {
      tabs: [
        { k: "process", label: "Processing", render: renderPayrollProcess },
        { k: "payslips", label: "Payslips", render: renderPayslips },
        {
          k: "structure",
          label: "Salary Structure",
          render: renderSalaryStructure,
        },
        { k: "history", label: "History", render: renderPayrollHistory },
      ],
    },
    Recruitment: {
      tabs: [
        { k: "jobs", label: "Job Openings", render: resTab("jobs") },
        { k: "cand", label: "Candidates (ATS)", render: resTab("candidates") },
        { k: "int", label: "Interviews", render: resTab("interviews") },
        { k: "off", label: "Offers", render: resTab("offers") },
        { k: "onb", label: "Onboarding", render: renderOnboarding },
      ],
    },
    Performance: {
      tabs: [
        { k: "tgt", label: "Targets & KPIs", render: resTab("targets") },
        { k: "rev", label: "Reviews", render: resTab("reviews") },
      ],
    },
    Projects: {
      tabs: [
        { k: "prj", label: "Projects", render: resTab("projects") },
        { k: "tsk", label: "Tasks", render: resTab("tasks") },
        { k: "work", label: "Work Tracking", render: renderWork },
      ],
    },
    Documents: {
      tabs: [{ k: "doc", label: "Documents", render: resTab("documents") }],
    },
    Reports: {
      tabs: [
        { k: "rep", label: "Reports", render: renderReports },
        { k: "aud", label: "Activity / Audit Log", render: renderAudit },
      ],
    },
    Settings: {
      tabs: [
        { k: "roles", label: "Roles & Permissions", render: renderRoles },
        { k: "cfg", label: "Configuration", render: renderConfig },
      ],
    },
  };
  var activeTab = {};
  HRX.route = null;

  function renderRoute(page) {
    var r = ROUTES[page];
    var root = $id("hrxModuleRoot");
    if (!r || !root) return;
    HRX.route = page;
    if (!activeTab[page]) activeTab[page] = r.tabs[0].k;
    var tab =
      r.tabs.filter(function (t) {
        return t.k === activeTab[page];
      })[0] || r.tabs[0];
    var tabsBar =
      r.tabs.length > 1
        ? '<div class="hrx-tabs">' +
          r.tabs
            .map(function (t) {
              return (
                '<button class="hrx-tab' +
                (t.k === tab.k ? " hrx-active" : "") +
                '" data-hrx-tab="' +
                t.k +
                '">' +
                esc(t.label) +
                "</button>"
              );
            })
            .join("") +
          "</div>"
        : "";
    root.innerHTML =
      '<section class="card">' +
      tabsBar +
      '<div id="hrxRouteBody">' +
      tab.render() +
      "</div></section>";
  }
  HRX.renderRoute = renderRoute;

  /* ---- one delegated handler for the whole suite ---- */
  function handleSpecial(code) {
    if (code.indexOf("report:") === 0) {
      showReport(code.slice(7));
    } else if (code.indexOf("onb:") === 0) {
      var parts = code.split(":");
      var o = S.onboarding.filter(function (x) {
        return x.id === parts[1];
      })[0];
      if (o) {
        var item = parts.slice(2).join(":");
        var i = o.done.indexOf(item);
        if (i >= 0) o.done.splice(i, 1);
        else o.done.push(item);
        audit("Onboarding updated", o.id);
        renderRoute("Recruitment");
      }
    }
  }
  function onRootClick(ev) {
    var t = ev.target;
    var tab = t.closest && t.closest("[data-hrx-tab]");
    if (tab) {
      activeTab[HRX.route] = tab.getAttribute("data-hrx-tab");
      renderRoute(HRX.route);
      return;
    }
    var add = t.closest && t.closest("[data-hrx-add]");
    if (add) {
      openForm(add.getAttribute("data-hrx-add"), null);
      return;
    }
    var act = t.closest && t.closest("[data-hrx-act]");
    if (act) {
      var key = act.getAttribute("data-hrx-res"),
        id = act.getAttribute("data-hrx-id"),
        a = act.getAttribute("data-hrx-act"),
        cfg = RES[key];
      var row = cfg.data().filter(function (x) {
        return x[cfg.idKey || "id"] === id;
      })[0];
      if (a === "view") resDetail(key, id);
      else if (a === "edit") openForm(key, row);
      else if (cfg.onAct) cfg.onAct(a, row);
      return;
    }
    var sp = t.closest && t.closest("[data-hrx-special]");
    if (sp && sp.tagName !== "SELECT") {
      handleSpecial(sp.getAttribute("data-hrx-special"));
      return;
    }
  }
  function onRootInput(ev) {
    var s = ev.target.closest && ev.target.closest(".hrx-search[data-hrx-res]");
    if (s) {
      stateFor(s.getAttribute("data-hrx-res")).search = ev.target.value;
      resFillBody(s.getAttribute("data-hrx-res"));
    }
  }
  function onRootChange(ev) {
    var sel = ev.target;
    if (sel.matches && sel.matches("select[data-hrx-filter]")) {
      stateFor(sel.getAttribute("data-hrx-res")).filters[
        sel.getAttribute("data-hrx-filter")
      ] = sel.value;
      resFillBody(sel.getAttribute("data-hrx-res"));
      return;
    }
    var sp = sel.getAttribute && sel.getAttribute("data-hrx-special");
    if (sp === "workemp") {
      stateFor("work").filters.emp = sel.value;
      renderRoute("Projects");
    }
  }

  /* ---- init: nav item, router wrap, listeners ---- */
  function injectProjectsNav() {
    if ($id("hrxNavProjects")) return;
    var nav = $id("nav");
    if (!nav) return;
    var perf = nav.querySelector('.nav-item[data-page="Performance"]');
    var b = doc.createElement("button");
    b.className = "nav-item";
    b.id = "hrxNavProjects";
    b.setAttribute("data-page", "Projects");
    b.title = "Projects";
    var ic = typeof icon === "function" ? icon("briefcase") : "";
    b.innerHTML = ic + '<span class="nav-text">Projects</span>';
    b.addEventListener("click", function () {
      navigate("Projects");
    });
    if (perf && perf.parentNode) {
      perf.parentNode.insertBefore(b, perf.nextSibling);
    } else nav.appendChild(b);
  }

  function boot() {
    injectProjectsNav();
    var root = $id("hrxModuleRoot");
    root.addEventListener("click", onRootClick);
    root.addEventListener("input", onRootInput);
    root.addEventListener("change", onRootChange);

    // Wrap the existing navigate() once more (chains on top of base + Leave wrapper)
    var prevNavigate = navigate;
    navigate = function (page) {
      prevNavigate(page);
      var owns = !!ROUTES[page];
      root.hidden = !owns;
      if (owns) {
        if ($id("modulePage")) $id("modulePage").hidden = true;
        renderRoute(page);
      }
    };
  }
  if (doc.readyState === "loading")
    doc.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
/* ===== ADDED FEATURE — HR Management Suite (JavaScript) · end ===== */

/* ===== portal inline block 4/11 (externalized for CSP; order preserved) ===== */

("use strict");
/* ============================================================
   ADDED FEATURE — Final Enhancement Pass (JavaScript) · start
   A new <script> block. No existing script line was edited.
   Everything is prefixed hr-plus- / hp / HRP and reuses only the
   PUBLIC surface already exposed by earlier blocks:
     window.HRX.store          — the shared in-memory database
     navigate, openModal, closeModal, toast, icon, $  (globals)
     DATA.notifications + renderBellMenu()             (the bell)
     employeeLeaveRequests + hrLeaveCalendarRefreshAll() (Leave)
   Adds: localStorage persistence, My Profile (self-service),
   Notice Board, HR Helpdesk, Leave Approvals, and UX polish.
   ============================================================ */
(function () {
  if (!window.HRX || !window.HRX.store) {
    return;
  } // suite must be present
  var doc = document,
    S = window.HRX.store;
  function $id(x) {
    return doc.getElementById(x);
  }
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
  var MON =
    typeof MONTHS !== "undefined"
      ? MONTHS
      : [
          "Jan",
          "Feb",
          "Mar",
          "Apr",
          "May",
          "Jun",
          "Jul",
          "Aug",
          "Sep",
          "Oct",
          "Nov",
          "Dec",
        ];
  function todayISO() {
    var d = new Date();
    return (
      d.getFullYear() +
      "-" +
      String(d.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(d.getDate()).padStart(2, "0")
    );
  }
  function nice(iso) {
    if (!iso) return "—";
    var p = String(iso).split("-");
    if (p.length < 3) return iso;
    return +p[2] + " " + MON[+p[1] - 1] + " " + p[0];
  }
  function nowTime() {
    return new Date().toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  function toastX(m) {
    if (typeof toast === "function") toast(m);
  }
  function money(n) {
    return "₹" + Number(n || 0).toLocaleString("en-IN");
  }
  function empById(id) {
    return S.employees.find(function (e) {
      return e.id === id;
    });
  }
  function initials(n) {
    return String(n || "?")
      .split(" ")
      .map(function (w) {
        return w[0];
      })
      .join("")
      .slice(0, 2)
      .toUpperCase();
  }

  /* ---- current user (self-service context) ---- */
  S.currentUser = S.currentUser || null;
  function me() {
    return (
      (S.currentUser && empById(S.currentUser)) || {
        name: "Current user",
        id: "",
      }
    );
  }

  /* ---- audit + notify (write into the shared stores the suite reads) ---- */
  function audit(action, record) {
    S.audit.unshift({
      action: action,
      user: me().name + " (Admin)",
      date: todayISO(),
      time: nowTime(),
      record: record || "",
    });
  }
  function notify(text) {
    try {
      if (typeof DATA !== "undefined" && DATA.notifications) {
        DATA.notifications.unshift({
          text: text,
          time: "just now",
          read: false,
        });
        if (typeof renderBellMenu === "function") renderBellMenu();
      }
    } catch (e) {}
  }

  /* ============================================================
     1. Persistence layer (localStorage)
     ============================================================ */
  var KEY = "cyethackHRP.v2",
    persistOK = true;
  function storageWorks() {
    try {
      var k = "__hp" + Date.now();
      localStorage.setItem(k, "1");
      localStorage.removeItem(k);
      return true;
    } catch (e) {
      return false;
    }
  }
  function snapshot() {
    return {
      v: 2,
      store: S,
      leave:
        typeof employeeLeaveRequests !== "undefined"
          ? employeeLeaveRequests
          : [],
      notifs: typeof DATA !== "undefined" ? DATA.notifications : [],
    };
  }
  var saveTimer = null;
  function saveNow() {
    if (!persistOK) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(snapshot()));
    } catch (e) {
      persistOK = false;
      showOffline(
        "Changes can’t be saved (storage is full or blocked). The portal still works for this session.",
      );
    }
  }
  function saveSoon() {
    if (!persistOK) return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, 700);
  }
  window.HRX.save = saveNow; // let other code trigger a save
  function hydrate() {
    var raw;
    try {
      raw = localStorage.getItem(KEY);
    } catch (e) {
      return;
    }
    if (!raw) return;
    var d;
    try {
      d = JSON.parse(raw);
    } catch (e) {
      return;
    }
    if (!d || d.v !== 2 || !d.store) return;
    Object.keys(d.store).forEach(function (k) {
      S[k] = d.store[k];
    }); // reassign store props (S === HRX.store)
    if (d.leave && typeof employeeLeaveRequests !== "undefined") {
      employeeLeaveRequests.length = 0;
      d.leave.forEach(function (r) {
        employeeLeaveRequests.push(r);
      });
    }
    if (d.notifs && typeof DATA !== "undefined" && DATA.notifications) {
      DATA.notifications.length = 0;
      d.notifs.forEach(function (n) {
        DATA.notifications.push(n);
      });
      if (typeof renderBellMenu === "function") renderBellMenu();
    }
    if (typeof hrLeaveCalendarRefreshAll === "function") {
      try {
        hrLeaveCalendarRefreshAll();
      } catch (e) {}
    }
    if (window.HRX.route && typeof window.HRX.renderRoute === "function") {
      try {
        window.HRX.renderRoute(window.HRX.route);
      } catch (e) {}
    }
  }
  function showOffline(msg) {
    var b = $id("hrPlusOffline");
    if (b) {
      b.textContent = msg;
      b.hidden = false;
    }
  }

  /* ============================================================
     2. Seed the two new collections (only if not already present)
     ============================================================ */
  if (!S.announcements)
    S.announcements = [
      {
        id: "ANN-01",
        title: "Revised leave policy effective 1 September",
        body: "Casual leave increases to 12 days a year; comp-off validity is now 4 months. See the HR handbook for details.",
        author: "HR",
        date: "2026-09-01",
        pinned: true,
      },
      {
        id: "ANN-02",
        title: "Cybersecurity awareness training — 12 Sep",
        body: "Mandatory 2-hour session for all staff. Slots open in the Performance module.",
        author: "L&D",
        date: "2026-09-02",
        pinned: false,
      },
      {
        id: "ANN-03",
        title: "Diwali holiday schedule published",
        body: "Offices closed 7–9 Nov. On-call roster shared with SOC leads.",
        author: "Admin",
        date: "2026-09-03",
        pinned: false,
      },
    ];
  if (!S.tickets)
    S.tickets = [
      {
        id: "TCK-01",
        subject: "Payslip not visible for August",
        category: "Payroll",
        message: "I cannot see my August payslip under My Documents.",
        by: "CHS-0008",
        date: "2026-09-04",
        status: "Open",
      },
      {
        id: "TCK-02",
        subject: "Update my emergency contact",
        category: "HR / Records",
        message: "Please help update my emergency contact number.",
        by: "CHS-0011",
        date: "2026-09-03",
        status: "Resolved",
      },
    ];
  var hpSeq = 100;
  function newId(pfx) {
    hpSeq++;
    return pfx + "-" + hpSeq;
  }

  /* ============================================================
     3. Navigation — add a WORKSPACE section (additive)
     ============================================================ */
  var ROUTES = {
    "My Profile": { icon: "user", render: renderProfile },
    "Notice Board": { icon: "bell", render: renderNotice },
    Helpdesk: { icon: "clipboardCheck", render: renderHelpdesk },
    "Leave Approvals": { icon: "userCheck", render: renderApprovals },
  };
  window.HRP = { routes: ROUTES, save: saveNow };
  function iconOf(name) {
    return typeof icon === "function" ? icon(name) : "";
  }
  function injectNav() {
    var nav = $id("nav");
    if (!nav || $id("hrPlusNavStart")) return;
    var lab = doc.createElement("div");
    lab.className = "nav-label";
    lab.id = "hrPlusNavStart";
    lab.textContent = "Workspace";
    nav.appendChild(lab);
    Object.keys(ROUTES).forEach(function (name) {
      var b = doc.createElement("button");
      b.className = "nav-item";
      b.setAttribute("data-page", name);
      b.title = name;
      b.innerHTML =
        iconOf(ROUTES[name].icon) +
        '<span class="nav-text">' +
        esc(name) +
        "</span>";
      b.addEventListener("click", function () {
        navigate(name);
      });
      nav.appendChild(b);
    });
  }

  /* ============================================================
     4. Router extension — wrap navigate() once more
     ============================================================ */
  var curPage = "Dashboard";
  function mountFor(page) {
    var root = $id("hrPlusRoot");
    if (!root) return;
    var owns = !!ROUTES[page];
    root.hidden = !owns;
    if (owns) {
      if ($id("modulePage")) $id("modulePage").hidden = true;
      if ($id("hrxModuleRoot")) $id("hrxModuleRoot").hidden = true;
      ROUTES[page].render(root);
    }
  }

  /* ============================================================
     5. Feature renders
     ============================================================ */
  function renderProfile(root) {
    var e = me();
    var docs = (S.documents || []).filter(function (d) {
      return d.owner === e.id;
    });
    var myDocs = [];
    myDocs.push({ t: "Employment contract", s: "On file", ic: "fileText" });
    docs.forEach(function (d) {
      myDocs.push({ t: d.name, s: d.type + " · " + d.status, ic: "fileText" });
    });
    if (!docs.length)
      myDocs.push({ t: "ID proof", s: "On file", ic: "fileText" });

    root.innerHTML =
      '<div class="hr-plus-head"><div><h2>My Profile</h2><div class="sub">Your details. You can update your phone, emergency contact and address — the rest is maintained by HR.</div></div></div>' +
      '<div class="hr-plus-grid2">' +
      '<section class="card">' +
      '<div class="hr-plus-prof">' +
      '<div class="hr-plus-av">' +
      initials(e.name) +
      "</div>" +
      "<div>" +
      '<div style="font-size:18px;font-weight:600">' +
      esc(e.name) +
      "</div>" +
      '<div style="color:var(--text-2);font-size:13px;margin-bottom:12px">' +
      esc(e.designation) +
      " · " +
      esc(e.id) +
      "</div>" +
      '<div class="hr-plus-field"><label>Department</label><input value="' +
      esc(HRX.helpers.deptName(e.dept)) +
      '" disabled></div>' +
      '<div class="hr-plus-field"><label>Work email</label><input value="' +
      esc(e.email) +
      '" disabled></div>' +
      '<div class="hr-plus-field"><label>Phone</label><input id="hpPhone" value="' +
      esc(e.phone || "") +
      '"></div>' +
      '<div class="hr-plus-field"><label>Emergency contact</label><input id="hpEmerg" value="' +
      esc(e.emergency || "") +
      '" placeholder="Name & number"></div>' +
      '<div class="hr-plus-field"><label>Address</label><textarea id="hpAddr" placeholder="Your current address">' +
      esc(e.address || "") +
      "</textarea></div>" +
      '<button class="btn btn-primary btn-sm" data-hp-act="saveProfile">Save my details</button>' +
      "</div>" +
      "</div>" +
      "</section>" +
      '<section class="card"><div class="card-head"><div><h2>My Documents</h2><div class="sub">View your payslip and records</div></div></div>' +
      '<div class="hr-plus-doclist">' +
      myDocs
        .map(function (d) {
          return (
            '<div class="hr-plus-doc"><span class="ic">' +
            iconOf(d.ic) +
            '</span><span class="who"><b>' +
            esc(d.t) +
            "</b><span>" +
            esc(d.s) +
            "</span></span>" +
            '<button class="btn btn-outline btn-sm" data-hp-act="doc">View</button></div>'
          );
        })
        .join("") +
      "</div></section>" +
      "</div>";
  }
  function saveProfile() {
    var e = me();
    e.phone = $id("hpPhone").value.trim();
    e.emergency = $id("hpEmerg").value.trim();
    e.address = $id("hpAddr").value.trim();
    audit("Employee updated own profile", e.id);
    saveNow();
    toastX("Your details were saved");
    notify("Profile updated for " + e.name);
  }

  function renderNotice(root) {
    var list = S.announcements.slice().sort(function (a, b) {
      return (
        (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || (a.date < b.date ? 1 : -1)
      );
    });
    root.innerHTML =
      '<div class="hr-plus-head"><div><h2>Notice Board</h2><div class="sub">Company announcements. HR can post and pin notices.</div></div>' +
      '<button class="btn btn-primary btn-sm" data-hp-act="newNotice">+ New announcement</button></div>' +
      '<section class="card">' +
      (list.length
        ? list
            .map(function (a) {
              return (
                '<div class="hr-plus-notice' +
                (a.pinned ? " hr-plus-pin" : "") +
                '">' +
                '<div style="display:flex;align-items:flex-start;gap:8px"><h3>' +
                esc(a.title) +
                (a.pinned
                  ? ' <span class="hr-plus-pinchip">Pinned</span>'
                  : "") +
                "</h3>" +
                '<div class="hr-plus-notice-actions">' +
                '<button class="btn btn-outline btn-sm" data-hp-act="pin" data-hp-id="' +
                a.id +
                '">' +
                (a.pinned ? "Unpin" : "Pin") +
                "</button>" +
                '<button class="btn btn-danger-outline btn-sm" data-hp-act="delNotice" data-hp-id="' +
                a.id +
                '">Delete</button>' +
                "</div></div>" +
                "<p>" +
                esc(a.body) +
                '</p><div class="meta">' +
                esc(a.author) +
                " · " +
                nice(a.date) +
                "</div></div>"
              );
            })
            .join("")
        : '<div class="empty">No announcements yet. Click “+ New announcement” to post one.</div>') +
      "</section>";
  }
  function newNotice() {
    openModal(
      '<div class="modal-head"><h3>New announcement</h3><button class="icon-btn" style="width:32px;height:32px" aria-label="Close" data-close="1">✕</button></div>' +
        '<div class="modal-body hrx-form">' +
        '<div class="field" id="hpNTf"><label for="hpNTitle">Title</label><input id="hpNTitle" type="text"><div class="err">Please enter a title.</div></div>' +
        '<div class="field" id="hpNBf"><label for="hpNBody">Message</label><textarea id="hpNBody" style="width:100%;min-height:90px;padding:10px 12px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text);font-family:var(--font);font-size:13px"></textarea><div class="err">Please enter a message.</div></div>' +
        '<label class="hrx-check" style="display:flex;align-items:center;gap:8px;font-size:13px"><input type="checkbox" id="hpNPin" style="width:15px;height:15px;accent-color:var(--teal)"> Pin to top</label>' +
        "</div>" +
        '<div class="modal-foot"><button class="btn btn-ghost" data-close="1">Cancel</button><button class="btn btn-primary" id="hpNSave">Post announcement</button></div>',
    );
    $id("hpNSave").addEventListener("click", function () {
      var t = $id("hpNTitle").value.trim(),
        b = $id("hpNBody").value.trim(),
        bad = false;
      $id("hpNTf").classList.remove("invalid");
      $id("hpNBf").classList.remove("invalid");
      if (!t) {
        $id("hpNTf").classList.add("invalid");
        bad = true;
      }
      if (!b) {
        $id("hpNBf").classList.add("invalid");
        bad = true;
      }
      if (bad) return;
      S.announcements.unshift({
        id: newId("ANN"),
        title: t,
        body: b,
        author: "HR Admin",
        date: todayISO(),
        pinned: $id("hpNPin").checked,
      });
      audit("Announcement posted", t);
      saveNow();
      closeModal();
      toastX("Announcement posted");
      notify("New announcement: " + t);
      renderPlus("Notice Board");
    });
  }
  function pinNotice(id) {
    var a = S.announcements.find(function (x) {
      return x.id === id;
    });
    if (a) {
      a.pinned = !a.pinned;
      audit("Announcement " + (a.pinned ? "pinned" : "unpinned"), id);
      saveNow();
      renderPlus("Notice Board");
    }
  }
  function delNotice(id) {
    var a = S.announcements.find(function (x) {
      return x.id === id;
    });
    if (!a) return;
    openModal(
      '<div class="modal-head"><h3>Delete announcement?</h3><button class="icon-btn" style="width:32px;height:32px" aria-label="Close" data-close="1">✕</button></div>' +
        '<div class="modal-body">Delete <b>' +
        esc(a.title) +
        "</b>? This cannot be undone.</div>" +
        '<div class="modal-foot"><button class="btn btn-ghost" data-close="1">Keep it</button><button class="btn btn-danger-outline" id="hpDelYes">Delete</button></div>',
    );
    $id("hpDelYes").addEventListener("click", function () {
      S.announcements = S.announcements.filter(function (x) {
        return x.id !== id;
      });
      audit("Announcement deleted", id);
      saveNow();
      closeModal();
      toastX("Announcement deleted");
      renderPlus("Notice Board");
    });
  }

  var TK_BADGE = {
    Open: "st-pending",
    "In Progress": "hrx-st-info",
    Resolved: "st-approved",
  };
  function renderHelpdesk(root) {
    var rows = S.tickets.slice().sort(function (a, b) {
      return a.date < b.date ? 1 : -1;
    });
    var open = rows.filter(function (t) {
      return t.status !== "Resolved";
    }).length;
    root.innerHTML =
      '<div class="hr-plus-head"><div><h2>HR Helpdesk</h2><div class="sub">' +
      rows.length +
      " tickets · " +
      open +
      " open — raise a query and track HR’s response.</div></div>" +
      '<button class="btn btn-primary btn-sm" data-hp-act="newTicket">+ Raise a ticket</button></div>' +
      '<section class="card"><div class="table-scroll"><table><thead><tr><th>Ticket</th><th>Subject</th><th>Category</th><th>Raised by</th><th>Date</th><th>Status</th><th>Action</th></tr></thead><tbody>' +
      (rows.length
        ? rows
            .map(function (t) {
              var nextLbl =
                t.status === "Open"
                  ? "Mark In Progress"
                  : t.status === "In Progress"
                    ? "Mark Resolved"
                    : null;
              return (
                '<tr><td class="num">' +
                t.id +
                "</td><td>" +
                esc(t.subject) +
                "</td><td>" +
                esc(t.category) +
                "</td>" +
                "<td>" +
                esc((empById(t.by) || {}).name || t.by) +
                '</td><td class="num">' +
                nice(t.date) +
                "</td>" +
                '<td><span class="pill-status ' +
                (TK_BADGE[t.status] || "st-pending") +
                '">' +
                t.status +
                "</span></td>" +
                '<td><div class="hrx-actbtns"><button class="btn btn-outline btn-sm" data-hp-act="viewTicket" data-hp-id="' +
                t.id +
                '">View</button>' +
                (nextLbl
                  ? '<button class="btn btn-outline btn-sm" data-hp-act="advTicket" data-hp-id="' +
                    t.id +
                    '">' +
                    nextLbl +
                    "</button>"
                  : "") +
                "</div></td></tr>"
              );
            })
            .join("")
        : '<tr><td colspan="7"><div class="empty">No tickets yet. Click “+ Raise a ticket”.</div></td></tr>') +
      "</tbody></table></div></section>";
  }
  function newTicket() {
    openModal(
      '<div class="modal-head"><h3>Raise a helpdesk ticket</h3><button class="icon-btn" style="width:32px;height:32px" aria-label="Close" data-close="1">✕</button></div>' +
        '<div class="modal-body hrx-form">' +
        '<div class="field" id="hpTSf"><label for="hpTSub">Subject</label><input id="hpTSub" type="text"><div class="err">Please enter a subject.</div></div>' +
        '<div class="field"><label for="hpTCat">Category</label><select id="hpTCat"><option>HR / Records</option><option>Payroll</option><option>Leave &amp; Attendance</option><option>IT / Access</option><option>Other</option></select></div>' +
        '<div class="field" id="hpTMf"><label for="hpTMsg">Message</label><textarea id="hpTMsg" style="width:100%;min-height:90px;padding:10px 12px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text);font-family:var(--font);font-size:13px"></textarea><div class="err">Please describe your query.</div></div>' +
        "</div>" +
        '<div class="modal-foot"><button class="btn btn-ghost" data-close="1">Cancel</button><button class="btn btn-primary" id="hpTSave">Submit ticket</button></div>',
    );
    $id("hpTSave").addEventListener("click", function () {
      var s = $id("hpTSub").value.trim(),
        m = $id("hpTMsg").value.trim(),
        bad = false;
      $id("hpTSf").classList.remove("invalid");
      $id("hpTMf").classList.remove("invalid");
      if (!s) {
        $id("hpTSf").classList.add("invalid");
        bad = true;
      }
      if (!m) {
        $id("hpTMf").classList.add("invalid");
        bad = true;
      }
      if (bad) return;
      var id = newId("TCK");
      S.tickets.unshift({
        id: id,
        subject: s,
        category: $id("hpTCat").value,
        message: m,
        by: S.currentUser,
        date: todayISO(),
        status: "Open",
      });
      audit("Helpdesk ticket raised", id);
      saveNow();
      closeModal();
      toastX("Ticket " + id + " submitted");
      notify("New helpdesk ticket: " + s);
      renderPlus("Helpdesk");
    });
  }
  function viewTicket(id) {
    var t = S.tickets.find(function (x) {
      return x.id === id;
    });
    if (!t) return;
    var rows = [
      ["Ticket ID", t.id],
      ["Subject", t.subject],
      ["Category", t.category],
      ["Raised by", (empById(t.by) || {}).name || t.by],
      ["Date", nice(t.date)],
      ["Status", t.status],
      ["Message", t.message],
    ];
    openModal(
      '<div class="modal-head"><h3>Ticket ' +
        t.id +
        '</h3><button class="icon-btn" style="width:32px;height:32px" aria-label="Close" data-close="1">✕</button></div>' +
        '<div class="modal-body"><dl class="hrx-detail">' +
        rows
          .map(function (r) {
            return "<dt>" + r[0] + "</dt><dd>" + esc(r[1]) + "</dd>";
          })
          .join("") +
        "</dl></div>" +
        '<div class="modal-foot"><button class="btn btn-ghost" data-close="1">Close</button></div>',
    );
  }
  function advTicket(id) {
    var t = S.tickets.find(function (x) {
      return x.id === id;
    });
    if (!t) return;
    t.status = t.status === "Open" ? "In Progress" : "Resolved";
    audit("Helpdesk ticket → " + t.status, id);
    saveNow();
    toastX("Ticket " + id + " → " + t.status);
    if (t.status === "Resolved") notify("Your ticket " + id + " was resolved");
    renderPlus("Helpdesk");
  }

  function renderApprovals(root) {
    var pend =
      typeof employeeLeaveRequests !== "undefined"
        ? employeeLeaveRequests.filter(function (r) {
            return r.status === "Pending";
          })
        : [];
    var decided =
      typeof employeeLeaveRequests !== "undefined"
        ? employeeLeaveRequests
            .filter(function (r) {
              return r.status === "Approved" || r.status === "Rejected";
            })
            .slice(0, 6)
        : [];
    root.innerHTML =
      '<div class="hr-plus-head"><div><h2>Leave Approvals</h2><div class="sub">Manager view · ' +
      pend.length +
      " request" +
      (pend.length === 1 ? "" : "s") +
      " awaiting your decision. Approving updates the calendar and balance immediately.</div></div></div>" +
      '<section class="card"><div class="table-scroll"><table><thead><tr><th>Request</th><th>Employee</th><th>Type</th><th>Dates</th><th>Days</th><th>Reason</th><th>Action</th></tr></thead><tbody>' +
      (pend.length
        ? pend
            .map(function (r) {
              return (
                '<tr><td class="num">' +
                r.id +
                "</td><td>" +
                esc(r.employeeName || me().name) +
                "</td><td>" +
                esc(r.type) +
                "</td>" +
                '<td class="num">' +
                nice(r.from) +
                (r.to !== r.from ? " – " + nice(r.to) : "") +
                '</td><td class="num">' +
                r.days +
                "</td>" +
                "<td>" +
                esc(r.reason) +
                "</td>" +
                '<td><div class="hrx-actbtns"><button class="btn btn-outline btn-sm" data-hp-act="appr" data-hp-id="' +
                r.id +
                '">Approve</button>' +
                '<button class="btn btn-danger-outline btn-sm" data-hp-act="rej" data-hp-id="' +
                r.id +
                '">Reject</button></div></td></tr>'
              );
            })
            .join("")
        : '<tr><td colspan="7"><div class="empty">No pending leave requests. All caught up.</div></td></tr>') +
      "</tbody></table></div></section>" +
      (decided.length
        ? '<section class="card"><div class="card-head"><div><h2>Recently decided</h2></div></div><div class="table-scroll"><table><thead><tr><th>Request</th><th>Type</th><th>Dates</th><th>Status</th></tr></thead><tbody>' +
          decided
            .map(function (r) {
              return (
                '<tr><td class="num">' +
                r.id +
                "</td><td>" +
                esc(r.type) +
                '</td><td class="num">' +
                nice(r.from) +
                '</td><td><span class="pill-status ' +
                (r.status === "Approved" ? "st-approved" : "st-rejected") +
                '">' +
                r.status +
                "</span></td></tr>"
              );
            })
            .join("") +
          "</tbody></table></div></section>"
        : "");
  }
  function decide(id, approve) {
    var r = employeeLeaveRequests.find(function (x) {
      return x.id === id;
    });
    if (!r || r.status !== "Pending") return;
    openModal(
      '<div class="modal-head"><h3>' +
        (approve ? "Approve" : "Reject") +
        ' leave request?</h3><button class="icon-btn" style="width:32px;height:32px" aria-label="Close" data-close="1">✕</button></div>' +
        '<div class="modal-body">' +
        (approve ? "Approve" : "Reject") +
        " <b>" +
        r.id +
        "</b> — " +
        esc(r.type) +
        ", " +
        nice(r.from) +
        (r.to !== r.from ? " – " + nice(r.to) : "") +
        "?</div>" +
        '<div class="modal-foot"><button class="btn btn-ghost" data-close="1">Cancel</button><button class="btn ' +
        (approve ? "btn-primary" : "btn-danger-outline") +
        '" id="hpDecYes">' +
        (approve ? "Approve" : "Reject") +
        "</button></div>",
    );
    $id("hpDecYes").addEventListener("click", function () {
      r.status = approve ? "Approved" : "Rejected";
      audit("Leave " + (approve ? "approved" : "rejected"), r.id);
      if (typeof hrLeaveCalendarRefreshAll === "function") {
        try {
          hrLeaveCalendarRefreshAll();
        } catch (e) {}
      }
      saveNow();
      closeModal();
      toastX("Leave " + r.id + " " + (approve ? "approved" : "rejected"));
      notify(
        "Your leave " + r.id + " was " + (approve ? "approved" : "rejected"),
      );
      renderPlus("Leave Approvals");
    });
  }

  function renderPlus(page) {
    var root = $id("hrPlusRoot");
    if (root && ROUTES[page]) ROUTES[page].render(root);
  }

  /* ---- one delegated click handler for all hr-plus features ---- */
  function onPlusClick(ev) {
    var b = ev.target.closest && ev.target.closest("[data-hp-act]");
    if (!b) return;
    var act = b.getAttribute("data-hp-act"),
      id = b.getAttribute("data-hp-id");
    if (act === "saveProfile") saveProfile();
    else if (act === "doc")
      toastX(
        "Document preview / download is enabled once the backend is connected",
      );
    else if (act === "newNotice") newNotice();
    else if (act === "pin") pinNotice(id);
    else if (act === "delNotice") delNotice(id);
    else if (act === "newTicket") newTicket();
    else if (act === "viewTicket") viewTicket(id);
    else if (act === "advTicket") advTicket(id);
    else if (act === "appr") decide(id, true);
    else if (act === "rej") decide(id, false);
  }

  /* ============================================================
     6. UX polish
     ============================================================ */
  function addTooltips() {
    doc.querySelectorAll(".icon-btn").forEach(function (el) {
      if (!el.getAttribute("title")) {
        var a = el.getAttribute("aria-label");
        if (a) el.setAttribute("title", a);
      }
    });
  }
  function keyShortcuts() {
    doc.addEventListener("keydown", function (ev) {
      if (ev.key === "/" && !ev.metaKey && !ev.ctrlKey) {
        var a = doc.activeElement,
          tag = a && a.tagName;
        if (
          tag === "INPUT" ||
          tag === "TEXTAREA" ||
          tag === "SELECT" ||
          (a && a.isContentEditable)
        )
          return;
        if (!$id("modalScrim") || $id("modalScrim").hidden) {
          var s = $id("searchInput");
          if (s) {
            ev.preventDefault();
            s.focus();
          }
        }
      }
    });
  }
  var WHATS_NEW = [
    "localStorage saving — your changes now stay after a refresh",
    "My Profile — view your details and documents, edit phone/emergency/address",
    "Notice Board — post and pin company announcements",
    "HR Helpdesk — raise and track queries",
    "Leave Approvals — approve or reject pending leave, updating the calendar",
    "Keyboard shortcut: press “/” to jump to search",
  ];
  function whatsNewCard() {
    return (
      '<div class="hr-plus-welcome" id="hpWelcome"><span class="ic">' +
      iconOf("trendingUp") +
      "</span>" +
      "<div><h3>What’s new in your HR portal</h3><ul>" +
      WHATS_NEW.map(function (x) {
        return "<li>" + esc(x) + "</li>";
      }).join("") +
      "</ul></div>" +
      '<button class="icon-btn x" style="width:30px;height:30px" aria-label="Dismiss" title="Dismiss" data-hp-dismiss="1">✕</button></div>'
    );
  }
  function showWelcomeOnce() {
    var seen = false;
    try {
      seen = localStorage.getItem("cyethackHRP.welcome") === "1";
    } catch (e) {}
    if (seen) return;
    var content = $id("content");
    if (!content) return;
    var wrap = doc.createElement("div");
    wrap.innerHTML = whatsNewCard();
    content.insertBefore(wrap.firstChild, content.firstChild);
  }
  function openWhatsNew() {
    openModal(
      '<div class="modal-head"><h3>What’s new</h3><button class="icon-btn" style="width:32px;height:32px" aria-label="Close" data-close="1">✕</button></div>' +
        '<div class="modal-body"><ul style="margin:0;padding-left:18px;font-size:13px;line-height:1.7;color:var(--text)">' +
        WHATS_NEW.map(function (x) {
          return "<li>" + esc(x) + "</li>";
        }).join("") +
        "</ul></div>" +
        '<div class="modal-foot"><button class="btn btn-primary" data-close="1">Got it</button></div>',
    );
  }
  function addWhatsNewButton() {
    if ($id("hrPlusWhatsNew")) return;
    var btn = doc.createElement("button");
    btn.id = "hrPlusWhatsNew";
    btn.type = "button";
    btn.innerHTML = "✨ What’s new";
    btn.addEventListener("click", openWhatsNew);
    doc.body.appendChild(btn);
  }

  /* ============================================================
     7. Boot
     ============================================================ */
  function boot() {
    persistOK = storageWorks();
    if (!persistOK)
      showOffline(
        "Working offline — changes won’t be saved after you close this page (browser storage is unavailable).",
      );
    else hydrate();

    injectNav();
    addTooltips();
    keyShortcuts();
    showWelcomeOnce();
    addWhatsNewButton();

    $id("hrPlusRoot").addEventListener("click", onPlusClick);
    // dismiss welcome bar (delegated on content)
    var content = $id("content");
    if (content)
      content.addEventListener("click", function (ev) {
        var d = ev.target.closest && ev.target.closest("[data-hp-dismiss]");
        if (d) {
          var w = $id("hpWelcome");
          if (w) w.remove();
          try {
            localStorage.setItem("cyethackHRP.welcome", "1");
          } catch (e) {}
        }
      });

    // wrap navigate() once more (runs after base + Leave + suite wrappers)
    var prevNav = navigate;
    navigate = function (page) {
      curPage = page;
      prevNav(page);
      mountFor(page);
    };

    // autosave: after any interaction, and when leaving the page
    doc.addEventListener("click", saveSoon, true);
    doc.addEventListener("change", saveSoon, true);
    window.addEventListener("beforeunload", saveNow);
    doc.addEventListener("visibilitychange", function () {
      if (doc.visibilityState === "hidden") saveNow();
    });

    if (persistOK) saveNow(); // establish the baseline snapshot
  }
  if (doc.readyState === "loading")
    doc.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
/* ===== ADDED FEATURE — Final Enhancement Pass (JavaScript) · end ===== */

/* ===== portal inline block 5/11 (externalized for CSP; order preserved) ===== */

("use strict");
/* ============================================================
   ADDED FEATURE — Enhancement Pass 2 (JavaScript) · start
   A new <script> block. No existing line edited. Adds, additively:
     • CSV export of the table on the current screen
     • Org Chart (built from employees' reporting-manager field)
     • Offboarding checklist (mirrors the onboarding one)
   Reuses the public surface only: window.HRX.store, window.HRP.routes,
   navigate/toast/$/icon, and HRX.save(). New names are prefixed hp2 /
   hr-plus2-. Routes are registered into the SAME window.HRP.routes
   object the earlier block already renders, so no re-wiring is needed.
   ============================================================ */
(function () {
  if (!window.HRX || !window.HRX.store || !window.HRP || !window.HRP.routes) {
    return;
  }
  var doc = document,
    S = window.HRX.store;
  function $id(x) {
    return doc.getElementById(x);
  }
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
  function toastX(m) {
    if (typeof toast === "function") toast(m);
  }
  function iconOf(n) {
    return typeof icon === "function" ? icon(n) : "";
  }
  function save() {
    if (window.HRX && typeof window.HRX.save === "function") window.HRX.save();
  }
  function deptName(id) {
    return window.HRX.helpers && window.HRX.helpers.deptName
      ? window.HRX.helpers.deptName(id)
      : id;
  }
  function empById(id) {
    return S.employees.find(function (e) {
      return e.id === id;
    });
  }
  function initials(n) {
    return String(n || "?")
      .split(" ")
      .map(function (w) {
        return w[0];
      })
      .join("")
      .slice(0, 2)
      .toUpperCase();
  }

  /* ---- scoped styles (injected; no existing CSS touched) ---- */
  function injectCss() {
    if ($id("hrPlus2Styles")) return;
    var st = doc.createElement("style");
    st.id = "hrPlus2Styles";
    st.textContent =
      ".hr-plus2-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:4px}" +
      ".hr-plus2-head h2{font-size:18px;font-weight:600}.hr-plus2-head .sub{font-size:12px;color:var(--text-2);margin-top:2px}" +
      ".hp2-org ul{list-style:none;margin:0;padding:0 0 0 26px;border-left:1px solid var(--border)}" +
      ".hp2-org>ul{padding-left:0;border-left:none}" +
      ".hp2-org li{margin:8px 0;position:relative}" +
      ".hp2-node{display:inline-flex;align-items:center;gap:10px;background:var(--bg);border:1px solid var(--border);border-radius:10px;padding:8px 12px;min-width:220px}" +
      ".hp2-node .av{width:32px;height:32px;border-radius:50%;background:var(--teal);color:#fff;display:grid;place-items:center;font-size:12px;font-weight:600;flex:0 0 auto}" +
      ".hp2-node b{font-size:13px;font-weight:600;display:block}.hp2-node span{font-size:11px;color:var(--text-2)}" +
      ".hp2-node .cnt{margin-left:auto;font-family:var(--mono);font-size:11px;color:var(--muted);background:var(--surface);border:1px solid var(--border);border-radius:999px;padding:2px 8px}" +
      ".hp2-org details>summary{list-style:none;cursor:pointer}.hp2-org details>summary::-webkit-details-marker{display:none}" +
      '.hp2-org details>summary .hp2-node{cursor:pointer}.hp2-org details[open]>summary .cnt::after{content:" ▾"}.hp2-org details:not([open])>summary .cnt::after{content:" ▸"}' +
      ".hp2-check{list-style:none;margin:0;padding:0}" +
      ".hp2-check li{display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border);font-size:13px}" +
      ".hp2-check li:last-child{border-bottom:none}.hp2-check input{width:16px;height:16px;accent-color:var(--teal);flex:0 0 auto}" +
      ".hp2-check .done{color:var(--muted);text-decoration:line-through}" +
      "#hp2Csv{position:fixed;left:264px;bottom:58px;z-index:55;height:34px;padding:0 14px;border-radius:999px;background:var(--surface);border:1px solid var(--border);color:var(--text-2);font-size:12px;font-weight:600;font-family:var(--font);cursor:pointer;box-shadow:var(--shadow);display:inline-flex;align-items:center;gap:6px}" +
      "#hp2Csv:hover{color:var(--text);border-color:var(--hover-border)}" +
      "@media (max-width:899px){#hp2Csv{left:16px;bottom:118px}}";
    doc.head.appendChild(st);
  }

  /* ============================================================
     1. CSV export of the table currently on screen
     ============================================================ */
  function visibleTable() {
    var roots = [
      "hrPlusRoot",
      "hrxModuleRoot",
      "hrLeaveCalendarPage",
      "dashboardPage",
    ];
    for (var i = 0; i < roots.length; i++) {
      var el = $id(roots[i]);
      if (el && !el.hidden && el.offsetParent !== null) {
        var t = el.querySelector("table");
        if (t && t.querySelector("tbody tr")) return t;
      }
    }
    return null;
  }
  function csvCell(s) {
    s = String(s == null ? "" : s)
      .replace(/\s+/g, " ")
      .trim();
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function tableToCsv(t) {
    var out = [];
    t.querySelectorAll("tr").forEach(function (tr) {
      var cells = tr.querySelectorAll("th,td");
      if (!cells.length) return;
      var row = [];
      cells.forEach(function (c) {
        row.push(csvCell(c.innerText));
      });
      out.push(row.join(","));
    });
    return out.join("\r\n");
  }
  function exportCsv() {
    var t = visibleTable();
    if (!t) {
      toastX("No table on this screen to export");
      return;
    }
    var csv = tableToCsv(t);
    var title = (($id("pageTitle") && $id("pageTitle").textContent) || "export")
      .replace(/[^a-z0-9]+/gi, "_")
      .toLowerCase();
    var name = "cyethack_" + title + ".csv";
    try {
      var blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      var url = URL.createObjectURL(blob);
      var a = doc.createElement("a");
      a.href = url;
      a.download = name;
      doc.body.appendChild(a);
      a.click();
      setTimeout(function () {
        URL.revokeObjectURL(url);
        a.remove();
      }, 200);
    } catch (e) {
      var a2 = doc.createElement("a");
      a2.href = "data:text/csv;charset=utf-8," + encodeURIComponent(csv);
      a2.download = name;
      doc.body.appendChild(a2);
      a2.click();
      a2.remove();
    }
    toastX("Exported " + name);
  }
  function addCsvButton() {
    if ($id("hp2Csv")) return;
    var b = doc.createElement("button");
    b.id = "hp2Csv";
    b.type = "button";
    b.title = "Download the table on this screen as a CSV file";
    b.innerHTML = "⤓ Export CSV";
    b.addEventListener("click", exportCsv);
    doc.body.appendChild(b);
  }

  /* ============================================================
     2. Org Chart (from reporting-manager field)
     ============================================================ */
  function reports(id) {
    return S.employees.filter(function (e) {
      return e.manager === id;
    });
  }
  function nodeHtml(e) {
    var n = reports(e.id).length;
    return (
      '<span class="hp2-node"><span class="av">' +
      initials(e.name) +
      "</span><span><b>" +
      esc(e.name) +
      "</b>" +
      "<span>" +
      esc(e.designation) +
      " · " +
      esc(deptName(e.dept)) +
      "</span></span>" +
      (n
        ? '<span class="cnt">' + n + " report" + (n > 1 ? "s" : "") + "</span>"
        : "") +
      "</span>"
    );
  }
  function treeHtml(e) {
    var kids = reports(e.id);
    if (!kids.length) return "<li>" + nodeHtml(e) + "</li>";
    return (
      "<li><details open><summary>" +
      nodeHtml(e) +
      "</summary><ul>" +
      kids.map(treeHtml).join("") +
      "</ul></details></li>"
    );
  }
  function renderOrg(root) {
    var roots = S.employees.filter(function (e) {
      return !e.manager || !empById(e.manager);
    });
    root.innerHTML =
      '<div class="hr-plus2-head"><div><h2>Org Chart</h2><div class="sub">Built automatically from each employee’s reporting manager. Click a name to expand or collapse their team.</div></div>' +
      '<button class="btn btn-outline btn-sm" data-hp2-act="expandAll">Expand all</button></div>' +
      '<section class="card hp2-org" id="hp2OrgWrap"><ul>' +
      roots.map(treeHtml).join("") +
      "</ul></section>";
  }

  /* ============================================================
     3. Offboarding checklist (mirrors onboarding)
     ============================================================ */
  var OFF_ITEMS = [
    "Exit interview scheduled",
    "Knowledge handover completed",
    "Company assets returned (laptop, ID, access card)",
    "System & email access revoked",
    "Final settlement processed",
    "Experience letter issued",
  ];
  if (!S.exitChecklists) S.exitChecklists = {};
  function renderOffboard(root) {
    var exits = S.exits || [];
    if (!exits.length) {
      root.innerHTML =
        '<div class="hr-plus2-head"><div><h2>Offboarding</h2><div class="sub">No employees are currently exiting. Set an employee’s status to “Exiting” in the Employees module to start offboarding.</div></div></div><section class="card"><div class="empty">Nothing to offboard right now.</div></section>';
      return;
    }
    var blocks = exits
      .map(function (x) {
        var e = empById(x.employeeId) || {
          name: x.employeeId,
          designation: "",
          dept: "",
        };
        var done = S.exitChecklists[x.id] || [];
        var pct = Math.round((done.length / OFF_ITEMS.length) * 100);
        var items = OFF_ITEMS.map(function (it) {
          var d = done.indexOf(it) >= 0;
          return (
            '<li><input type="checkbox" data-hp2-off="' +
            x.id +
            '" data-hp2-item="' +
            esc(it) +
            '"' +
            (d ? " checked" : "") +
            '><span class="' +
            (d ? "done" : "") +
            '">' +
            esc(it) +
            "</span></li>"
          );
        }).join("");
        return (
          '<section class="card" style="margin-bottom:16px"><div class="card-head"><div><h2 style="font-size:15px">' +
          esc(e.name) +
          " · " +
          esc(e.designation || "") +
          "</h2>" +
          '<div class="sub">Last day ' +
          (x.lastDay || "—") +
          " · " +
          pct +
          "% complete</div></div>" +
          '<div style="min-width:150px"><span class="hrx-barwrap"><span class="hrx-bar"><i style="width:' +
          pct +
          '%"></i></span><span class="hrx-pct">' +
          pct +
          "%</span></span></div></div>" +
          '<ul class="hp2-check">' +
          items +
          "</ul></section>"
        );
      })
      .join("");
    root.innerHTML =
      '<div class="hr-plus2-head"><div><h2>Offboarding</h2><div class="sub">Exit checklist for departing employees — mirrors the new-joiner onboarding flow. Progress is saved.</div></div></div>' +
      blocks;
  }
  function toggleOff(exitId, item, on) {
    var arr = S.exitChecklists[exitId] || (S.exitChecklists[exitId] = []);
    var i = arr.indexOf(item);
    if (on && i < 0) arr.push(item);
    else if (!on && i >= 0) arr.splice(i, 1);
    save();
    var root = $id("hrPlusRoot");
    if (root) renderOffboard(root);
  }

  /* ============================================================
     Register routes + nav (into the shared HRP.routes)
     ============================================================ */
  window.HRP.routes["Org Chart"] = { icon: "users", render: renderOrg };
  window.HRP.routes["Offboarding"] = {
    icon: "clipboardCheck",
    render: renderOffboard,
  };

  function injectNav() {
    var nav = $id("nav");
    if (!nav) return;
    if (nav.querySelector('.nav-item[data-page="Org Chart"]')) return; // already added — never duplicate
    ["Org Chart", "Offboarding"].forEach(function (name) {
      var b = doc.createElement("button");
      b.className = "nav-item";
      b.setAttribute("data-page", name);
      b.title = name;
      b.innerHTML =
        iconOf(window.HRP.routes[name].icon) +
        '<span class="nav-text">' +
        esc(name) +
        "</span>";
      b.addEventListener("click", function () {
        navigate(name);
      });
      nav.appendChild(b);
    });
  }

  /* clicks for the two new views (separate delegated handler) */
  function onClick(ev) {
    var t = ev.target;
    var ea = t.closest && t.closest("[data-hp2-act]");
    if (ea && ea.getAttribute("data-hp2-act") === "expandAll") {
      $id("hp2OrgWrap")
        .querySelectorAll("details")
        .forEach(function (d) {
          d.open = true;
        });
      return;
    }
    var off = t.closest && t.closest("[data-hp2-off]");
    if (off && off.tagName === "INPUT") {
      toggleOff(
        off.getAttribute("data-hp2-off"),
        off.getAttribute("data-hp2-item"),
        off.checked,
      );
      return;
    }
  }

  function boot() {
    if (window.__hp2Booted) return;
    window.__hp2Booted = true; // run once, whatever fires us
    injectCss();
    injectNav();
    addCsvButton();
    var root = $id("hrPlusRoot");
    if (root) {
      root.addEventListener("click", onClick);
    }
  }
  if (doc.readyState === "loading")
    doc.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
/* ===== ADDED FEATURE — Enhancement Pass 2 (JavaScript) · end ===== */

/* ===== portal inline block 6/11 (externalized for CSP; order preserved) ===== */

("use strict");
/* ============================================================
   ADDED FEATURE — Enhancement Pass 3 (JavaScript) · start
   A new <script> block. No existing script line was edited.
   Adds, additively, three things asked for next:
     • Role-based views  — a Employee / Manager / HR Admin switcher
       in the top bar that hides admin-only modules & actions.
     • Reporting (Analytics) — a new report screen with department
       & period filters, click-through drill-down, headcount &
       recruitment/leave charts, CSV + Print/PDF export.
     • Polish — dark/light theme toggle, a dismissible guided tour,
       plus accessibility & mobile touches (skip link, focus rings,
       print stylesheet, responsive controls).
   Reuses ONLY the public surface already exposed by earlier blocks:
     window.HRX.store / .helpers / .save / .renderRoute / .route
     window.HRP.routes                       (renders into #hrPlusRoot)
     navigate, icon, toast, openModal, closeModal, $  (globals)
     employeeLeaveRequests, MONTHS                    (Leave data)
   Every new name is prefixed hp3 / hr-plus3- / HP3. All new state
   lives under its own localStorage keys, so the store snapshot is
   untouched. The default role is HR Admin, so with no interaction
   the portal behaves EXACTLY as before (all earlier tests hold).
   ============================================================ */
(function () {
  if (!window.HRX || !window.HRX.store) {
    return;
  }
  var doc = document,
    S = window.HRX.store;
  function $id(x) {
    return doc.getElementById(x);
  }
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
  function iconOf(n, s) {
    return typeof icon === "function" ? icon(n, s) : "";
  }
  function toastX(m) {
    if (typeof toast === "function") toast(m);
  }
  function money(n) {
    return "₹" + Number(n || 0).toLocaleString("en-IN");
  }
  function empById(id) {
    return (S.employees || []).find(function (e) {
      return e.id === id;
    });
  }
  function deptName(id) {
    return window.HRX.helpers && window.HRX.helpers.deptName
      ? window.HRX.helpers.deptName(id)
      : id;
  }
  function initials(n) {
    return String(n || "?")
      .split(" ")
      .map(function (w) {
        return w[0];
      })
      .join("")
      .slice(0, 2)
      .toUpperCase();
  }
  var MON =
    typeof MONTHS !== "undefined"
      ? MONTHS
      : [
          "Jan",
          "Feb",
          "Mar",
          "Apr",
          "May",
          "Jun",
          "Jul",
          "Aug",
          "Sep",
          "Oct",
          "Nov",
          "Dec",
        ];
  function nice(iso) {
    if (!iso) return "—";
    var p = String(iso).split("-");
    if (p.length < 3) return iso;
    return +p[2] + " " + MON[+p[1] - 1] + " " + p[0];
  }
  function saveSoon() {
    if (window.HRX && typeof window.HRX.save === "function") {
      try {
        window.HRX.save();
      } catch (e) {}
    }
  }

  /* small localStorage wrapper (own keys — store snapshot untouched) */
  var LS_ROLE = "cyethackHRP.role",
    LS_THEME = "cyethackHRP.theme",
    LS_TOUR = "cyethackHRP.tour";
  function lsGet(k, d) {
    try {
      var v = localStorage.getItem(k);
      return v == null ? d : v;
    } catch (e) {
      return d;
    }
  }
  function lsSet(k, v) {
    try {
      localStorage.setItem(k, v);
    } catch (e) {}
  }

  /* ============================================================
     Scoped styles (injected once; no existing CSS touched)
     ============================================================ */
  function injectCss() {
    if ($id("hrPlus3Styles")) return;
    var st = doc.createElement("style");
    st.id = "hrPlus3Styles";
    st.textContent = [
      /* ---- top-bar controls: role switcher + theme + help ---- */
      "#hp3Controls{display:flex;align-items:center;gap:8px}",
      ".hp3-rolesw{display:inline-flex;background:var(--surface);border:1px solid var(--border);border-radius:999px;padding:3px;gap:2px}",
      ".hp3-role{appearance:none;border:0;background:transparent;color:var(--text-2);font-family:var(--font);font-size:12px;font-weight:600;padding:5px 12px;border-radius:999px;cursor:pointer;display:inline-flex;align-items:center;gap:6px;white-space:nowrap}",
      ".hp3-role:hover{color:var(--text)}",
      ".hp3-role.hp3-role-on{background:var(--teal);color:#fff;box-shadow:0 1px 4px rgba(0,0,0,.25)}",
      ".hp3-role svg{width:14px;height:14px}",
      ".hp3-icon{position:relative}",
      ".hp3-icon.hp3-help{font-size:15px;font-weight:700}",
      /* ---- read-only role banner ---- */
      ".hp3-rolebar{display:flex;align-items:center;gap:10px;background:var(--amber-tint);border:1px solid var(--amber);color:var(--text);border-radius:10px;padding:9px 14px;margin:0 0 16px;font-size:13px}",
      ".hp3-rolebar .ic{display:inline-flex;color:var(--amber)}",
      ".hp3-rolebar b{font-weight:600}",
      ".hp3-rolebar button{margin-left:auto;flex:0 0 auto}",
      /* ---- analytics ---- */
      ".hp3-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:12px}",
      ".hp3-head h2{font-size:18px;font-weight:600}.hp3-head .sub{font-size:12px;color:var(--text-2);margin-top:2px}",
      ".hp3-head .tools{display:flex;gap:8px;flex-wrap:wrap;align-items:center}",
      ".hp3-filters{display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;margin-bottom:16px}",
      ".hp3-filters .f{display:flex;flex-direction:column;gap:4px}",
      ".hp3-filters label{font-size:11px;color:var(--text-2);font-weight:600;text-transform:uppercase;letter-spacing:.04em}",
      ".hp3-filters select{height:36px;min-width:150px;padding:0 10px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text);font-family:var(--font);font-size:13px}",
      ".hp3-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:16px}",
      ".hp3-kpi{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:14px 16px}",
      ".hp3-kpi .v{font-size:24px;font-weight:700;font-family:var(--mono);line-height:1.1}",
      ".hp3-kpi .l{font-size:12px;color:var(--text-2);margin-top:4px}",
      ".hp3-kpi .d{font-size:11px;margin-top:6px;font-weight:600}",
      ".hp3-grid2{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px}",
      "@media (max-width:1000px){.hp3-grid2{grid-template-columns:1fr}}",
      ".hp3-chartcard{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:16px}",
      ".hp3-chartcard h3{font-size:14px;font-weight:600;margin-bottom:2px}.hp3-chartcard .sub{font-size:11px;color:var(--text-2);margin-bottom:12px}",
      ".hp3-svg{width:100%;height:auto;display:block}",
      ".hp3-bars{display:flex;flex-direction:column;gap:9px}",
      ".hp3-barrow{display:grid;grid-template-columns:130px 1fr 44px;align-items:center;gap:10px;font-size:12px}",
      ".hp3-barrow .nm{color:var(--text-2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
      ".hp3-track{height:20px;background:var(--bg);border:1px solid var(--border);border-radius:6px;overflow:hidden}",
      ".hp3-fill{height:100%;border-radius:6px 0 0 6px;min-width:2px;transition:width .5s cubic-bezier(.4,0,.2,1)}",
      ".hp3-barrow .vl{text-align:right;font-family:var(--mono);color:var(--text);font-weight:600}",
      ".hp3-clk{cursor:pointer}.hp3-clk:hover .hp3-track{border-color:var(--teal)}.hp3-clk:hover .nm{color:var(--text)}",
      ".hp3-legend{display:flex;flex-wrap:wrap;gap:14px;margin-top:12px;font-size:11px;color:var(--text-2)}",
      ".hp3-legend span{display:inline-flex;align-items:center;gap:6px}",
      ".hp3-legend i{width:10px;height:10px;border-radius:3px;display:inline-block}",
      ".hp3-drillnote{display:inline-flex;align-items:center;gap:8px;font-size:12px;color:var(--text-2);background:var(--teal-tint);border:1px solid var(--teal);border-radius:999px;padding:4px 12px}",
      ".hp3-drillnote button{appearance:none;border:0;background:transparent;color:var(--teal-bright);font-weight:700;cursor:pointer;font-size:13px;line-height:1}",
      /* ---- guided tour ---- */
      ".hp3-tourlayer{position:fixed;inset:0;z-index:400;pointer-events:auto}",
      ".hp3-tourscrim{position:absolute;inset:0;background:rgba(3,7,18,.55)}",
      ".hp3-tourhole{position:absolute;border-radius:12px;box-shadow:0 0 0 4px var(--teal),0 0 0 9999px rgba(3,7,18,.55);transition:all .25s ease;pointer-events:none}",
      ".hp3-tourcard{position:absolute;width:300px;max-width:calc(100vw - 32px);background:var(--surface);border:1px solid var(--border);border-radius:14px;box-shadow:var(--shadow-pop);padding:16px;z-index:401}",
      ".hp3-tourcard h4{font-size:15px;font-weight:600;margin-bottom:6px}",
      ".hp3-tourcard p{font-size:13px;color:var(--text-2);line-height:1.55}",
      ".hp3-tourcard .row{display:flex;align-items:center;justify-content:space-between;margin-top:14px;gap:8px}",
      ".hp3-tourcard .dots{display:flex;gap:5px}.hp3-tourcard .dots i{width:6px;height:6px;border-radius:50%;background:var(--border)}.hp3-tourcard .dots i.on{background:var(--teal)}",
      ".hp3-tourcard .btns{display:flex;gap:8px}",
      /* ---- accessibility: skip link + visible focus ---- */
      ".hp3-skip{position:fixed;left:-999px;top:8px;z-index:600;background:var(--teal);color:#fff;padding:9px 16px;border-radius:8px;font-size:13px;font-weight:600;text-decoration:none}",
      ".hp3-skip:focus{left:8px}",
      "a.hp3-skip:focus-visible{outline:2px solid #fff;outline-offset:2px}",
      ".nav-item:focus-visible,.icon-btn:focus-visible,.btn:focus-visible,.hp3-role:focus-visible,.avatar:focus-visible,.hrx-tab:focus-visible{outline:2px solid var(--teal-bright);outline-offset:2px}",
      "@media (prefers-reduced-motion:reduce){.hp3-fill,.hp3-tourhole{transition:none}}",
      /* ---- responsive: keep the new controls usable on small screens ---- */
      "@media (max-width:1180px){.hp3-role .lbl{display:none}.hp3-role{padding:6px 9px}}",
      "@media (max-width:760px){#hp3Controls{gap:6px}.hp3-rolesw{padding:2px}.hp3-barrow{grid-template-columns:96px 1fr 40px}}",
      /* ---- light theme (opt-in via body.hp3-light; only overrides tokens) ---- */
      "body.hp3-light{",
      "--bg:#EEF2F7;--sidebar:#FFFFFF;--surface:#FFFFFF;--border:#E2E8F0;",
      "--hover:#F1F5F9;--hover-border:#CBD5E1;--text:#0F1B2D;--text-2:#516074;--muted:#8A98AB;",
      "--teal-tint:rgba(80,152,136,.14);--green-tint:rgba(22,163,74,.14);--amber-tint:rgba(217,119,6,.16);",
      "--red-tint:rgba(220,38,38,.12);--blue-tint:rgba(37,99,235,.12);--violet-tint:rgba(124,58,237,.14);",
      "--scrim:rgba(15,23,42,.42);--shadow:0 4px 16px rgba(15,23,42,.10);--shadow-pop:0 12px 32px rgba(15,23,42,.20);}",
      "body.hp3-light .sidebar{box-shadow:1px 0 0 var(--border)}",
      "body.hp3-light .logo-name{color:var(--text)}",
      "body.hp3-light .topbar{box-shadow:0 1px 0 var(--border)}",
      /* ---- print / Save as PDF (Analytics export + payslips) ---- */
      "@media print{",
      ".sidebar,.topbar,.mobile-scrim,#hp2Csv,#hrPlusWhatsNew,#hp3Controls,.hp3-rolebar,.hp3-tourlayer,.hp3-skip,#toasts,#tooltip{display:none!important}",
      ".app{display:block!important}.main{margin:0!important}.content{padding:0!important;overflow:visible!important;height:auto!important}",
      ".card,.hp3-chartcard,.hp3-kpi{break-inside:avoid;box-shadow:none!important}",
      "body{background:#fff!important;color:#000!important}",
      "}",
    ].join("");
    doc.head.appendChild(st);
  }

  /* ============================================================
     PART A — ROLE-BASED VIEWS
     ============================================================ */
  var PERSONA = {
    admin: "CHS-0001",
    manager: "CHS-0004",
    employee: "CHS-0008",
  };
  var ROLE_LABEL = {
    admin: "HR Admin",
    manager: "Manager",
    employee: "Employee",
  };
  var ROLE_ICON = { admin: "settings", manager: "userCheck", employee: "user" };

  /* pages each role may see (admin => everything, no filtering) */
  var PAGES_EMP = [
    "Dashboard",
    "Leave",
    "My Profile",
    "Notice Board",
    "Helpdesk",
  ];
  var PAGES_MGR = [
    "Dashboard",
    "Employees",
    "Attendance",
    "Leave",
    "Performance",
    "Projects",
    "Reports",
    "Analytics",
    "Leave Approvals",
    "Offboarding",
    "Org Chart",
    "My Profile",
    "Notice Board",
    "Helpdesk",
  ];
  function allowedPages(r) {
    return r === "admin" ? null : r === "manager" ? PAGES_MGR : PAGES_EMP;
  }

  /* write-actions to hide, by role (admin hides nothing) */
  var HIDE_EMP = [
    "[data-hrx-add]",
    '[data-hrx-act]:not([data-hrx-act="view"])',
    '[data-hrx-special^="onb:"]',
    '[data-act="approve"]',
    '[data-act="reject"]',
    '[data-hp-act="newNotice"]',
    '[data-hp-act="pin"]',
    '[data-hp-act="delNotice"]',
    '[data-hp-act="advTicket"]',
    '[data-hp-act="appr"]',
    '[data-hp-act="rej"]',
    "[data-hp2-off]",
    '[data-hp2-act="expandAll"]',
  ].join(",");
  var HIDE_MGR = [
    "[data-hrx-add]",
    '[data-hrx-act]:not([data-hrx-act="view"])',
    '[data-hrx-special^="pay:"]',
    '[data-hp-act="newNotice"]',
    '[data-hp-act="pin"]',
    '[data-hp-act="delNotice"]',
  ].join(",");
  function hideSelector(r) {
    return r === "admin" ? null : r === "manager" ? HIDE_MGR : HIDE_EMP;
  }

  var role = (function () {
    var r = lsGet(LS_ROLE, "admin");
    return r === "employee" || r === "manager" || r === "admin" ? r : "admin";
  })();
  var curPage = "Dashboard";

  function applyNav() {
    var nav = $id("nav");
    if (!nav) return;
    var allow = allowedPages(role);
    nav.querySelectorAll(".nav-item[data-page]").forEach(function (b) {
      var p = b.getAttribute("data-page");
      b.style.display = !allow || allow.indexOf(p) >= 0 ? "" : "none";
    });
    /* hide a section label if every item under it is hidden */
    var kids = Array.prototype.slice.call(nav.children),
      i,
      lab = null,
      seen = false;
    for (i = 0; i < kids.length; i++) {
      var el = kids[i];
      if (el.classList.contains("nav-label")) {
        if (lab) lab.style.display = seen ? "" : "none";
        lab = el;
        seen = false;
      } else if (
        el.classList.contains("nav-item") &&
        el.style.display !== "none"
      ) {
        seen = true;
      }
    }
    if (lab) lab.style.display = seen ? "" : "none";
  }

  function applyButtons() {
    var sel = hideSelector(role);
    var scope = $id("content");
    if (!scope) return;
    if (!sel) return; // admin: nothing hidden
    scope.querySelectorAll(sel).forEach(function (el) {
      var host = el.closest("button, label, a, .hrx-actbtns > *");
      (host || el).style.display = "none";
    });
  }

  function applyChrome() {
    /* Quick Action create menu — admin only */
    var q = $id("quickBtn");
    if (q && q.parentNode)
      q.parentNode.style.display = role === "admin" ? "" : "none";
    /* sidebar + topbar identity reflect the active persona */
    var e = empById(PERSONA[role]) ||
      empById("CHS-0001") || {
        name: (window.__hrUser && window.__hrUser.name) || "Employee",
        designation: (window.__hrUser && window.__hrUser.role) || "",
      };
    var who = doc.querySelector(".profile .who");
    if (who) {
      var b = who.querySelector("b"),
        s = who.querySelector("span");
      if (b) b.textContent = e.name;
      if (s) s.textContent = ROLE_LABEL[role] + " · " + (e.designation || "");
    }
    var sav = doc.querySelector(".profile .avatar");
    if (sav) sav.textContent = initials(e.name);
    var av = $id("avatarBtn");
    if (av) av.textContent = initials(e.name);
    /* read-only banner */
    ensureRoleBar();
  }

  function ensureRoleBar() {
    var content = $id("content");
    if (!content) return;
    var bar = $id("hp3RoleBar");
    if (role === "admin") {
      if (bar) bar.hidden = true;
      return;
    }
    if (!bar) {
      bar = doc.createElement("div");
      bar.id = "hp3RoleBar";
      bar.className = "hp3-rolebar";
      bar.setAttribute("role", "status");
      content.insertBefore(bar, content.firstChild);
    }
    bar.hidden = false;
    bar.innerHTML =
      '<span class="ic" aria-hidden="true">' +
      iconOf(ROLE_ICON[role], 16) +
      "</span>" +
      "<span>Viewing as <b>" +
      ROLE_LABEL[role] +
      "</b>" +
      (role === "employee"
        ? " — you see your own workspace; management actions are hidden."
        : " — create &amp; edit for others is hidden; you can still review and approve.") +
      "</span>" +
      '<button class="btn btn-outline btn-sm" data-hp3-role="admin">Switch to HR Admin</button>';
    if (content.firstChild !== bar)
      content.insertBefore(bar, content.firstChild);
  }

  function applyRole() {
    doc.body.classList.remove(
      "hp3-role-admin",
      "hp3-role-manager",
      "hp3-role-employee",
    );
    doc.body.classList.add("hp3-role-" + role);
    applyNav();
    applyChrome();
    applyButtons();
    syncRoleSwitch();
  }

  function setRole(r) {
    if (r === role || !ROLE_LABEL[r]) {
      if (r === role) {
        /* still refresh */
      } else return;
    }
    role = r;
    lsSet(LS_ROLE, r);
    if (S) S.currentUser = PERSONA[r]; // switch "logged-in" persona for self-service
    applyRole();
    var allow = allowedPages(role);
    if (allow && allow.indexOf(curPage) < 0) {
      if (typeof navigate === "function") navigate("Dashboard");
    } else {
      applyButtons();
    }
    /* refresh any open plus route so persona-specific screens update */
    if (window.HRP && window.HRP.routes && window.HRP.routes[curPage]) {
      var pr = $id("hrPlusRoot");
      if (pr && !pr.hidden) window.HRP.routes[curPage].render(pr);
    }
    saveSoon();
    toastX("Now viewing as " + ROLE_LABEL[role]);
  }

  function syncRoleSwitch() {
    var sw = $id("hp3RoleSw");
    if (!sw) return;
    sw.querySelectorAll(".hp3-role").forEach(function (b) {
      var on = b.getAttribute("data-hp3-role") === role;
      b.classList.toggle("hp3-role-on", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }

  /* ============================================================
     PART B — THEME TOGGLE
     ============================================================ */
  var theme = lsGet(LS_THEME, "dark") === "light" ? "light" : "dark";
  var SUN =
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
  var MOON =
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';
  function applyTheme() {
    doc.body.classList.toggle("hp3-light", theme === "light");
    var btn = $id("hp3Theme");
    if (btn) {
      btn.innerHTML = theme === "light" ? MOON : SUN;
      btn.setAttribute(
        "title",
        theme === "light" ? "Switch to dark" : "Switch to light",
      );
      btn.setAttribute(
        "aria-label",
        theme === "light" ? "Switch to dark theme" : "Switch to light theme",
      );
    }
  }
  function toggleTheme() {
    theme = theme === "light" ? "dark" : "light";
    lsSet(LS_THEME, theme);
    applyTheme();
    toastX(theme === "light" ? "Light theme on" : "Dark theme on");
  }

  /* ============================================================
     Build the top-bar controls (role switcher + theme + help)
     ============================================================ */
  function buildControls() {
    if ($id("hp3Controls")) return;
    var anchor = $id("quickBtn");
    anchor = anchor ? anchor.parentNode : null;
    var bar = doc.querySelector(".topbar");
    if (!bar) return;
    var wrap = doc.createElement("div");
    wrap.id = "hp3Controls";
    var sw =
      '<div class="hp3-rolesw" id="hp3RoleSw" role="group" aria-label="View the portal as a role">' +
      ["employee", "manager", "admin"]
        .map(function (r) {
          return (
            '<button type="button" class="hp3-role" data-hp3-role="' +
            r +
            '" aria-pressed="false">' +
            iconOf(ROLE_ICON[r], 14) +
            '<span class="lbl">' +
            ROLE_LABEL[r] +
            "</span></button>"
          );
        })
        .join("") +
      "</div>";
    wrap.innerHTML =
      sw +
      '<button type="button" class="icon-btn hp3-icon" id="hp3Theme" aria-label="Switch theme"></button>' +
      '<button type="button" class="icon-btn hp3-icon hp3-help" id="hp3Help" aria-label="Take a quick tour" title="Take a quick tour">?</button>';
    if (anchor && anchor.parentNode)
      anchor.parentNode.insertBefore(wrap, anchor);
    else bar.appendChild(wrap);
    wrap.addEventListener("click", function (ev) {
      var r = ev.target.closest("[data-hp3-role]");
      if (r) {
        setRole(r.getAttribute("data-hp3-role"));
        return;
      }
      if (ev.target.closest("#hp3Theme")) {
        toggleTheme();
        return;
      }
      if (ev.target.closest("#hp3Help")) {
        startTour(true);
        return;
      }
    });
    syncRoleSwitch();
  }

  /* skip-to-content link (accessibility) */
  function addSkipLink() {
    if ($id("hp3Skip")) return;
    var a = doc.createElement("a");
    a.id = "hp3Skip";
    a.className = "hp3-skip";
    a.href = "#content";
    a.textContent = "Skip to content";
    a.addEventListener("click", function (ev) {
      ev.preventDefault();
      var c = $id("content");
      if (c) {
        c.setAttribute("tabindex", "-1");
        c.focus();
      }
    });
    doc.body.insertBefore(a, doc.body.firstChild);
  }

  /* ============================================================
     PART C — REPORTING / ANALYTICS  (renders into #hrPlusRoot)
     ============================================================ */
  var DEPTCLR = [
    "var(--teal)",
    "var(--violet)",
    "var(--blue)",
    "var(--orange)",
    "var(--amber)",
    "var(--green)",
  ];
  var STATCLR = {
    Active: "var(--green)",
    Probation: "var(--amber)",
    "On Leave": "var(--blue)",
  };
  var LEAVECLR = [
    "var(--teal)",
    "var(--violet)",
    "var(--blue)",
    "var(--orange)",
    "var(--amber)",
    "var(--green)",
    "var(--red)",
  ];
  var fDept = "all",
    fStatus = "all",
    fWin = 6;

  function empsScoped() {
    return (S.employees || []).filter(function (e) {
      return (
        (fDept === "all" || e.dept === fDept) &&
        (fStatus === "all" || e.status === fStatus)
      );
    });
  }
  function lastMonths(n) {
    var out = [],
      now = new Date();
    for (var i = n - 1; i >= 0; i--) {
      var t = new Date(now.getFullYear(), now.getMonth() - i, 1);
      out.push({
        y: t.getFullYear(),
        m: t.getMonth(),
        k: t.getFullYear() + "-" + String(t.getMonth() + 1).padStart(2, "0"),
        lab: MON[t.getMonth()],
      });
    }
    return out;
  }
  function sameMonth(iso, m) {
    return iso && String(iso).slice(0, 7) === m.k;
  }
  function endOf(m) {
    return new Date(m.y, m.m + 1, 0);
  }
  function headTrend(dept, months) {
    var es = (S.employees || []).filter(function (e) {
        return dept === "all" || e.dept === dept;
      }),
      xs = S.exits || [];
    return months.map(function (m) {
      var end = endOf(m),
        c = 0;
      es.forEach(function (e) {
        var jd = e.joining ? new Date(e.joining) : null;
        if (jd && jd <= end) {
          var x = xs.find(function (z) {
            return z.employeeId === e.id;
          });
          var ld = x && x.lastDay ? new Date(x.lastDay) : null;
          if (!ld || ld > end) c++;
        }
      });
      return c;
    });
  }
  function avgTenure(list) {
    if (!list.length) return 0;
    var now = new Date(),
      sum = 0,
      n = 0;
    list.forEach(function (e) {
      if (e.joining) {
        sum += (now - new Date(e.joining)) / (365.25 * 864e5);
        n++;
      }
    });
    return n ? Math.round((sum / n) * 10) / 10 : 0;
  }
  function jobDept(jobId) {
    var j = (S.jobs || []).find(function (x) {
      return x.id === jobId;
    });
    return j ? j.dept : null;
  }
  function recruitFunnel(dept) {
    var cs = (S.candidates || []).filter(function (c) {
      return dept === "all" || jobDept(c.jobId) === dept;
    });
    function cnt(f) {
      return cs.filter(f).length;
    }
    return [
      {
        key: "applied",
        label: "Applied",
        value: cs.length,
        color: "var(--blue)",
      },
      {
        key: "screen",
        label: "Screening / Shortlist",
        value: cnt(function (c) {
          return /screen|shortlist/i.test(c.stage);
        }),
        color: "var(--violet)",
      },
      {
        key: "interview",
        label: "Interview rounds",
        value: cnt(function (c) {
          return /interview|round/i.test(c.stage);
        }),
        color: "var(--amber)",
      },
      {
        key: "selected",
        label: "Selected",
        value: cnt(function (c) {
          return /selected/i.test(c.stage);
        }),
        color: "var(--green)",
      },
    ];
  }
  function leaveTypes() {
    var reqs =
      typeof employeeLeaveRequests !== "undefined" && employeeLeaveRequests
        ? employeeLeaveRequests
        : [];
    var m = {};
    reqs.forEach(function (r) {
      m[r.type] = (m[r.type] || 0) + (Number(r.days) || 1);
    });
    var keys = Object.keys(m);
    return keys
      .map(function (k, i) {
        return {
          key: k,
          label: k,
          value: m[k],
          color: LEAVECLR[i % LEAVECLR.length],
        };
      })
      .sort(function (a, b) {
        return b.value - a.value;
      });
  }
  function barsHtml(rows, opt) {
    opt = opt || {};
    if (!rows.length)
      return '<div class="empty" style="padding:14px 0;color:var(--text-2);font-size:13px">No data for this filter.</div>';
    var max = Math.max.apply(
      null,
      rows
        .map(function (r) {
          return r.value;
        })
        .concat([1]),
    );
    return (
      '<div class="hp3-bars">' +
      rows
        .map(function (r) {
          var pct = Math.round((r.value / max) * 100);
          var clk = opt.drill ? " hp3-clk" : "";
          var attr = opt.drill
            ? ' data-hp3-drill="' +
              esc(opt.drill + ":" + r.key) +
              '" role="button" tabindex="0" aria-label="Filter by ' +
              esc(r.label) +
              '"'
            : "";
          var on =
            opt.active != null && String(opt.active) === String(r.key)
              ? ' style="outline:2px solid var(--teal);outline-offset:1px"'
              : "";
          var val = opt.fmt ? opt.fmt(r.value) : r.value;
          return (
            '<div class="hp3-barrow' +
            clk +
            '"' +
            attr +
            '><span class="nm" title="' +
            esc(r.label) +
            '">' +
            esc(r.label) +
            "</span>" +
            '<span class="hp3-track"' +
            on +
            '><span class="hp3-fill" style="width:' +
            pct +
            "%;background:" +
            (r.color || "var(--teal)") +
            '"></span></span>' +
            '<span class="vl">' +
            esc(String(val)) +
            "</span></div>"
          );
        })
        .join("") +
      "</div>"
    );
  }
  function lineSVG(labels, vals, label) {
    var w = 560,
      h = 200,
      padL = 32,
      padR = 12,
      padT = 14,
      padB = 24,
      n = vals.length;
    var max = Math.max.apply(null, vals.concat([1])),
      min = 0,
      iw = w - padL - padR,
      ih = h - padT - padB;
    var X = function (i) {
      return padL + (n <= 1 ? iw / 2 : (i * iw) / (n - 1));
    };
    var Y = function (v) {
      return padT + ih - ((v - min) / (max - min || 1)) * ih;
    };
    var pts = vals.map(function (v, i) {
      return X(i).toFixed(1) + "," + Y(v).toFixed(1);
    });
    var grid = "",
      ticks = 4,
      g,
      gv,
      gy;
    for (g = 0; g <= ticks; g++) {
      gv = min + ((max - min) * g) / ticks;
      gy = Y(gv);
      grid +=
        '<line x1="' +
        padL +
        '" y1="' +
        gy.toFixed(1) +
        '" x2="' +
        (w - padR) +
        '" y2="' +
        gy.toFixed(1) +
        '" stroke="var(--border)" stroke-width="1"/><text x="' +
        (padL - 6) +
        '" y="' +
        (gy + 3).toFixed(1) +
        '" text-anchor="end" font-size="9" fill="var(--text-2)">' +
        Math.round(gv) +
        "</text>";
    }
    var area =
      "M" +
      X(0).toFixed(1) +
      "," +
      (padT + ih).toFixed(1) +
      " L" +
      pts.join(" L") +
      " L" +
      X(n - 1).toFixed(1) +
      "," +
      (padT + ih).toFixed(1) +
      " Z";
    var dots = vals
      .map(function (v, i) {
        return (
          '<circle cx="' +
          X(i).toFixed(1) +
          '" cy="' +
          Y(v).toFixed(1) +
          '" r="3.2" fill="var(--teal-bright)" stroke="var(--surface)" stroke-width="1.5"/>'
        );
      })
      .join("");
    var xl = labels
      .map(function (l, i) {
        return (
          '<text x="' +
          X(i).toFixed(1) +
          '" y="' +
          (h - 7) +
          '" text-anchor="middle" font-size="9" fill="var(--text-2)">' +
          esc(l) +
          "</text>"
        );
      })
      .join("");
    return (
      '<svg viewBox="0 0 ' +
      w +
      " " +
      h +
      '" class="hp3-svg" role="img" aria-label="' +
      esc(label || "trend") +
      '">' +
      grid +
      '<path d="' +
      area +
      '" fill="var(--teal-tint)"/><polyline points="' +
      pts.join(" ") +
      '" fill="none" stroke="var(--teal)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>' +
      dots +
      xl +
      "</svg>"
    );
  }
  function chartCard(title, sub, inner) {
    return (
      '<section class="hp3-chartcard"><h3>' +
      esc(title) +
      '</h3><div class="sub">' +
      esc(sub) +
      "</div>" +
      inner +
      "</section>"
    );
  }
  function kpi(v, l, d, dc) {
    return (
      '<div class="hp3-kpi"><div class="v">' +
      esc(String(v)) +
      '</div><div class="l">' +
      esc(l) +
      "</div>" +
      (d
        ? '<div class="d" style="color:' +
          (dc || "var(--text-2)") +
          '">' +
          esc(d) +
          "</div>"
        : "") +
      "</div>"
    );
  }

  function renderAnalytics(root) {
    var all = S.employees || [],
      scoped = empsScoped(),
      months = lastMonths(fWin);
    var headcount = scoped.length;
    var joins = all.filter(function (e) {
      return (
        (fDept === "all" || e.dept === fDept) &&
        months.some(function (m) {
          return sameMonth(e.joining, m);
        })
      );
    }).length;
    var exitsArr = (S.exits || []).filter(function (x) {
      var e = empById(x.employeeId);
      return fDept === "all" || (e && e.dept === fDept);
    });
    var totalHead =
      fDept === "all"
        ? all.length
        : all.filter(function (e) {
            return e.dept === fDept;
          }).length;
    var attrition = totalHead
      ? Math.round((exitsArr.length / totalHead) * 1000) / 10
      : 0;
    var payroll = scoped.reduce(function (a, e) {
      return a + (e.salary || 0);
    }, 0);
    var tenure = avgTenure(scoped);

    var byDept = (S.departments || []).map(function (d, i) {
      return {
        key: d.id,
        label: d.name,
        value: all.filter(function (e) {
          return e.dept === d.id;
        }).length,
        color: DEPTCLR[i % DEPTCLR.length],
      };
    });
    var STAT = ["Active", "Probation", "On Leave"];
    var byStatus = STAT.map(function (s) {
      return {
        key: s,
        label: s,
        value: all.filter(function (e) {
          return e.status === s;
        }).length,
        color: STATCLR[s] || "var(--teal)",
      };
    });
    var trend = headTrend(fDept, months);
    var joinsByMonth = months.map(function (m) {
      return {
        key: m.k,
        label: m.lab,
        value: all.filter(function (e) {
          return (
            (fDept === "all" || e.dept === fDept) && sameMonth(e.joining, m)
          );
        }).length,
        color: "var(--teal)",
      };
    });
    var funnel = recruitFunnel(fDept);
    var leaves = leaveTypes();

    var deptOpts =
      '<option value="all">All departments</option>' +
      (S.departments || [])
        .map(function (d) {
          return (
            '<option value="' +
            d.id +
            '"' +
            (fDept === d.id ? " selected" : "") +
            ">" +
            esc(d.name) +
            "</option>"
          );
        })
        .join("");
    var winOpts = [3, 6, 12]
      .map(function (m) {
        return (
          '<option value="' +
          m +
          '"' +
          (fWin === m ? " selected" : "") +
          ">Last " +
          m +
          " months</option>"
        );
      })
      .join("");
    var statOpts = ["all"]
      .concat(STAT)
      .map(function (s) {
        return (
          '<option value="' +
          s +
          '"' +
          (fStatus === s ? " selected" : "") +
          ">" +
          (s === "all" ? "All statuses" : s) +
          "</option>"
        );
      })
      .join("");

    var chips = "";
    if (fDept !== "all")
      chips +=
        '<span class="hp3-drillnote">Department: ' +
        esc(deptName(fDept)) +
        ' <button data-hp3-clear="dept" aria-label="Clear department filter">✕</button></span> ';
    if (fStatus !== "all")
      chips +=
        '<span class="hp3-drillnote">Status: ' +
        esc(fStatus) +
        ' <button data-hp3-clear="status" aria-label="Clear status filter">✕</button></span>';

    var det = scoped.slice().sort(function (a, b) {
      return a.dept < b.dept
        ? -1
        : a.dept > b.dept
          ? 1
          : a.name < b.name
            ? -1
            : 1;
    });
    var detRows = det.length
      ? det
          .map(function (e) {
            return (
              "<tr><td>" +
              esc(e.name) +
              "</td><td>" +
              esc(deptName(e.dept)) +
              "</td><td>" +
              esc(e.designation) +
              "</td>" +
              "<td>" +
              (typeof HRX.helpers.badge === "function"
                ? HRX.helpers.badge(e.status)
                : esc(e.status)) +
              '</td><td class="num">' +
              nice(e.joining) +
              '</td><td class="num">' +
              money(e.salary) +
              "</td></tr>"
            );
          })
          .join("")
      : '<tr><td colspan="6"><div class="empty">No employees match this filter.</div></td></tr>';

    root.innerHTML =
      '<div class="hp3-head"><div><h2>Analytics &amp; Reports</h2><div class="sub">Live view of the sample HR data. Filter by department or period, click any bar to drill in, then export.</div></div>' +
      '<div class="tools"><button class="btn btn-outline btn-sm" id="hp3Export">⤓ Export CSV</button><button class="btn btn-outline btn-sm" id="hp3Print">🖨 Print / PDF</button></div></div>' +
      '<div class="hp3-filters">' +
      '<div class="f"><label for="hp3fDept">Department</label><select id="hp3fDept" data-hp3-filter="dept">' +
      deptOpts +
      "</select></div>" +
      '<div class="f"><label for="hp3fWin">Period</label><select id="hp3fWin" data-hp3-filter="win">' +
      winOpts +
      "</select></div>" +
      '<div class="f"><label for="hp3fStat">Status</label><select id="hp3fStat" data-hp3-filter="status">' +
      statOpts +
      "</select></div>" +
      (chips
        ? '<div class="f" style="justify-content:center">' + chips + "</div>"
        : "") +
      "</div>" +
      '<div class="hp3-kpis">' +
      kpi(
        headcount,
        "Headcount" + (fDept === "all" ? "" : " · " + deptName(fDept)),
        "in current view",
      ) +
      kpi(joins, "New joins", "last " + fWin + " months", "var(--green)") +
      kpi(exitsArr.length, "Exits", "in notice / left", "var(--amber)") +
      kpi(
        attrition + "%",
        "Attrition",
        "of " + totalHead + " staff",
        attrition > 10 ? "var(--red)" : "var(--text-2)",
      ) +
      kpi(tenure + " yr", "Avg tenure", "across view") +
      kpi(money(payroll), "Monthly payroll", "in-hand total") +
      "</div>" +
      '<div class="hp3-grid2">' +
      chartCard(
        "Headcount by department",
        "Click a bar to filter the whole report",
        barsHtml(byDept, {
          drill: "dept",
          active: fDept === "all" ? null : fDept,
        }),
      ) +
      chartCard(
        "Headcount trend",
        "Employees on roll at month end · last " + fWin + " months",
        lineSVG(
          months.map(function (m) {
            return m.lab;
          }),
          trend,
          "Headcount trend",
        ),
      ) +
      "</div>" +
      '<div class="hp3-grid2">' +
      chartCard(
        "Workforce by status",
        "Click a bar to filter by status",
        barsHtml(byStatus, {
          drill: "status",
          active: fStatus === "all" ? null : fStatus,
        }),
      ) +
      chartCard(
        "New joins by month",
        "Hiring over the selected period",
        barsHtml(joinsByMonth, {}),
      ) +
      "</div>" +
      '<div class="hp3-grid2">' +
      chartCard(
        "Recruitment funnel",
        "Candidates by stage" +
          (fDept === "all" ? "" : " · " + deptName(fDept)),
        barsHtml(funnel, {}),
      ) +
      chartCard(
        "Leave requests by type",
        "Days requested across all recorded leave",
        barsHtml(leaves, {
          fmt: function (v) {
            return v + "d";
          },
        }),
      ) +
      "</div>" +
      '<section class="card"><div class="card-head"><div><h2>Employee detail</h2><div class="sub">' +
      det.length +
      " employee" +
      (det.length === 1 ? "" : "s") +
      " in the current view — this table is what Export / Print produces.</div></div></div>" +
      '<div class="table-scroll"><table id="hp3Detail"><thead><tr><th>Employee</th><th>Department</th><th>Designation</th><th>Status</th><th>Joined</th><th>Monthly salary</th></tr></thead><tbody>' +
      detRows +
      "</tbody></table></div></section>";
  }
  function reRenderAnalytics() {
    var r = $id("hrPlusRoot");
    if (r && !r.hidden && curPage === "Analytics") {
      renderAnalytics(r);
    }
  }

  /* CSV of the detail table */
  function csvCell(s) {
    s = String(s == null ? "" : s)
      .replace(/\s+/g, " ")
      .trim();
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function exportDetailCsv() {
    var t = $id("hp3Detail");
    if (!t) {
      toastX("Open Analytics to export");
      return;
    }
    var out = [];
    t.querySelectorAll("tr").forEach(function (tr) {
      var c = tr.querySelectorAll("th,td");
      if (!c.length) return;
      var row = [];
      c.forEach(function (x) {
        row.push(csvCell(x.innerText));
      });
      out.push(row.join(","));
    });
    var csv = out.join("\r\n"),
      name =
        "cyethack_analytics_" +
        (fDept === "all" ? "all" : deptName(fDept))
          .replace(/[^a-z0-9]+/gi, "_")
          .toLowerCase() +
        ".csv";
    try {
      var b = new Blob([csv], { type: "text/csv;charset=utf-8;" }),
        u = URL.createObjectURL(b),
        a = doc.createElement("a");
      a.href = u;
      a.download = name;
      doc.body.appendChild(a);
      a.click();
      setTimeout(function () {
        URL.revokeObjectURL(u);
        a.remove();
      }, 200);
    } catch (e) {
      var a2 = doc.createElement("a");
      a2.href = "data:text/csv;charset=utf-8," + encodeURIComponent(csv);
      a2.download = name;
      doc.body.appendChild(a2);
      a2.click();
      a2.remove();
    }
    toastX("Exported " + name);
  }

  function registerAnalytics() {
    if (!window.HRP || !window.HRP.routes) return;
    window.HRP.routes["Analytics"] = {
      icon: "barChart",
      render: renderAnalytics,
    };
    var nav = $id("nav");
    if (!nav || nav.querySelector('.nav-item[data-page="Analytics"]')) return;
    var b = doc.createElement("button");
    b.className = "nav-item";
    b.setAttribute("data-page", "Analytics");
    b.title = "Analytics";
    b.innerHTML =
      iconOf("barChart") + '<span class="nav-text">Analytics</span>';
    b.addEventListener("click", function () {
      navigate("Analytics");
    });
    var reports = nav.querySelector('.nav-item[data-page="Reports"]');
    if (reports && reports.parentNode)
      reports.parentNode.insertBefore(b, reports.nextSibling);
    else nav.appendChild(b);
  }

  /* analytics interactions (delegated on #hrPlusRoot) */
  function onAnaChange(ev) {
    var s = ev.target.closest && ev.target.closest("select[data-hp3-filter]");
    if (!s) return;
    var k = s.getAttribute("data-hp3-filter");
    if (k === "dept") fDept = s.value;
    else if (k === "win") fWin = parseInt(s.value, 10) || 6;
    else if (k === "status") fStatus = s.value;
    reRenderAnalytics();
  }
  function onAnaClick(ev) {
    var t = ev.target;
    if (t.closest && t.closest("#hp3Export")) {
      exportDetailCsv();
      return;
    }
    if (t.closest && t.closest("#hp3Print")) {
      if (window.print) window.print();
      return;
    }
    var clr = t.closest && t.closest("[data-hp3-clear]");
    if (clr) {
      var w = clr.getAttribute("data-hp3-clear");
      if (w === "dept") fDept = "all";
      else if (w === "status") fStatus = "all";
      reRenderAnalytics();
      return;
    }
    var dr = t.closest && t.closest("[data-hp3-drill]");
    if (dr) {
      applyDrill(dr.getAttribute("data-hp3-drill"));
      return;
    }
  }
  function onAnaKey(ev) {
    if (ev.key !== "Enter" && ev.key !== " ") return;
    var dr = ev.target.closest && ev.target.closest("[data-hp3-drill]");
    if (dr) {
      ev.preventDefault();
      applyDrill(dr.getAttribute("data-hp3-drill"));
    }
  }
  function applyDrill(code) {
    var p = String(code).split(":");
    if (p[0] === "dept") fDept = fDept === p[1] ? "all" : p[1];
    else if (p[0] === "status") fStatus = fStatus === p[1] ? "all" : p[1];
    reRenderAnalytics();
    var d = $id("hp3Detail");
    if (d) d.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  /* ============================================================
     PART D — GUIDED TOUR
     ============================================================ */
  var TOUR = [
    {
      sel: "#nav",
      t: "Your modules",
      b: "Everything lives in this sidebar — jump to any HR module from here.",
    },
    {
      sel: "#hp3RoleSw",
      t: "Role-based views",
      b: "Switch between Employee, Manager and HR Admin. Non-admin views hide management actions, so you can see the portal the way your team does.",
    },
    {
      sel: '[data-page="Analytics"]',
      t: "Reports & analytics",
      b: "Open Analytics for headcount, hiring and leave charts. Filter by department, click any bar to drill in, then export to CSV or PDF.",
    },
    {
      sel: "#hp3Theme",
      t: "Light or dark",
      b: "Prefer a lighter look? Toggle the theme any time — your choice is remembered on this device.",
    },
    {
      sel: "#searchBox",
      t: "Quick search",
      b: "Search people, leave and payroll. Tip: press “/” anywhere to jump straight here.",
    },
  ];
  var tourSteps = [],
    tourI = 0,
    tourKeyHandler = null,
    tourResize = null;
  function visibleEl(sel) {
    var el = doc.querySelector(sel);
    if (!el) return null;
    var r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return null;
    var cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") return null;
    return el;
  }
  function startTour(force) {
    if (!force) {
      if (lsGet(LS_TOUR, "") === "1") return;
    }
    tourSteps = TOUR.filter(function (s) {
      return visibleEl(s.sel);
    });
    if (!tourSteps.length) return;
    tourI = 0;
    buildTourLayer();
    showStep(0);
    lsSet(LS_TOUR, "1");
  }
  function buildTourLayer() {
    if ($id("hp3Tour")) return;
    var layer = doc.createElement("div");
    layer.id = "hp3Tour";
    layer.className = "hp3-tourlayer";
    layer.setAttribute("role", "dialog");
    layer.setAttribute("aria-modal", "true");
    layer.setAttribute("aria-label", "Product tour");
    layer.innerHTML =
      '<div class="hp3-tourscrim" data-hp3-tour="skip"></div><div class="hp3-tourhole" id="hp3Hole"></div><div class="hp3-tourcard" id="hp3TourCard"></div>';
    doc.body.appendChild(layer);
    layer.addEventListener("click", function (ev) {
      var a = ev.target.closest("[data-hp3-tour]");
      if (!a) return;
      var act = a.getAttribute("data-hp3-tour");
      if (act === "skip" || act === "done") closeTour();
      else if (act === "next") showStep(tourI + 1);
      else if (act === "back") showStep(tourI - 1);
    });
    tourKeyHandler = function (ev) {
      if (ev.key === "Escape") {
        closeTour();
      } else if (ev.key === "ArrowRight") {
        showStep(tourI + 1);
      } else if (ev.key === "ArrowLeft") {
        showStep(tourI - 1);
      } else if (ev.key === "Tab") {
        trapTab(ev);
      }
    };
    doc.addEventListener("keydown", tourKeyHandler, true);
    tourResize = function () {
      showStep(tourI);
    };
    window.addEventListener("resize", tourResize);
  }
  function trapTab(ev) {
    var card = $id("hp3TourCard");
    if (!card) return;
    var f = card.querySelectorAll("button");
    if (!f.length) return;
    var first = f[0],
      last = f[f.length - 1];
    if (ev.shiftKey && doc.activeElement === first) {
      ev.preventDefault();
      last.focus();
    } else if (!ev.shiftKey && doc.activeElement === last) {
      ev.preventDefault();
      first.focus();
    }
  }
  function showStep(i) {
    if (i < 0) i = 0;
    if (i >= tourSteps.length) {
      closeTour();
      return;
    }
    tourI = i;
    var step = tourSteps[i],
      el = visibleEl(step.sel);
    if (!el) {
      /* target vanished (e.g. role hid it) — skip ahead */ if (
        i + 1 <
        tourSteps.length
      ) {
        showStep(i + 1);
        return;
      }
      closeTour();
      return;
    }
    var r = el.getBoundingClientRect(),
      pad = 6;
    var hole = $id("hp3Hole");
    hole.style.left = r.left - pad + "px";
    hole.style.top = r.top - pad + "px";
    hole.style.width = r.width + pad * 2 + "px";
    hole.style.height = r.height + pad * 2 + "px";
    var card = $id("hp3TourCard");
    var dots = tourSteps
      .map(function (_, k) {
        return '<i class="' + (k === i ? "on" : "") + '"></i>';
      })
      .join("");
    var isLast = i === tourSteps.length - 1;
    card.innerHTML =
      "<h4>" +
      esc(step.t) +
      "</h4><p>" +
      step.b +
      "</p>" +
      '<div class="row"><div class="dots">' +
      dots +
      '</div><div class="btns">' +
      '<button class="btn btn-ghost btn-sm" data-hp3-tour="skip">Skip</button>' +
      (i > 0
        ? '<button class="btn btn-outline btn-sm" data-hp3-tour="back">Back</button>'
        : "") +
      '<button class="btn btn-primary btn-sm" data-hp3-tour="' +
      (isLast ? "done" : "next") +
      '">' +
      (isLast ? "Done" : "Next") +
      "</button>" +
      "</div></div>";
    /* position card: below the target, else above; clamp to viewport */
    var cw = Math.min(300, window.innerWidth - 24),
      ch = card.offsetHeight || 160,
      gap = 14,
      top,
      left;
    if (r.bottom + gap + ch < window.innerHeight - 8) top = r.bottom + gap;
    else if (r.top - gap - ch > 8) top = r.top - gap - ch;
    else top = Math.max(8, (window.innerHeight - ch) / 2);
    left = r.left + r.width / 2 - cw / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - cw - 8));
    card.style.width = cw + "px";
    card.style.left = left + "px";
    card.style.top = top + "px";
    var nextBtn = card.querySelector(
      '[data-hp3-tour="next"],[data-hp3-tour="done"]',
    );
    if (nextBtn) nextBtn.focus();
  }
  function closeTour() {
    var l = $id("hp3Tour");
    if (l) l.remove();
    if (tourKeyHandler) {
      doc.removeEventListener("keydown", tourKeyHandler, true);
      tourKeyHandler = null;
    }
    if (tourResize) {
      window.removeEventListener("resize", tourResize);
      tourResize = null;
    }
  }

  /* ============================================================
     Wiring: role clicks, navigate wrap, re-apply observers, boot
     ============================================================ */
  function onDocRoleClick(ev) {
    var r = ev.target.closest && ev.target.closest("[data-hp3-role]");
    if (r && !r.closest("#hp3Controls")) {
      setRole(r.getAttribute("data-hp3-role"));
    }
  }

  var applyQueued = false;
  function scheduleApply() {
    if (applyQueued) return;
    applyQueued = true;
    (window.requestAnimationFrame || setTimeout)(function () {
      applyQueued = false;
      applyNav();
      applyButtons();
    }, 0);
  }
  function observe() {
    if (!window.MutationObserver) return;
    var mo = new MutationObserver(scheduleApply);
    ["content", "nav"].forEach(function (idv) {
      var el = $id(idv);
      if (el) mo.observe(el, { childList: true, subtree: true });
    });
  }
  function afterNav(p) {
    applyButtons();
  }

  function boot() {
    if (window.__hp3Booted) return;
    window.__hp3Booted = true;
    injectCss();
    addSkipLink();
    buildControls();
    applyTheme();
    registerAnalytics();
    var pr = $id("hrPlusRoot");
    if (pr) {
      pr.addEventListener("change", onAnaChange);
      pr.addEventListener("click", onAnaClick);
      pr.addEventListener("keydown", onAnaKey);
    }
    doc.addEventListener("click", onDocRoleClick);
    if (S) S.currentUser = PERSONA[role]; // align persona with saved role
    var prevNav = navigate;
    navigate = function (p) {
      curPage = p;
      prevNav(p);
      afterNav(p);
    };
    observe();
    applyRole();
    setTimeout(applyRole, 120);
    setTimeout(applyRole, 400); // catch late nav injections
    setTimeout(function () {
      if (!window.HP3_NO_TOUR) startTour(false);
    }, 950); // HP3_NO_TOUR lets test harness skip the auto tour
  }
  if (doc.readyState === "loading")
    doc.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
/* ===== ADDED FEATURE — Enhancement Pass 3 (JavaScript) · end ===== */

/* ===== portal inline block 7/11 (externalized for CSP; order preserved) ===== */

("use strict");
/* ============================================================
   ADDED FEATURE — Central Data Layer (JavaScript) · start
   A new <script> block, loaded LAST. No existing script line was
   edited. It formalises the app's data into ONE shared object and
   ONE persisted key, and it fixes the two places the base Dashboard
   was still reading private demo copies (its Recent Leave Requests
   and its Announcements) so an action in one module now reflects on
   the dashboard, the calendar and analytics.

   What it provides (the requested interface):
     window.appData                 — the single shared state object
     window.getData()  / AppData.get()
     window.saveData() / AppData.save()
     AppData.subscribe(fn) / AppData.emit()

   How it stays safe & additive:
     • appData holds REFERENCES to the existing live stores
       (window.HRX.store, employeeLeaveRequests, employeeAttendanceData,
        companyHolidays, DATA.notifications), so every module already
       reads/writes the one object graph — no risky mass-rename.
     • Persistence is unified under the SINGLE existing key
       'cyethackHRP.v2' as a SUPERSET payload, so the older saved data
       loads unchanged (backward compatible) and the previously-unsaved
       bits (attendance, holidays, the leave-ID counter) now persist too.
     • UI-preference keys (role, theme, tour, sidebar rail, welcome bar)
       stay as their own small keys — that is correct, they are not app data.
     • The Dashboard's leave table and announcement list are re-pointed at
       the shared data; their markup, columns, buttons and styling are
       untouched — only the data source changed.
   ============================================================ */
(function () {
  if (!window.HRX || !window.HRX.store) {
    return;
  }
  var doc = document;
  var MON = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  /* live references to the existing stores (guarded) */
  function store() {
    return window.HRX.store;
  }
  function leaveList() {
    return typeof employeeLeaveRequests !== "undefined"
      ? employeeLeaveRequests
      : [];
  }
  function attData() {
    return typeof employeeAttendanceData !== "undefined"
      ? employeeAttendanceData
      : {};
  }
  function holidayList() {
    return typeof companyHolidays !== "undefined" ? companyHolidays : [];
  }
  function notifs() {
    return typeof DATA !== "undefined" && DATA.notifications
      ? DATA.notifications
      : [];
  }
  function dash() {
    return typeof DATA !== "undefined" ? DATA : {};
  }
  function seqRef() {
    return typeof hrLeaveCalendarState !== "undefined"
      ? hrLeaveCalendarState
      : null;
  }
  function fmtDate(iso) {
    if (!iso) return "—";
    var p = String(iso).split("-");
    if (p.length < 3) return iso;
    return +p[2] + " " + MON[+p[1] - 1];
  }
  function fmtRange(from, to) {
    if (!from) return "—";
    return to && to !== from
      ? fmtDate(from) + " – " + fmtDate(to)
      : fmtDate(from);
  }

  /* ============================================================
     1. The single shared state object
        (getters expose the live stores; nothing is copied)
     ============================================================ */
  var appData = {
    version: 3,
    get store() {
      return store();
    }, // employees, departments, jobs, candidates, announcements, tickets, exits, audit, currentUser, …
    get leave() {
      return leaveList();
    }, // the one leave list (calendar + approvals + analytics + dashboard)
    get attendance() {
      return attData();
    }, // attendance by date
    get holidays() {
      return holidayList();
    }, // company holidays
    get notifications() {
      return notifs();
    }, // the bell feed (shared)
    get dashboard() {
      return dash();
    }, // KPIs, donut, funnel, events + the live leave/announcement projections
    get prefs() {
      // UI preferences (persisted separately, shown here for completeness)
      function ls(k) {
        try {
          return localStorage.getItem(k);
        } catch (e) {
          return null;
        }
      }
      return {
        role: ls("cyethackHRP.role"),
        theme: ls("cyethackHRP.theme"),
        tourSeen: ls("cyethackHRP.tour") === "1",
      };
    },
  };
  window.appData = appData;

  /* ============================================================
     2. Persistence — ONE key, superset payload, backward compatible
     ============================================================ */
  var KEY = "cyethackHRP.v2";
  /* Capture the saved payload NOW, at script-load — before any block's boot()
     runs on DOMContentLoaded. The earlier persistence block re-saves its own
     (smaller) payload during its boot, which would otherwise overwrite our
     extra fields in the key before we get to read them. */
  var SAVED = (function () {
    try {
      return JSON.parse(localStorage.getItem(KEY) || "null");
    } catch (e) {
      return null;
    }
  })();
  function snapshot() {
    return {
      v: 2, // kept at 2 so the earlier loader still reads store/leave/notifs
      store: store(),
      leave: leaveList(),
      notifs: notifs(),
      attendance: attData(), // newly persisted
      holidays: holidayList(), // newly persisted
      seq: seqRef() ? seqRef().seq : undefined, // newly persisted (leave-ID counter)
    };
  }
  var storageOK = true,
    saveTimer = null;
  function saveNow() {
    if (!storageOK) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(snapshot()));
    } catch (e) {
      storageOK = false;
    }
  }
  function saveSoon() {
    if (!storageOK) return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, 750);
  }
  /* load the fields the earlier loader ignores (attendance, holidays, seq).
     store/leave/notifs were already restored by the earlier persistence block;
     re-applying is unnecessary and we never wipe anything. */
  function loadExtras() {
    var d = SAVED; // the value captured at script-load (see above)
    if (!d) return;
    try {
      if (d.attendance && typeof d.attendance === "object") {
        var a = attData();
        Object.keys(a).forEach(function (k) {
          delete a[k];
        });
        Object.keys(d.attendance).forEach(function (k) {
          a[k] = d.attendance[k];
        });
      }
      if (Array.isArray(d.holidays)) {
        var h = holidayList();
        h.length = 0;
        d.holidays.forEach(function (x) {
          h.push(x);
        });
      }
      if (typeof d.seq === "number" && seqRef()) {
        seqRef().seq = d.seq;
      }
    } catch (e) {}
  }

  /* ============================================================
     3. Fix the two Dashboard disconnects (re-point to shared data)
        The dashboard's render code is untouched; only DATA.leaveRequests
        and DATA.announcements are rebuilt from the shared stores.
     ============================================================ */
  function personaName() {
    var e = (store().employees || []).find(function (x) {
      return x.id === store().currentUser;
    });
    return e ? e.name : "Employee";
  }
  function hashIdx(id, n) {
    if (!n) return 0;
    var s = String(id || ""),
      h = 0;
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return h % n;
  }
  /* give each shared leave record a stable display name/role drawn from the
     real employee roster (so the dashboard still reads as a team list), then
     point DATA.leaveRequests at the SAME record objects — approving on the
     dashboard mutates the shared record, so it reflects on the calendar too. */
  function rebuildLeaveProjection() {
    if (typeof DATA === "undefined") return;
    var emps = (store().employees || []).filter(function (e) {
      return e.status !== "Resigned";
    });
    var list = leaveList()
      .slice()
      .sort(function (a, b) {
        return a.appliedOn < b.appliedOn ? 1 : -1;
      });
    list.forEach(function (r) {
      if (!r.__dashName) {
        var e = emps.length ? emps[hashIdx(r.id, emps.length)] : null;
        r.__dashName = e ? e.name : personaName();
        r.__dashRole = e ? e.designation : "";
      }
      r.name = r.__dashName;
      r.role = r.__dashRole;
      r.dates = fmtRange(r.from, r.to); // display fields the dashboard table reads (ignored elsewhere)
    });
    DATA.leaveRequests = list; // same record objects → shared
  }
  function rebuildAnnProjection() {
    if (typeof DATA === "undefined") return;
    var list = (store().announcements || [])
      .slice()
      .sort(function (a, b) {
        return (
          (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || (a.date < b.date ? 1 : -1)
        );
      })
      .slice(0, 4);
    DATA.announcements = list.map(function (a) {
      return {
        title: a.title,
        text: a.body,
        meta: (a.author || "HR") + " · " + fmtDate(a.date),
        __id: a.id,
      };
    });
  }
  function rebuildProjections() {
    try {
      rebuildLeaveProjection();
      rebuildAnnProjection();
    } catch (e) {}
  }
  function dashboardVisible() {
    var d = doc.getElementById("dashboardPage");
    return d && !d.hidden && d.offsetParent !== null;
  }
  function refreshDashboard() {
    if (!dashboardVisible()) return;
    try {
      if (typeof renderLeaveTable === "function") renderLeaveTable();
      if (typeof renderRow4 === "function") renderRow4();
    } catch (e) {}
  }

  /* ============================================================
     4. Pub/sub + the public interface
     ============================================================ */
  var subs = [];
  window.AppData = {
    key: KEY,
    get: function () {
      return appData;
    },
    save: saveNow,
    saveSoon: saveSoon,
    load: loadExtras,
    subscribe: function (fn) {
      if (typeof fn === "function") {
        subs.push(fn);
      }
      return function () {
        var i = subs.indexOf(fn);
        if (i >= 0) subs.splice(i, 1);
      };
    },
    emit: function () {
      rebuildProjections();
      refreshDashboard();
      subs.forEach(function (fn) {
        try {
          fn(appData);
        } catch (e) {}
      });
    },
  };
  /* convenience aliases exactly as named in the request */
  window.getData = function () {
    return appData;
  };
  window.saveData = function () {
    return saveNow();
  };
  window.subscribeData = window.AppData.subscribe;

  /* ============================================================
     5. Boot — run once, after every earlier block has loaded
     ============================================================ */
  function boot() {
    if (window.__appDataBooted) return;
    window.__appDataBooted = true;

    loadExtras(); // restore attendance / holidays / seq (store/leave/notifs already restored earlier)
    rebuildProjections(); // point the dashboard widgets at the shared data
    refreshDashboard(); // repaint the dashboard if it is the current screen

    /* keep the dashboard in sync when returning to it (base navigate only toggles pages) */
    if (typeof navigate === "function") {
      var _prevNav = navigate;
      navigate = function (page) {
        rebuildProjections();
        _prevNav(page);
        if (page === "Dashboard") refreshDashboard();
      };
    }

    /* unified autosave: superset written last, so the one key always holds everything.
       Registered after the earlier autosave, covering base-dashboard actions too. */
    doc.addEventListener("click", saveSoon, true);
    doc.addEventListener("change", saveSoon, true);
    window.addEventListener("beforeunload", saveNow);
    doc.addEventListener("visibilitychange", function () {
      if (doc.visibilityState === "hidden") saveNow();
    });

    saveNow(); // establish the unified superset baseline
  }
  if (doc.readyState === "loading")
    doc.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
/* ===== ADDED FEATURE — Central Data Layer (JavaScript) · end ===== */

/* ===== portal inline block 8/11 (externalized for CSP; order preserved) ===== */

("use strict");
/* ============================================================
   ADDED FEATURE — Employee Delete action (JavaScript) · start
   A new <script> block, loaded LAST. No existing script line was
   edited. It fills the ONE genuinely-missing row action in the
   Employees directory: Delete.

   Why it was "dead": the Employees resource config renders only
   View + Edit buttons — there was never a Delete button or handler.
   (View → opens the detail modal, Edit → opens the pre-filled form
   and saves; Leave Approve / Reject / Cancel already work in Leave
   Approvals and the Leave calendar. Those were left untouched.)

   This block, additively:
     • injects a Delete button into each employee row (after Edit),
       using the existing `.hrx-actbtns` container and button styles;
     • deletes by the employee's real ID (never by array index) from
       the one shared store (window.HRX.store.employees);
     • guards against destructive one-click deletes with a confirm
       dialog styled with the existing modal;
     • blocks deletion when there are real dependencies (direct
       reports / department head / the signed-in user) and shows why;
     • records an audit entry, persists via the existing save layer,
       re-renders the module, and shows the existing toast;
     • is HR-Admin-only (the button carries data-hrx-act="delete", so
       the existing role sweep also hides it for non-admins), and it
       prevents duplicate submissions while deleting.
   Prefix: hp9 / data-hp9-del.
   ============================================================ */
(function () {
  if (!window.HRX || !window.HRX.store) {
    return;
  }
  var doc = document,
    S = window.HRX.store;
  function $id(x) {
    return doc.getElementById(x);
  }
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
  function toastX(m) {
    if (typeof toast === "function") toast(m);
  }
  function save() {
    try {
      if (window.HRX && typeof window.HRX.save === "function")
        window.HRX.save();
    } catch (e) {}
  }
  function deptName(id) {
    return window.HRX.helpers && window.HRX.helpers.deptName
      ? window.HRX.helpers.deptName(id)
      : id;
  }
  function empById(id) {
    return (S.employees || []).find(function (e) {
      return e.id === id;
    });
  }
  function role() {
    try {
      var r = localStorage.getItem("cyethackHRP.role");
      return r === "employee" || r === "manager" ? r : "admin";
    } catch (e) {
      return "admin";
    }
  }
  var BUSY = false;

  /* ---- dependency guard: what would break if we removed this person ---- */
  function blockers(id) {
    var out = [];
    var reports = (S.employees || []).filter(function (e) {
      return e.manager === id;
    });
    if (reports.length)
      out.push(
        reports.length +
          " employee" +
          (reports.length > 1 ? "s" : "") +
          " report to this person (reassign them first)",
      );
    var heads = (S.departments || []).filter(function (d) {
      return d.head === id;
    });
    if (heads.length)
      out.push(
        "heads the " +
          heads
            .map(function (d) {
              return esc(d.name);
            })
            .join(", ") +
          " department (assign a new head first)",
      );
    if (S.currentUser === id) out.push("this is the currently signed-in user");
    return out;
  }

  /* ---- confirmation (or a blocked message) ---- */
  function confirmDelete(id) {
    if (typeof openModal !== "function") return;
    var e = empById(id);
    if (!e) {
      toastX("Employee not found");
      return;
    }
    var deps = blockers(id);
    if (deps.length) {
      openModal(
        '<div class="modal-head"><h3>Can’t delete ' +
          esc(e.name) +
          '</h3><button class="icon-btn" style="width:32px;height:32px" aria-label="Close" data-close="1">✕</button></div>' +
          '<div class="modal-body">This employee can’t be removed yet because:' +
          '<ul style="margin:10px 0 0 18px;line-height:1.7;font-size:13px">' +
          deps
            .map(function (d) {
              return "<li>" + d + "</li>";
            })
            .join("") +
          "</ul></div>" +
          '<div class="modal-foot"><button class="btn btn-primary" data-close="1">OK, got it</button></div>',
      );
      return;
    }
    openModal(
      '<div class="modal-head"><h3>Delete employee?</h3><button class="icon-btn" style="width:32px;height:32px" aria-label="Close" data-close="1">✕</button></div>' +
        '<div class="modal-body">Permanently remove <b>' +
        esc(e.name) +
        "</b> (" +
        esc(e.id) +
        " · " +
        esc(e.designation || "") +
        ", " +
        esc(deptName(e.dept)) +
        ')?<br><span style="color:var(--text-2);font-size:13px">This cannot be undone.</span></div>' +
        '<div class="modal-foot"><button class="btn btn-ghost" data-close="1">Cancel</button>' +
        '<button class="btn btn-danger-outline" id="hp9DelYes">Delete employee</button></div>',
    );
    var y = $id("hp9DelYes");
    if (y)
      y.addEventListener("click", function () {
        doDelete(id, y);
      });
  }

  function doDelete(id, btn) {
    if (BUSY) return;
    BUSY = true;
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Deleting…";
    } // prevent duplicate submits
    var e = empById(id);
    var i = (S.employees || []).findIndex(function (x) {
      return x.id === id;
    }); // by ID, never by index
    if (i < 0) {
      BUSY = false;
      if (typeof closeModal === "function") closeModal();
      toastX("Employee not found");
      return;
    }
    S.employees.splice(i, 1);
    try {
      if (S.audit) {
        var d = new Date();
        S.audit.unshift({
          action: "Employee deleted",
          user: "HR Admin",
          date:
            d.getFullYear() +
            "-" +
            String(d.getMonth() + 1).padStart(2, "0") +
            "-" +
            String(d.getDate()).padStart(2, "0"),
          time: d.toLocaleTimeString("en-IN", {
            hour: "2-digit",
            minute: "2-digit",
          }),
          record: id + (e ? " — " + e.name : ""),
        });
      }
    } catch (_) {}
    save();
    if (typeof closeModal === "function") closeModal();
    try {
      if (window.HRX.renderRoute && window.HRX.route)
        window.HRX.renderRoute(window.HRX.route);
    } catch (_) {}
    setTimeout(injectDeleteButtons, 20);
    toastX("Employee " + (e ? e.name : id) + " deleted");
    BUSY = false;
  }

  /* ---- inject the Delete button into every employee row (idempotent, admin-only) ---- */
  function injectDeleteButtons() {
    if (role() !== "admin") return; // only HR Admin sees Delete
    var root = $id("hrxModuleRoot");
    if (!root) return;
    var editBtns = root.querySelectorAll(
      '[data-hrx-res="employees"][data-hrx-act="edit"]',
    );
    editBtns.forEach(function (edit) {
      var box = edit.closest(".hrx-actbtns");
      if (!box || box.querySelector("[data-hp9-del]")) return;
      var id = edit.getAttribute("data-hrx-id");
      if (!id) return;
      var del = doc.createElement("button");
      del.type = "button";
      del.className = "btn btn-danger-outline btn-sm";
      del.setAttribute("data-hrx-act", "delete"); // lets the existing role sweep hide it for non-admins too
      del.setAttribute("data-hp9-del", id);
      del.textContent = "Delete";
      box.appendChild(del);
    });
  }

  /* ---- clicks (capture phase so the generic RES handler ignores our button) ---- */
  function onClick(ev) {
    var d = ev.target.closest && ev.target.closest("[data-hp9-del]");
    if (d) {
      ev.preventDefault();
      ev.stopPropagation();
      confirmDelete(d.getAttribute("data-hp9-del"));
    }
  }

  function boot() {
    if (window.__hp9Booted) return;
    window.__hp9Booted = true;
    var root = $id("hrxModuleRoot");
    if (root) {
      root.addEventListener("click", onClick, true);
      if (window.MutationObserver) {
        new MutationObserver(function () {
          injectDeleteButtons();
        }).observe(root, { childList: true, subtree: true });
      }
    }
    injectDeleteButtons();
    if (typeof navigate === "function") {
      var pv = navigate;
      navigate = function (p) {
        pv(p);
        setTimeout(injectDeleteButtons, 30);
      };
    }
  }
  if (doc.readyState === "loading")
    doc.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
/* ===== ADDED FEATURE — Employee Delete action (JavaScript) · end ===== */

/* ===== portal inline block 9/11 (externalized for CSP; order preserved) ===== */

("use strict");
/* ============================================================
   ADDED FEATURE — Empty states + form-trim polish · start
   A new <script> block, loaded LAST. No existing script line was
   edited. It adds two small UX improvements the app was missing:

   1) CONTEXTUAL EMPTY STATES for the suite tables (Employees,
      Candidates, and every other RES table). The engine showed one
      generic "No … match your filters" for BOTH cases. This block
      upgrades that single message into two distinct states, styled
      with the existing tokens/containers:
        • No data at all → "No {things} found" + helper + an
          "Add {thing}" call-to-action (reuses the existing
          data-hrx-add button, so it opens the existing Add form).
        • A search/filter returned nothing → "No {things} found" +
          "Try adjusting your search or filters." + a "Clear filters"
          action (resets the existing search + filter controls).
      Only the empty <td> is rewritten; the real table, when it has
      rows, is never touched.

   2) WHITESPACE-ONLY GUARD for the Add / Edit forms. The existing
      validation already covers required / email / phone / number /
      duplicate-ID; it just treated "   " as non-empty. This block
      trims the text inputs on submit (capture phase, before the
      existing validator runs), so whitespace-only required fields
      now correctly fail with the existing inline error.

   Toasts already fire on every key action (employee add/update/
   delete, leave submit/approve/reject/cancel, candidate add/update/
   advance) via the existing toast() — nothing to add there.
   Prefix: hp10 / data-hp10-clear.
   ============================================================ */
(function () {
  if (!window.HRX || !window.HRX.store) {
    return;
  }
  var doc = document,
    S = window.HRX.store;
  function $id(x) {
    return doc.getElementById(x);
  }
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
  function iconOf(n, s) {
    return typeof icon === "function" ? icon(n, s) : "";
  }

  /* labels + icon per resource (used only for the empty-state copy) */
  var LBL = {
    employees: {
      title: "employees",
      sing: "Employee",
      ic: "users",
      sub0: "Add your first employee to get started.",
    },
    candidates: {
      title: "candidates",
      sing: "Candidate",
      ic: "userPlus",
      sub0: "Candidates will appear here when they apply for your open positions.",
    },
    jobs: {
      title: "job openings",
      sing: "Job",
      ic: "briefcase",
      sub0: "Post your first opening to start hiring.",
    },
    interviews: {
      title: "interviews",
      sing: "Interview",
      ic: "clipboardCheck",
      sub0: "Scheduled interviews will appear here.",
    },
    offers: {
      title: "offers",
      sing: "Offer",
      ic: "fileText",
      sub0: "Offers you extend will appear here.",
    },
    projects: {
      title: "projects",
      sing: "Project",
      ic: "briefcase",
      sub0: "Create your first project to get started.",
    },
    tasks: {
      title: "tasks",
      sing: "Task",
      ic: "clipboardCheck",
      sub0: "Tasks will appear here once created.",
    },
    targets: {
      title: "targets",
      sing: "Target",
      ic: "trendingUp",
      sub0: "Set targets to track performance.",
    },
    reviews: {
      title: "reviews",
      sing: "Review",
      ic: "trendingUp",
      sub0: "Performance reviews will appear here.",
    },
    departments: {
      title: "departments",
      sing: "Department",
      ic: "users",
      sub0: "Add your first department to get started.",
    },
    designations: {
      title: "designations",
      sing: "Designation",
      ic: "users",
      sub0: "Add your first designation to get started.",
    },
    documents: {
      title: "documents",
      sing: "Document",
      ic: "fileText",
      sub0: "Uploaded documents will appear here.",
    },
  };
  function lbl(key) {
    return (
      LBL[key] || {
        title: key,
        sing: key.charAt(0).toUpperCase() + key.slice(1).replace(/s$/, ""),
        ic: "fileText",
        sub0: "No records yet.",
      }
    );
  }

  function injectCss() {
    if ($id("hrPlus10Styles")) return;
    var st = doc.createElement("style");
    st.id = "hrPlus10Styles";
    st.textContent = [
      ".hp10-empty{display:flex;flex-direction:column;align-items:center;text-align:center;gap:6px;padding:34px 20px}",
      ".hp10-empty .hp10-ic{width:46px;height:46px;border-radius:50%;background:var(--teal-tint);color:var(--teal-bright);display:grid;place-items:center;margin-bottom:4px}",
      ".hp10-empty .hp10-title{font-size:15px;font-weight:600;color:var(--text)}",
      ".hp10-empty .hp10-sub{font-size:13px;color:var(--text-2);max-width:340px;line-height:1.5}",
      ".hp10-empty .hp10-cta{margin-top:10px}",
      "@media (max-width:600px){.hp10-empty{padding:26px 14px}.hp10-empty .hp10-sub{font-size:12px}}",
    ].join("");
    doc.head.appendChild(st);
  }

  /* which resource is on screen, and is a search/filter active? */
  function keyInView() {
    var root = $id("hrxModuleRoot");
    if (!root) return null;
    var s = root.querySelector(".hrx-search[data-hrx-res]");
    return s ? s.getAttribute("data-hrx-res") : null;
  }
  function searchActive(key) {
    var root = $id("hrxModuleRoot");
    if (!root) return false;
    var inp = root.querySelector(
      '.hrx-search[data-hrx-res="' + key + '"] input',
    );
    return !!(inp && String(inp.value || "").trim());
  }
  function filterActive(key) {
    var root = $id("hrxModuleRoot");
    if (!root) return false;
    var sels = root.querySelectorAll(
      'select[data-hrx-filter][data-hrx-res="' + key + '"]',
    );
    for (var i = 0; i < sels.length; i++) {
      if (sels[i].value) return true;
    }
    return false;
  }
  function hasAddForm(key) {
    var root = $id("hrxModuleRoot");
    return !!(root && root.querySelector('[data-hrx-add="' + key + '"]'));
  }
  function totalFor(key) {
    try {
      return Array.isArray(S[key]) ? S[key].length : null;
    } catch (e) {
      return null;
    }
  }

  function buildEmptyHTML(key) {
    var L = lbl(key),
      filtered = searchActive(key) || filterActive(key);
    var total = totalFor(key);
    var isNoData = total === 0 || (!filtered && total === null); // no rows and nothing is filtering them
    var sub,
      cta = "";
    if (!isNoData) {
      sub = "Try adjusting your search or filters.";
      cta =
        '<button type="button" class="btn btn-outline btn-sm" data-hp10-clear="' +
        esc(key) +
        '">Clear filters</button>';
    } else {
      sub = L.sub0;
      if (hasAddForm(key))
        cta =
          '<button type="button" class="btn btn-primary btn-sm" data-hrx-add="' +
          esc(key) +
          '">+ Add ' +
          esc(L.sing) +
          "</button>";
    }
    return (
      '<div class="hp10-empty" role="status">' +
      '<span class="hp10-ic" aria-hidden="true">' +
      iconOf(L.ic, 22) +
      "</span>" +
      '<div class="hp10-title">No ' +
      esc(L.title) +
      " found</div>" +
      '<div class="hp10-sub">' +
      esc(sub) +
      "</div>" +
      (cta ? '<div class="hp10-cta">' + cta + "</div>" : "") +
      "</div>"
    );
  }

  /* replace the engine's generic empty cell with the contextual one */
  function upgradeEmpty() {
    var body = $id("hrxResBody");
    if (!body) return;
    var cell = body.querySelector("td .empty");
    if (!cell) return; // only the generic RES empty (scoped to #hrxResBody)
    var key = keyInView();
    if (!key) return;
    var td = cell.parentNode;
    if (!td) return;
    td.innerHTML = buildEmptyHTML(key);
  }

  /* Clear filters → reset the existing search + filter controls (their own handlers refresh the table) */
  function clearFilters(key) {
    var root = $id("hrxModuleRoot");
    if (!root) return;
    var inp = root.querySelector(
      '.hrx-search[data-hrx-res="' + key + '"] input',
    );
    if (inp) {
      inp.value = "";
      inp.dispatchEvent(new Event("input", { bubbles: true }));
    }
    root
      .querySelectorAll('select[data-hrx-filter][data-hrx-res="' + key + '"]')
      .forEach(function (sel) {
        if (sel.value) {
          sel.value = "";
          sel.dispatchEvent(new Event("change", { bubbles: true }));
        }
      });
  }

  function onClick(ev) {
    var c = ev.target.closest && ev.target.closest("[data-hp10-clear]");
    if (c) {
      ev.preventDefault();
      clearFilters(c.getAttribute("data-hp10-clear"));
    }
    /* data-hrx-add CTA is handled by the existing engine handler — nothing to do here */
  }

  /* whitespace-only guard: trim text fields BEFORE the existing validator runs */
  function onSubmitCapture(ev) {
    var b = ev.target.closest && ev.target.closest("#hrxFormSubmit");
    if (!b) return;
    doc
      .querySelectorAll(".hrx-form input, .hrx-form textarea")
      .forEach(function (el) {
        var t = (el.getAttribute("type") || "text").toLowerCase();
        if (
          el.tagName === "TEXTAREA" ||
          t === "text" ||
          t === "tel" ||
          t === "email" ||
          t === "search" ||
          t === ""
        ) {
          if (typeof el.value === "string") {
            var v = el.value.replace(/^\s+|\s+$/g, "");
            if (v !== el.value) el.value = v;
          }
        }
      });
  }

  function boot() {
    if (window.__hp10Booted) return;
    window.__hp10Booted = true;
    injectCss();
    var root = $id("hrxModuleRoot");
    if (root) {
      root.addEventListener("click", onClick);
      if (window.MutationObserver) {
        new MutationObserver(function () {
          upgradeEmpty();
        }).observe(root, { childList: true, subtree: true });
      }
    }
    doc.addEventListener("click", onSubmitCapture, true); // capture, before submitForm
    upgradeEmpty();
  }
  if (doc.readyState === "loading")
    doc.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
/* ===== ADDED FEATURE — Empty states + form-trim polish · end ===== */

/* ===== portal inline block 10/11 (externalized for CSP; order preserved) ===== */

("use strict");
/* ============================================================
   ADDED FEATURE — Login / Authentication (first pass) · start
   A new <script> block, loaded LAST. No existing line was edited.
   This is an intentionally BASIC starting point (no backend, no
   hashing, no security hardening — those come later). It adds a
   login gate in front of the existing portal, using only new,
   scoped names prefixed hr-auth- / HRAUTH.

   How it connects to the existing project:
     • It injects one full-screen overlay (#hr-auth-container) plus
       its own <style>. When there is no saved session the overlay
       covers the portal (= “redirect to login”); on a successful
       login it hides and the existing app is used exactly as before.
     • Session = a simple flag in localStorage under the key
       'hr-auth-session' ({user, name, role, ts}). A saved session
       keeps you logged in across refresh; logout clears it and shows
       the login screen again.
     • Logout reuses the portal's existing sidebar “Log out” button
       (#logoutBtn) by ADDING a click listener — nothing existing is
       changed. (The topbar account menu is left untouched.)
     • A "role" value (Employee / Manager / HR Admin) is stored with
       the session as a placeholder for later. It is deliberately NOT
       wired into any permissions or show/hide logic yet.
     • Test hook: set window.HR_AUTH_BYPASS = true before load to skip
       the gate (used only by the automated test suites).
   ============================================================ */
(function () {
  var doc = document;
  var LS = "hr-auth-session";

  /* --- mock users (demo only — replace with a real backend later) --- */
  var USERS = [];

  function getSession() {
    try {
      return JSON.parse(localStorage.getItem(LS) || "null");
    } catch (e) {
      return null;
    }
  }
  function setSession(s) {
    try {
      localStorage.setItem(LS, JSON.stringify(s));
    } catch (e) {}
  }
  function clearSession() {
    try {
      localStorage.removeItem(LS);
    } catch (e) {}
  }
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /* ---------------- scoped styles (theme tokens reused) ---------------- */
  function injectCss() {
    if (doc.getElementById("hr-auth-styles")) return;
    var st = doc.createElement("style");
    st.id = "hr-auth-styles";
    st.textContent = [
      ".hr-auth-container{position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;padding:24px;",
      "background:radial-gradient(1100px 560px at 50% -10%, rgba(80,152,136,.14), transparent), var(--bg);font-family:var(--font)}",
      ".hr-auth-card{width:100%;max-width:400px;background:var(--surface);border:1px solid var(--border);border-radius:16px;box-shadow:var(--shadow-pop);padding:28px 26px}",
      ".hr-auth-brand{display:flex;flex-direction:column;align-items:center;gap:7px;margin-bottom:16px;text-align:center}",
      ".hr-auth-brand img{height:42px;width:auto}",
      ".hr-auth-brand .nm{font-size:17px;font-weight:700;letter-spacing:.16em;color:var(--text)}",
      ".hr-auth-brand .sl{font-size:11px;color:var(--text-2)}",
      ".hr-auth-title{font-size:16px;font-weight:600;color:var(--text);text-align:center}",
      ".hr-auth-sub{font-size:12px;color:var(--text-2);text-align:center;margin:2px 0 18px}",
      ".hr-auth-field{margin-bottom:13px}",
      ".hr-auth-field label{display:block;font-size:12px;color:var(--text-2);margin-bottom:6px;font-weight:600}",
      ".hr-auth-inwrap{position:relative;display:flex;align-items:center}",
      ".hr-auth-field input[type=text],.hr-auth-field input[type=email],.hr-auth-field input[type=password]{width:100%;height:42px;padding:0 12px;background:var(--bg);border:1px solid var(--border);border-radius:9px;color:var(--text);font-family:var(--font);font-size:14px;outline:none}",
      ".hr-auth-field input:focus{border-color:var(--teal);box-shadow:0 0 0 3px var(--teal-tint)}",
      ".hr-auth-inwrap input{padding-right:58px}",
      ".hr-auth-toggle{position:absolute;right:6px;background:transparent;border:0;color:var(--text-2);font-size:11px;font-weight:600;cursor:pointer;padding:8px;font-family:var(--font)}",
      ".hr-auth-toggle:hover{color:var(--text)}",
      ".hr-auth-row{display:flex;align-items:center;justify-content:space-between;margin:4px 0 16px}",
      ".hr-auth-remember{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--text-2);cursor:pointer;user-select:none}",
      ".hr-auth-remember input{width:15px;height:15px;accent-color:var(--teal)}",
      ".hr-auth-btn{width:100%;height:44px;justify-content:center;font-size:14px}",
      ".hr-auth-error{background:var(--red-tint);border:1px solid var(--red);color:var(--text);border-radius:8px;padding:9px 11px;font-size:12.5px;margin-bottom:13px}",
      "@media (max-width:480px){.hr-auth-card{padding:22px 18px}}",
    ].join("");
    doc.head.appendChild(st);
  }

  /* ---------------- overlay markup ---------------- */
  function logoSrc() {
    var im = doc.querySelector(".logo-img");
    return im ? im.getAttribute("src") : "";
  }
  function build() {
    if (doc.getElementById("hr-auth-container")) return;
    var wrap = doc.createElement("div");
    wrap.id = "hr-auth-container";
    wrap.className = "hr-auth-container";
    wrap.setAttribute("role", "dialog");
    wrap.setAttribute("aria-modal", "true");
    wrap.setAttribute("aria-label", "Sign in to Cyethack HR");
    var src = logoSrc();
    wrap.innerHTML =
      '<form class="hr-auth-card" id="hr-auth-form" novalidate>' +
      '<div class="hr-auth-brand">' +
      (src ? '<img src="' + esc(src) + '" alt="Cyethack">' : "") +
      '<span class="nm">CYETHACK</span><span class="sl">Your privacy, our priority</span>' +
      "</div>" +
      '<div class="hr-auth-title">Sign in</div>' +
      '<div class="hr-auth-sub">Access your HR portal</div>' +
      '<div class="hr-auth-error" id="hr-auth-error" hidden role="alert"></div>' +
      '<div class="hr-auth-field">' +
      '<label for="hr-auth-user">Email address</label>' +
      '<input id="hr-auth-user" type="email" autocomplete="username" placeholder="you@cyethack.com" aria-label="Email address">' +
      "</div>" +
      '<div class="hr-auth-field">' +
      '<label for="hr-auth-pass">Password</label>' +
      '<div class="hr-auth-inwrap">' +
      '<input id="hr-auth-pass" type="password" autocomplete="current-password" placeholder="Your password" aria-label="Password">' +
      '<button type="button" class="hr-auth-toggle" id="hr-auth-toggle" aria-label="Show password">Show</button>' +
      "</div>" +
      "</div>" +
      '<div class="hr-auth-row">' +
      '<label class="hr-auth-remember"><input type="checkbox" id="hr-auth-remember"> Remember me</label>' +
      "</div>" +
      '<button type="submit" class="btn btn-primary hr-auth-btn" id="hr-auth-submit">Sign in</button>' +
      "</form>";
    doc.body.appendChild(wrap);

    var form = doc.getElementById("hr-auth-form");
    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      attempt();
    });
    doc.getElementById("hr-auth-toggle").addEventListener("click", togglePw);
    ["hr-auth-user", "hr-auth-pass"].forEach(function (id) {
      doc.getElementById(id).addEventListener("input", hideError);
    });
  }

  function togglePw() {
    var i = doc.getElementById("hr-auth-pass"),
      t = doc.getElementById("hr-auth-toggle");
    if (i.type === "password") {
      i.type = "text";
      t.textContent = "Hide";
      t.setAttribute("aria-label", "Hide password");
    } else {
      i.type = "password";
      t.textContent = "Show";
      t.setAttribute("aria-label", "Show password");
    }
  }
  function showError(msg) {
    var e = doc.getElementById("hr-auth-error");
    if (e) {
      e.textContent = msg;
      e.hidden = false;
    }
  }
  function hideError() {
    var e = doc.getElementById("hr-auth-error");
    if (e) e.hidden = true;
  }

  /* ---------------- login / logout ---------------- */
  function attempt() {
    var u = (doc.getElementById("hr-auth-user").value || "").trim();
    var p = doc.getElementById("hr-auth-pass").value || "";
    if (!u) {
      showError("Please enter your username or email.");
      doc.getElementById("hr-auth-user").focus();
      return;
    }
    if (!p) {
      showError("Please enter your password.");
      doc.getElementById("hr-auth-pass").focus();
      return;
    }
    var m = USERS.filter(function (x) {
      return x.u.toLowerCase() === u.toLowerCase() && x.p === p;
    })[0];
    if (!m) {
      showError("Incorrect username or password.");
      return;
    }
    setSession({ user: m.u, name: m.name, role: m.role, ts: Date.now() }); // role stored as a placeholder for later
    hideGate();
    try {
      if (typeof navigate === "function") navigate("Dashboard");
    } catch (e) {}
  }
  function logout() {
    clearSession();
    showGate();
  }

  function showGate() {
    var w = doc.getElementById("hr-auth-container");
    if (w) {
      w.hidden = false;
      var u = doc.getElementById("hr-auth-user");
      if (u) {
        u.focus();
      }
    }
  }
  function hideGate() {
    var w = doc.getElementById("hr-auth-container");
    if (w) w.hidden = true;
  }

  /* small public surface for later use */
  window.HRAUTH = {
    get session() {
      return getSession();
    },
    logout: logout,
    users: USERS.map(function (x) {
      return { u: x.u, role: x.role, name: x.name };
    }),
  };

  /* ---------------- boot (runs immediately; this script is last) ---------------- */
  injectCss();
  build();
  if (getSession() || window.HR_AUTH_BYPASS === true) {
    hideGate();
  } else {
    showGate();
  }
  var lb = doc.getElementById("logoutBtn");
  if (lb)
    lb.addEventListener("click", function (ev) {
      ev.preventDefault();
      logout();
    });
})();
/* ===== ADDED FEATURE — Login / Authentication (first pass) · end ===== */

/* ===== portal inline block 11/11 (externalized for CSP; order preserved) ===== */

/* ===== ADDED FEATURE — Login / Authentication (functional pass) · start ===== */
/* Additive only — enhances the EXISTING hr-auth login without editing any existing code.
   Adds: inline per-field validation (required + email format), a loading state with
   duplicate-submit prevention, a generic "Invalid email or password." message (no
   account-existence leak), loading the real logged-in user's name/role/initials into the
   sidebar + top-bar, gating every module behind login, session expiry (TTL) + restore on
   refresh + an expiry message, and a clean logout (suppresses the old "coming soon" toast)
   with a "Logged out successfully." confirmation.
   NOTE: this is client-side only. In a single HTML file with no server it is demo-level
   protection, NOT real security — anyone with the file can bypass it. Real security needs
   the separate backend (see the cyethack-auth-backend project).
   Hooks (all pre-existing): window.HRAUTH, #hr-auth-form / #hr-auth-user / #hr-auth-pass /
   #hr-auth-submit / #hr-auth-error / #hr-auth-remember / #hr-auth-container, navigate(),
   toast(), #logoutBtn, .profile .avatar / .who, #avatarBtn. Storage key: hr-auth-session. */
(function () {
  var doc = document,
    LS = "hr-auth-session";
  var TTL_DEFAULT = 30 * 60 * 1000; // 30 minutes
  var TTL_REMEMBER = 14 * 24 * 60 * 60 * 1000; // 14 days when "remember me" is ticked
  var BUSY = false,
    PENDING = false;

  function readSession() {
    try {
      return JSON.parse(localStorage.getItem(LS) || "null");
    } catch (e) {
      return null;
    }
  }
  function writeSession(s) {
    try {
      localStorage.setItem(LS, JSON.stringify(s));
    } catch (e) {}
  }
  function dropSession() {
    try {
      localStorage.removeItem(LS);
    } catch (e) {}
  }
  function bypass() {
    return window.HR_AUTH_BYPASS === true;
  }
  function say(m) {
    try {
      if (typeof toast === "function") toast(m);
    } catch (e) {}
  }
  function initials(name) {
    name = (name || "").trim();
    if (!name) return "HR";
    var p = name.split(/\s+/);
    return (((p[0] || "")[0] || "") + ((p[1] || "")[0] || "")).toUpperCase();
  }

  /* ---------------- session expiry ---------------- */
  function expired(s) {
    if (!s || !s.ts) return false;
    return Date.now() - s.ts > (s.exp || TTL_DEFAULT);
  }
  function enforceExpiry() {
    if (bypass()) return false;
    var s = readSession();
    if (s && expired(s)) {
      dropSession();
      var g = gate();
      if (g) g.hidden = false;
      var e = doc.getElementById("hr-auth-error");
      if (e) {
        e.textContent = "Your session has expired. Please log in again.";
        e.hidden = false;
      }
      say("Your session has expired. Please log in again.");
      return true;
    }
    return false;
  }

  /* ---------------- gate + per-user chip ---------------- */
  function gate() {
    return doc.getElementById("hr-auth-container");
  }
  function hydrate() {
    var s = readSession();
    if (!s) return;
    var av = doc.querySelector(".profile .avatar");
    if (av) av.textContent = initials(s.name);
    var who = doc.querySelector(".profile .who");
    if (who) {
      var b = who.querySelector("b"),
        sp = who.querySelector("span");
      if (b) b.textContent = s.name || "User";
      if (sp) sp.textContent = s.role || "";
    }
    var ab = doc.getElementById("avatarBtn");
    if (ab) ab.textContent = initials(s.name);
  }

  /* ---------------- validation ---------------- */
  function fieldBox(input) {
    var f = input.closest ? input.closest(".hr-auth-field") : input.parentNode;
    var id = input.id + "-hp12err",
      box = doc.getElementById(id);
    if (!box) {
      box = doc.createElement("div");
      box.id = id;
      box.className = "hp12-fielderr";
      box.style.cssText =
        "color:var(--red,#EF4444);font-size:11px;margin-top:5px";
      (f || input.parentNode).appendChild(box);
    }
    return box;
  }
  function setFieldError(input, msg) {
    if (!input) return;
    input.style.borderColor = msg ? "var(--red,#EF4444)" : "";
    var box = fieldBox(input);
    if (msg) {
      box.textContent = msg;
      box.hidden = false;
    } else box.hidden = true;
  }
  function looksEmail(v) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
  }
  function validate() {
    var u = doc.getElementById("hr-auth-user"),
      p = doc.getElementById("hr-auth-pass");
    var uv = ((u && u.value) || "").trim(),
      pv = (p && p.value) || "",
      first = null;
    if (!uv) {
      setFieldError(u, "Email or username is required.");
      first = first || "Please enter your username or email.";
    } else if (uv.indexOf("@") >= 0 && !looksEmail(uv)) {
      setFieldError(u, "Enter a valid email address.");
      first = first || "Please enter a valid email address.";
    } else setFieldError(u, "");
    if (!pv) {
      setFieldError(p, "Password is required.");
      first = first || "Please enter your password.";
    } else setFieldError(p, "");
    var e = doc.getElementById("hr-auth-error");
    if (e) {
      if (first) {
        e.textContent = first;
        e.hidden = false;
      } else e.hidden = true;
    }
    return !first;
  }

  /* ---------------- loading state ---------------- */
  function setLoading(on) {
    var b = doc.getElementById("hr-auth-submit");
    if (!b) return;
    if (on) {
      b.disabled = true;
      b.dataset.hp12label = b.dataset.hp12label || b.textContent;
      b.textContent = "Signing in…";
      b.style.opacity = ".75";
      b.style.cursor = "progress";
    } else {
      b.disabled = false;
      if (b.dataset.hp12label) b.textContent = b.dataset.hp12label;
      b.style.opacity = "";
      b.style.cursor = "";
    }
  }

  /* ---------------- form wiring (capture pre-validate + delayed real submit) ---------------- */
  function wireForm() {
    var form = doc.getElementById("hr-auth-form");
    if (!form || form.dataset.hp12) return;
    form.dataset.hp12 = "1";

    // capture phase — runs BEFORE the existing attempt() handler
    form.addEventListener(
      "submit",
      function (ev) {
        if (PENDING) {
          PENDING = false;
          return;
        } // second pass → let existing attempt() run
        ev.preventDefault();
        ev.stopImmediatePropagation(); // hold the existing handler until validated
        if (BUSY) return;
        if (!validate()) return;
        BUSY = true;
        setLoading(true);
        setTimeout(function () {
          PENDING = true;
          BUSY = false;
          if (form.requestSubmit) form.requestSubmit();
          else
            form.dispatchEvent(
              new Event("submit", { cancelable: true, bubbles: true }),
            );
        }, 150);
      },
      true,
    );

    // bubble phase — runs AFTER attempt(); observes the result synchronously
    form.addEventListener(
      "submit",
      function () {
        setLoading(false);
        var s = readSession();
        if (s) {
          // login succeeded
          var rem = doc.getElementById("hr-auth-remember");
          s.exp = rem && rem.checked ? TTL_REMEMBER : TTL_DEFAULT;
          if (!s.ts) s.ts = Date.now();
          writeSession(s);
          hydrate();
          say("Welcome back, " + ((s.name || "").split(" ")[0] || "") + "!");
        } else {
          // login failed → generic message
          var e = doc.getElementById("hr-auth-error");
          if (e) {
            e.textContent = "Invalid email or password.";
            e.hidden = false;
          }
        }
      },
      false,
    );

    ["hr-auth-user", "hr-auth-pass"].forEach(function (id) {
      var el = doc.getElementById(id);
      if (el)
        el.addEventListener("input", function () {
          setFieldError(el, "");
        });
    });
  }

  /* ---------------- clean logout (capture: block stale toast + old handlers) ---------------- */
  function wireLogout() {
    var lb = doc.getElementById("logoutBtn");
    if (!lb || lb.dataset.hp12) return;
    lb.dataset.hp12 = "1";
    lb.addEventListener(
      "click",
      function (ev) {
        ev.preventDefault();
        ev.stopImmediatePropagation(); // suppress part2 "coming soon" toast AND part11 handler
        dropSession();
        var g = gate();
        if (g) {
          g.hidden = false;
          var u = doc.getElementById("hr-auth-user");
          if (u) {
            u.value = "";
            u.focus();
          }
          var p = doc.getElementById("hr-auth-pass");
          if (p) p.value = "";
          var e = doc.getElementById("hr-auth-error");
          if (e) e.hidden = true;
        }
        say("Logged out successfully.");
      },
      true,
    );
  }

  /* ---------------- module guard: wrap navigate() ---------------- */
  function guard() {
    if (typeof window.navigate !== "function" || window.navigate.__hp12) return;
    var orig = window.navigate;
    function wrapped() {
      if (!bypass()) {
        if (enforceExpiry()) return; // expired → gate shown, block
        if (!readSession()) {
          var g = gate();
          if (g) g.hidden = false;
          return;
        } // not logged in → block
      }
      return orig.apply(this, arguments);
    }
    wrapped.__hp12 = true;
    try {
      window.navigate = wrapped;
    } catch (e) {}
  }

  /* ---------------- boot ---------------- */
  function boot() {
    wireForm();
    wireLogout();
    guard();
    if (!bypass()) {
      if (!enforceExpiry() && readSession()) hydrate();
    } else hydrate();
  }
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", boot);
  else boot();
  setInterval(function () {
    if (!bypass() && readSession()) enforceExpiry();
  }, 60 * 1000);
})();
/* ===== ADDED FEATURE — Login / Authentication (functional pass) · end ===== */

/* ===== CSP hardening: delegated click handler replacing the former inline close-modal onclick attributes
   (now data-close / data-open-leave). ===== */
document.addEventListener("click", function (e) {
  var t =
    e.target && e.target.closest ? e.target.closest("[data-close]") : null;
  if (!t) return;
  if (typeof closeModal === "function") closeModal();
  var iso = t.getAttribute("data-open-leave");
  if (iso && typeof openLeaveApplicationModal === "function")
    openLeaveApplicationModal(iso);
});
