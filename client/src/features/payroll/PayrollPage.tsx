/* ============================================================
   Payroll — monthly in-hand runs, payslips, structure, history.

   HR/Admin: draft → calculate → approve → process, with per-employee
   bonus / deduction adjustments and a payslip dialog.
   Employees: their own payslips and structure, read-only.
   ============================================================ */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { Modal } from '@/components/ui/Modal';
import { DetailList, EmpCell, EmptyState, PageHead, Pill, StatRow, Tabs } from '@/components/ui/primitives';
import { useApp } from '@/store/AppContext';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { isApiSession } from '@/api/client';
import { apiErrorMessage } from '@/api/services/http';
import {
  officialApproveRun,
  officialGenerateRun,
  officialProcessRun,
  officialUpdateSlip,
} from '@/store/apiBridge';
import {
  downloadBlobUrl,
  fetchPayslipPdf,
  listMyOfficialPayslips,
  fetchArchiveStatus,
  retryDriveUpload,
  payslipErrorMessage,
  type OfficialPayslip,
  type ArchiveStatus,
} from '@/api/payslips';
import { deptName, empName } from '@/lib/lookups';
import { dateRange, niceDate, todayISO } from '@/lib/date';
import { money, moneyCompact } from '@/lib/format';
import {
  CONVEYANCE,
  PROFESSIONAL_TAX,
  buildPayrollRow,
  currentPeriod,
  periodLabel,
  periodPayDate,
  recentPeriods,
  salaryBreakdown,
} from '@/lib/payroll';
import type { AppData, Employee, PayrollRow, PayrollRun } from '@/types';
import logoMark from '../../../img/cyethack-logo.svg';
import { filterDemoEmployees } from '@/lib/lookups';

function withAdjustments(row: PayrollRow, bonus: number, otherDed: number): PayrollRow {
  const gross = row.basic + row.hra + row.conv + row.special + bonus;
  const ded = row.pt + otherDed;
  return { ...row, bonus, otherDed, gross, ded, net: gross - ded };
}

export function PayrollPage() {
  const { data, dispatch, audit, notify, nextId } = useApp();
  const { user } = useAuth();
  const { toast } = useToast();

  const isSelf = user?.portal === 'employee';
  const myId = user?.employeeId ?? '';
  const myRow = (run: PayrollRun) => run.rows.find((r) => r.empId === myId) ?? null;

  const runs = useMemo(
    () => [...data.payrollRuns].sort((a, b) => (a.period < b.period ? 1 : -1)),
    [data.payrollRuns],
  );

  const onRoll = useMemo(
    () =>
      filterDemoEmployees(data.employees).filter(
        (e) => e.status === 'Active' || e.status === 'Probation' || e.status === 'On Leave',
      ),
    [data.employees],
  );

  /* -------- HR: make sure the current period has a draft run --------
     Demo sessions only — real sessions read official runs from the
     server and never auto-create records. */
  const seeded = useRef(false);
  useEffect(() => {
    if (isSelf || isApiSession() || seeded.current) return;
    seeded.current = true;
    const period = currentPeriod();
    if (data.payrollRuns.some((r) => r.period === period)) return;
    dispatch({
      type: 'add',
      collection: 'payrollRuns',
      item: {
        id: nextId('PR-', 3),
        period,
        status: 'Draft',
        rows: onRoll.map((e) => buildPayrollRow(e)),
        payDate: periodPayDate(period),
      } satisfies PayrollRun,
    });
  }, [isSelf, data.payrollRuns, dispatch, nextId, onRoll]);

  const [period, setPeriod] = useState(currentPeriod());
  const [tab, setTab] = useState<'processing' | 'payslips' | 'structure' | 'history'>('processing');
  const [payslip, setPayslip] = useState<{ run: PayrollRun; row: PayrollRow } | null>(null);
  const [adjust, setAdjust] = useState<{ run: PayrollRun; row: PayrollRow } | null>(null);
  const [adjBonus, setAdjBonus] = useState('0');
  const [adjDed, setAdjDed] = useState('0');
  const [runBusy, setRunBusy] = useState(false);
  const [archiveStatus, setArchiveStatus] = useState<Map<string, ArchiveStatus>>(new Map());

  /* Real (HRM-API) sessions show the official server payslips: the same
     table layout, but every document is generated from the stored record.
     Demo sessions keep the local dataset. */
  const official = isApiSession();
  const [officialSlips, setOfficialSlips] = useState<OfficialPayslip[] | null>(official ? null : []);
  const [slipBusy, setSlipBusy] = useState<{ id: string; mode: 'view' | 'download' } | null>(null);

  // Fetch archive status for a payslip
  const fetchArchiveStatusForSlip = async (slipId: string) => {
    try {
      const status = await fetchArchiveStatus(slipId);
      setArchiveStatus(prev => new Map(prev).set(slipId, status));
    } catch (err) {
      console.warn('Failed to fetch archive status:', err);
    }
  };

  useEffect(() => {
    if (!isSelf || !official || !myId) return;
    let cancelled = false;
    listMyOfficialPayslips(myId)
      .then((rows) => {
        if (!cancelled) setOfficialSlips(rows);
      })
      .catch((err) => {
        if (cancelled) return;
        setOfficialSlips([]);
        toast(payslipErrorMessage(err), 'error');
      });
    return () => {
      cancelled = true;
    };
  }, [isSelf, official, myId]);

  const periodOptions = useMemo(() => {
    const opts = recentPeriods(12);
    if (!opts.includes(period)) opts.unshift(period);
    return opts;
  }, [period]);

  const run = runs.find((r) => r.period === period) ?? null;
  const myRuns = runs.filter((r) => myRow(r));

  /* Official-run console flags (server slips only). */
  const hasDraftSlips = Boolean(run?.rows.some((r) => r.officialStatus === 'Draft'));
  const hasApprovedSlips = Boolean(run?.rows.some((r) => r.officialStatus === 'Approved'));
  const allProcessed = Boolean(
    run && run.rows.length > 0 && run.rows.every((r) => r.officialStatus === 'Processed' || r.officialStatus === 'Paid'),
  );

  /* -------- run maths -------- */
  const totals = useMemo(() => {
    if (!run) return null;
    return run.rows.reduce(
      (acc, r) => ({
        gross: acc.gross + r.gross,
        ded: acc.ded + r.ded,
        net: acc.net + r.net,
        paid: acc.paid + (r.payStatus === 'Paid' ? 1 : 0),
      }),
      { gross: 0, ded: 0, net: 0, paid: 0 },
    );
  }, [run]);

  const patchRun = (target: PayrollRun, patch: Partial<PayrollRun>) => {
    dispatch({ type: 'update', collection: 'payrollRuns', id: target.id, patch });
  };

  /* Official (server) sessions: draft → approve → process are real
     payroll writes. The local dataset is never touched; every action
     re-reads the scoped payslips afterwards. */
  const officialAct = async (
    act: 'start' | 'recalc' | 'approve' | 'process',
    target: { period: string; rows: PayrollRow[]; payDate: string },
  ) => {
    if (runBusy) return;
    setRunBusy(true);
    try {
      if (act === 'start' || act === 'recalc') {
        const res = await officialGenerateRun(target.period, act === 'recalc');
        toast(
          res.skipped
            ? `Drafted ${res.created} payslips for ${periodLabel(target.period)} — ${res.skipped} skipped (no salary on record).`
            : `Drafted ${res.created} payslips for ${periodLabel(target.period)}.`,
          'success',
        );
      } else if (act === 'approve') {
        const ids = target.rows
          .filter((r) => r.officialStatus === 'Draft' && r.officialId)
          .map((r) => r.officialId as string);
        const n = await officialApproveRun(ids);
        toast(`Approved ${n} payslips.`, 'success');
      } else {
        const ids = target.rows
          .filter((r) => r.officialStatus === 'Approved' && r.officialId)
          .map((r) => r.officialId as string);
        const n = await officialProcessRun(ids, target.payDate);
        toast(`Processed ${n} payslips — issued for ${periodLabel(target.period)}.`, 'success');
      }
    } catch (err) {
      toast(apiErrorMessage(err), 'error');
    } finally {
      setRunBusy(false);
    }
  };

  const calculate = (target: PayrollRun) => {
    if (official) {
      void officialAct('recalc', target);
      return;
    }
    const rows = target.rows.map((r) => {
      const emp = data.employees.find((e) => e.id === r.empId);
      if (!emp) return r;
      const fresh = buildPayrollRow(emp, { bonus: r.bonus, otherDed: r.otherDed });
      return { ...fresh, payStatus: r.payStatus };
    });
    patchRun(target, { rows, status: 'Calculated' });
    audit('Payroll calculated', `${target.id} · ${periodLabel(target.period)}`);
    toast(`Payroll recalculated from the roster — ${moneyCompact(rows.reduce((s, r) => s + r.net, 0))} net.`, 'success');
  };

  const approve = (target: PayrollRun) => {
    if (official) {
      void officialAct('approve', target);
      return;
    }
    patchRun(target, { status: 'Approved' });
    audit('Payroll approved', `${target.id} · ${periodLabel(target.period)}`);
    notify(`Payroll for ${periodLabel(target.period)} was approved`);
    toast('Payroll approved — ready to process.', 'success');
  };

  const process = (target: PayrollRun) => {
    if (official) {
      void officialAct('process', target);
      return;
    }
    /* Payment step: every paid row records the payout reference a real
       transaction/batch would return (kept if a row already has one). */
    const tag = target.period.replace('-', '');
    patchRun(target, {
      status: 'Processed',
      rows: target.rows.map((r, i) => ({
        ...r,
        payStatus: 'Paid',
        txnRef: r.txnRef ?? `TXN-${tag}-${String(i + 1).padStart(4, '0')}`,
      })),
    });
    audit('Payroll processed', `${target.id} · ${periodLabel(target.period)}`);
    notify(`Payslips issued for ${periodLabel(target.period)}`);
    toast('Payslips issued and marked paid.', 'success');
  };

  const saveAdjust = () => {
    if (!adjust) return;
    const bonus = Number(adjBonus || 0);
    const otherDed = Number(adjDed || 0);
    if (official) {
      /* Official rows: other deductions replace the server value; a
         bonus increments gross once (the server stores no bonus field). */
      const id = adjust.row.officialId;
      if (!id) return;
      void (async () => {
        try {
          await officialUpdateSlip(id, {
            deductions: { other: otherDed },
            ...(bonus > 0 ? { gross: adjust.row.gross + bonus } : {}),
          });
          toast('Official payslip updated on the server.', 'success');
          setAdjust(null);
        } catch (err) {
          toast(apiErrorMessage(err), 'error');
        }
      })();
      return;
    }
    const rows = adjust.run.rows.map((r) => (r.empId === adjust.row.empId ? withAdjustments(r, bonus, otherDed) : r));
    patchRun(adjust.run, { rows, status: adjust.run.status === 'Draft' ? 'Calculated' : adjust.run.status });
    audit('Payroll adjustment', `${adjust.row.empId} · bonus ${money(bonus)} · deductions ${money(otherDed)}`);
    toast('Payslip adjustment saved.', 'success');
    setAdjust(null);
  };

  /* Fetch a server-generated payslip PDF and open it in a new tab
     (falling back to a direct download when popups are blocked).
     Used by employees for their own slips and by HR for scoped ones. */
  const openPayslipPdf = async (slipId: string) => {
    if (slipBusy) return; // one document at a time
    setSlipBusy({ id: slipId, mode: 'view' });
    /* Reserve the tab while the click still counts as a user gesture —
       popup blockers drop window.open() calls made after an await. */
    let tab: Window | null = null;
    try {
      tab = window.open('', '_blank');
    } catch {
      tab = null;
    }
    try {
      const { blob, filename } = await fetchPayslipPdf(slipId);
      const url = URL.createObjectURL(blob);
      if (tab) tab.location.href = url;
      else downloadBlobUrl(url, filename);
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      toast(
        tab
          ? `Official payslip — ${filename} is opening in a new tab.`
          : `Popup blocked — ${filename} was downloaded instead.`,
        'success',
      );
    } catch (err) {
      if (tab && !tab.closed) {
        tab.close();
      }
      toast(payslipErrorMessage(err), 'error');
    } finally {
      setSlipBusy(null);
    }
  };

  /* Fetch the same server-generated PDF and save it to the device. */
  const downloadPayslipPdf = async (slipId: string) => {
    if (slipBusy) return; // one document at a time
    setSlipBusy({ id: slipId, mode: 'download' });
    try {
      const { blob, filename } = await fetchPayslipPdf(slipId);
      const url = URL.createObjectURL(blob);
      downloadBlobUrl(url, filename);
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      toast(`Official payslip — ${filename} is downloading to your device.`, 'success');
    } catch (err) {
      toast(payslipErrorMessage(err), 'error');
    } finally {
      setSlipBusy(null);
    }
  };

  const handlePayslipDownload = (run: PayrollRun, row: PayrollRow) => {
    if (official && row.officialId) {
      void downloadPayslipPdf(row.officialId);
      return;
    }

    setPayslip({ run, row });
    printPayslipDocument(run, row);
    toast('Choose “Save as PDF” in the print dialog to download this payslip.', 'info');
  };

  const printPayslipDocument = (run: PayrollRun, row: PayrollRow) => {
    const previousTitle = document.title;
    const period = periodLabel(run.period).replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '');
    const employeeId = row.empId.replace(/[^A-Za-z0-9_-]+/g, '') || 'employee';
    document.title = `Payslip_${employeeId}_${period}`;

    const restoreTitle = () => {
      document.title = previousTitle;
      window.removeEventListener('afterprint', restoreTitle);
    };
    window.addEventListener('afterprint', restoreTitle, { once: true });
    window.setTimeout(() => window.print(), 250);
  };

  const structureRows = onRoll.filter((e) => !isSelf || e.id === myId);
  /* Official payrolls only expose salaries to roles with payroll read
     access; others get an explicit note instead of zeroed numbers. */
  const canSeeOfficialStructure =
    !official || ['HR', 'ADMIN', 'SUPER_ADMIN'].includes(user?.role ?? '');
  const canRunOfficial =
    official && ['HR', 'ADMIN', 'SUPER_ADMIN'].includes(user?.role ?? '');
  const myEmployee = data.employees.find((e) => e.id === myId) ?? null;
  const myBreakdown = myEmployee ? salaryBreakdown(myEmployee.salary) : null;

  /* Employee payslip rows: official server records for real sessions, the
     demo runs otherwise — same table, same actions. */
  const slipRows = official
    ? (officialSlips ?? []).map((slip) => (
        <tr key={slip.id}>
          <td>
            <b>{periodLabel(slip.period)}</b>
            <span style={{ color: 'var(--text-2)', marginLeft: 8, fontSize: 12 }}>
              {slip.paid && slip.payDate ? `Paid ${niceDate(slip.payDate.slice(0, 10))}` : slip.status}
            </span>
          </td>
          <td className="num">{money(slip.gross)}</td>
          <td className="num">{money(slip.deductions)}</td>
          <td className="num">
            <b>{money(slip.net)}</b>
          </td>
          <td>
            <Pill status={slip.status} />
            {slip.reference ? (
              <div className="num" style={{ color: 'var(--muted)', fontSize: 11, marginTop: 4 }}>
                {slip.reference}
              </div>
            ) : null}
          </td>
          <td>
            <div className="act-btns">
              <button
                className="btn btn-outline btn-sm"
                disabled={slipBusy?.id === slip.id}
                onClick={() => void openPayslipPdf(slip.id)}
                type="button"
              >
                {slipBusy?.id === slip.id && slipBusy.mode === 'view' ? 'Preparing…' : 'View payslip'}
              </button>
              <button
                className="btn btn-outline btn-sm"
                disabled={slipBusy?.id === slip.id}
                onClick={() => void downloadPayslipPdf(slip.id)}
                type="button"
              >
                {slipBusy?.id === slip.id && slipBusy.mode === 'download' ? 'Preparing…' : 'Download PDF'}
              </button>
              {slip.id && archiveStatus.has(slip.id) && (
                <>
                  <span className="archive-status" style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 8 }}>
                    {(() => {
                      const status = archiveStatus.get(slip.id);
                      if (!status || !status.archived) return null;
                      const icons = {
                        'drive_uploaded': { icon: 'checkCircle', color: 'var(--success)', label: 'Drive OK' },
                        'drive_uploading': { icon: 'loader', color: 'var(--primary)', label: 'Syncing…' },
                        'drive_failed': { icon: 'alertTriangle', color: 'var(--danger)', label: 'Drive Failed' },
                        'server_saved': { icon: 'hardDrive', color: 'var(--muted)', label: 'Server Only' },
                      };
                      const iconInfo = icons[status.uploadStatus as keyof typeof icons] || { icon: 'helpCircle', color: 'var(--muted)', label: status.uploadStatus };
                      return (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: iconInfo.color }} title={iconInfo.label}>
                          <Icon name={iconInfo.icon} size={12} />
                        </span>
                      );
                    })()}
                  </span>
                  {archiveStatus.get(slip.id)?.uploadStatus === 'drive_failed' && (
                    <button
                      className="btn btn-ghost btn-sm"
                      disabled={slipBusy?.id === slip.id}
                      onClick={() => slip.id && void retryDriveUpload(slip.id).then(() => fetchArchiveStatusForSlip(slip.id))}
                      type="button"
                      title="Retry Google Drive upload"
                    >
                      <Icon name="rotateCw" size={12} /> Retry
                    </button>
                  )}
                </>
              )}
            </div>
          </td>
        </tr>
      ))
    : myRuns.map((r) => {
        const row = myRow(r);
        if (!row) return null;
        return (
          <tr key={r.id}>
            <td>
              <b>{periodLabel(r.period)}</b>
              <span style={{ color: 'var(--text-2)', marginLeft: 8, fontSize: 12 }}>
                {r.status === 'Processed' ? `Paid ${niceDate(r.payDate)}` : r.status}
              </span>
            </td>
            <td className="num">{money(row.gross)}</td>
            <td className="num">{money(row.ded)}</td>
            <td className="num">
              <b>{money(row.net)}</b>
            </td>
            <td>
              <Pill status={row.payStatus} />
              {row.txnRef && row.payStatus === 'Paid' ? (
                <div className="num" style={{ color: 'var(--muted)', fontSize: 11, marginTop: 4 }}>
                  {row.txnRef}
                </div>
              ) : null}
            </td>
            <td>
              <div className="act-btns">
                <button className="btn btn-outline btn-sm" onClick={() => setPayslip({ run: r, row })} type="button">
                  View payslip
                </button>
              </div>
            </td>
          </tr>
        );
      });

  /* ------------------------------------------------------------
     Employee self-service
     ------------------------------------------------------------ */
  if (isSelf) {
    return (
      <div className="grid">
        <section className="card span8">
          <PageHead title="My Payslips" sub="Monthly in-hand payslips issued by HR" />
          {official && officialSlips === null ? (
            <EmptyState
              icon="wallet"
              title="Loading payslips…"
              sub="Fetching your official payslips from the HR server."
            />
          ) : slipRows.length === 0 ? (
            <EmptyState
              icon="wallet"
              title="No payslips yet"
              sub="Payslips appear here as soon as HR processes a payroll run for the month."
            />
          ) : (
            <div className="table-scroll">
              <table className="data">
                <thead>
                  <tr>
                    <th>Period</th>
                    <th>Gross</th>
                    <th>Deductions</th>
                    <th>Net pay</th>
                    <th>Status</th>
                    <th aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>{slipRows}</tbody>
              </table>
            </div>
          )}
        </section>

        <section className="card span4">
          <div className="card-head">
            <div>
              <h2>{official ? 'My pay summary' : 'My salary structure'}</h2>
              <div className="sub">
                {official ? 'From your official payroll records' : 'Monthly in-hand components'}
              </div>
            </div>
          </div>
          {official ? (
            officialSlips === null ? (
              <EmptyState icon="user" title="Loading…" sub="Fetching your official summary from the HR server." />
            ) : officialSlips.length === 0 ? (
              <EmptyState
                icon="user"
                title="No payslips yet"
                sub="Your official salary summary appears once the first payslip is issued."
              />
            ) : (
              <DetailList
                rows={[
                  [`Latest gross (${periodLabel(officialSlips[0].period)})`, money(officialSlips[0].gross)],
                  ['Total deductions', money(officialSlips[0].deductions)],
                  ['Net in hand', <b key="n">{money(officialSlips[0].net)}</b>],
                  ['Payment status', officialSlips[0].status],
                ]}
              />
            )
          ) : myBreakdown ? (
            <DetailList
              rows={[
                ['Basic (50%)', money(myBreakdown.basic)],
                ['HRA (20%)', money(myBreakdown.hra)],
                ['Conveyance', money(CONVEYANCE)],
                ['Special allowance', money(myBreakdown.special)],
                ['Gross', <b key="g">{money(myBreakdown.gross)}</b>],
                ['Professional tax', `− ${money(PROFESSIONAL_TAX)}`],
              ]}
            />
          ) : (
            <EmptyState icon="user" title="No roster link" sub="This login is not linked to an employee record." />
          )}
          <div className="info-note" style={{ marginTop: 12 }}>
            <Icon name="info" size={14} /> The portal tracks monthly in-hand only — there is no CTC breakdown by design.
          </div>
        </section>

        {payslip ? <PayslipModal data={data} run={payslip.run} row={payslip.row} onClose={() => setPayslip(null)} onPrint={() => printPayslipDocument(payslip.run, payslip.row)} onDownload={() => handlePayslipDownload(payslip.run, payslip.row)} /> : null}
      </div>
    );
  }

  /* ------------------------------------------------------------
     HR / Admin console
     ------------------------------------------------------------ */
  const tabs = [
    { key: 'processing', label: 'Processing' },
    { key: 'payslips', label: 'Payslips' },
    { key: 'structure', label: 'Salary Structure' },
    { key: 'history', label: 'History' },
  ];

  return (
    <div className="grid">
      <section className="card span12">
        <div className="card-head">
          <div>
            <h2>Payroll</h2>
            <div className="sub">
              {official
                ? 'Official server payroll — drafts are generated from each employee’s salary structure'
                : `Basic 50% · HRA 20% · Conveyance ${money(CONVEYANCE)} · remainder as special allowance · PT ${money(PROFESSIONAL_TAX)} flat`}
            </div>
          </div>
          <div className="ana-head tools">
            <select
              className="select"
              style={{ width: 180, height: 36 }}
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              aria-label="Payroll period"
            >
              {periodOptions.map((p) => (
                <option key={p} value={p}>
                  {periodLabel(p)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <Tabs tabs={tabs} active={tab} onChange={(k) => setTab(k as typeof tab)} />

        <div style={{ marginTop: 16 }}>
          {tab === 'processing' ? (
            run ? (
              <>
                <div className="toolbar">
                  <Pill status={run.status} />
                  <span style={{ color: 'var(--text-2)', fontSize: 12 }}>
                    {run.id} · pay date {niceDate(run.payDate)} · {run.rows.length} employees
                  </span>
                  <span className="spacer" />
                  {official ? (
                    canRunOfficial ? (
                      <>
                        {!allProcessed ? (
                          <button
                            className="btn btn-outline btn-sm"
                            disabled={runBusy}
                            onClick={() => calculate(run)}
                            type="button"
                          >
                            <Icon name="refresh" size={14} /> {runBusy ? 'Working…' : 'Recalculate'}
                          </button>
                        ) : null}
                        {hasDraftSlips ? (
                          <button
                            className="btn btn-primary btn-sm"
                            disabled={runBusy}
                            onClick={() => approve(run)}
                            type="button"
                          >
                            <Icon name="check" size={14} /> Approve
                          </button>
                        ) : null}
                        {hasApprovedSlips ? (
                          <button
                            className="btn btn-primary btn-sm"
                            disabled={runBusy}
                            onClick={() => process(run)}
                            type="button"
                          >
                            <Icon name="banknote" size={14} /> Process payments
                          </button>
                        ) : null}
                        {allProcessed ? (
                          <span className="chip">
                            <Icon name="checkCircle" size={13} /> Payslips issued for {periodLabel(run.period)}
                          </span>
                        ) : null}
                      </>
                    ) : (
                      <span className="chip">Read-only — payroll actions need payroll write access</span>
                    )
                  ) : (
                    <>
                      {run.status === 'Draft' || run.status === 'Calculated' ? (
                        <button className="btn btn-outline btn-sm" onClick={() => calculate(run)} type="button">
                          <Icon name="refresh" size={14} /> Recalculate
                        </button>
                      ) : null}
                      {run.status === 'Calculated' ? (
                        <button className="btn btn-primary btn-sm" onClick={() => approve(run)} type="button">
                          <Icon name="check" size={14} /> Approve
                        </button>
                      ) : null}
                      {run.status === 'Approved' ? (
                        <button className="btn btn-primary btn-sm" onClick={() => process(run)} type="button">
                          <Icon name="banknote" size={14} /> Process payments
                        </button>
                      ) : null}
                      {run.status === 'Processed' ? (
                        <span className="chip">
                          <Icon name="checkCircle" size={13} /> Payslips issued for {periodLabel(run.period)}
                        </span>
                      ) : null}
                    </>
                  )}
                </div>

                {totals ? (
                  <StatRow
                    items={[
                      { k: 'Employees', v: run.rows.length },
                      { k: 'Gross', v: moneyCompact(totals.gross) },
                      { k: 'Deductions', v: moneyCompact(totals.ded) },
                      { k: 'Net payout', v: moneyCompact(totals.net) },
                      { k: 'Paid', v: `${totals.paid}/${run.rows.length}`, s: 'payslips' },
                    ]}
                  />
                ) : null}

                {run.source === 'api' ? (
                  /* Official slips store gross, deductions and net only —
                     no invented component split. */
                  <div className="table-scroll">
                    <table className="data">
                      <thead>
                        <tr>
                          <th>Employee</th>
                          <th>Gross</th>
                          <th>PF</th>
                          <th>TDS</th>
                          <th>ESI</th>
                          <th>Other ded.</th>
                          <th>Total ded.</th>
                          <th>Net pay</th>
                          <th>Status</th>
                          <th aria-label="Actions" />
                        </tr>
                      </thead>
                      <tbody>
                        {run.rows.map((row) => {
                          const emp = data.employees.find((e) => e.id === row.empId);
                          return (
                            <tr key={row.officialId ?? row.empId}>
                              <td>
                                <EmpCell name={emp?.name ?? row.empId} sub={emp?.designation ?? ''} seed={row.empId} />
                              </td>
                              <td className="num">{money(row.gross)}</td>
                              <td className="num">{row.pf ? money(row.pf) : '—'}</td>
                              <td className="num">{row.tds ? money(row.tds) : '—'}</td>
                              <td className="num">{row.esi ? money(row.esi) : '—'}</td>
                              <td className="num">{row.otherDed ? money(row.otherDed) : '—'}</td>
                              <td className="num">{money(row.ded)}</td>
                              <td className="num">
                                <b>{money(row.net)}</b>
                              </td>
                              <td>
                                <Pill status={row.officialStatus ?? 'Draft'} />
                              </td>
                              <td>
                                <div className="act-btns">
                                  <button
                                    className="btn btn-ghost btn-sm"
                                    disabled={slipBusy?.id === row.officialId}
                                    onClick={() => row.officialId && void openPayslipPdf(row.officialId)}
                                    type="button"
                                  >
                                    {slipBusy && slipBusy.id === row.officialId && slipBusy.mode === 'view'
                                      ? 'Preparing…'
                                      : 'Payslip PDF'}
                                  </button>
                                  <button
                                    className="btn btn-ghost btn-sm"
                                    disabled={slipBusy?.id === row.officialId}
                                    onClick={() => row.officialId && void downloadPayslipPdf(row.officialId)}
                                    type="button"
                                  >
                                    {slipBusy && slipBusy.id === row.officialId && slipBusy.mode === 'download'
                                      ? 'Preparing…'
                                      : 'Download PDF'}
                                  </button>
                                  {row.officialId && archiveStatus.has(row.officialId) && (
                                    <>
                                      <span className="archive-status" style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 8 }}>
                                        {(() => {
                                          const status = archiveStatus.get(row.officialId);
                                          if (!status || !status.archived) return null;
                                          const icons = {
                                            'drive_uploaded': { icon: 'checkCircle', color: 'var(--success)', label: 'Drive OK' },
                                            'drive_uploading': { icon: 'loader', color: 'var(--primary)', label: 'Syncing…' },
                                            'drive_failed': { icon: 'alertTriangle', color: 'var(--danger)', label: 'Drive Failed' },
                                            'server_saved': { icon: 'hardDrive', color: 'var(--muted)', label: 'Server Only' },
                                          };
                                          const iconInfo = icons[status.uploadStatus as keyof typeof icons] || { icon: 'helpCircle', color: 'var(--muted)', label: status.uploadStatus };
                                          return (
                                            <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: iconInfo.color }} title={iconInfo.label}>
                                              <Icon name={iconInfo.icon} size={12} />
                                            </span>
                                          );
                                        })()}
                                      </span>
                                      {archiveStatus.get(row.officialId)?.uploadStatus === 'drive_failed' && (
                                        <button
                                          className="btn btn-ghost btn-sm"
                                          disabled={slipBusy?.id === row.officialId}
                                          onClick={() => {
                                            const slipId = row.officialId;
                                            if (slipId) void retryDriveUpload(slipId).then(() => fetchArchiveStatusForSlip(slipId));
                                          }}
                                          type="button"
                                          title="Retry Google Drive upload"
                                        >
                                          <Icon name="rotateCw" size={12} /> Retry
                                        </button>
                                      )}
                                    </>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="table-scroll">
                    <table className="data">
                      <thead>
                        <tr>
                          <th>Employee</th>
                          <th>Basic</th>
                          <th>HRA</th>
                          <th>Conveyance</th>
                          <th>Special</th>
                          <th>Bonus</th>
                          <th>Gross</th>
                          <th>PT</th>
                          <th>Other ded.</th>
                          <th>Net pay</th>
                          <th>Status</th>
                          <th aria-label="Actions" />
                        </tr>
                      </thead>
                      <tbody>
                        {run.rows.map((row) => {
                          const emp = data.employees.find((e) => e.id === row.empId);
                          return (
                            <tr key={row.empId}>
                              <td>
                                <EmpCell name={emp?.name ?? row.empId} sub={emp?.designation ?? ''} seed={row.empId} />
                              </td>
                              <td className="num">{money(row.basic)}</td>
                              <td className="num">{money(row.hra)}</td>
                              <td className="num">{money(row.conv)}</td>
                              <td className="num">{money(row.special)}</td>
                              <td className="num">{row.bonus ? money(row.bonus) : '—'}</td>
                              <td className="num">{money(row.gross)}</td>
                              <td className="num">{money(row.pt)}</td>
                              <td className="num">{row.otherDed ? money(row.otherDed) : '—'}</td>
                              <td className="num">
                                <b>{money(row.net)}</b>
                              </td>
                              <td>
                                <Pill status={row.payStatus} />
                                {row.txnRef && row.payStatus === 'Paid' ? (
                                  <div className="num" style={{ color: 'var(--muted)', fontSize: 11, marginTop: 4 }}>
                                    {row.txnRef}
                                  </div>
                                ) : null}
                              </td>
                              <td>
                                <div className="act-btns">
                                  <button className="btn btn-ghost btn-sm" onClick={() => setPayslip({ run, row })} type="button">
                                    Payslip
                                  </button>
                                  {run.status !== 'Processed' ? (
                                    <button
                                      className="btn btn-outline btn-sm"
                                      onClick={() => {
                                        setAdjust({ run, row });
                                        setAdjBonus(String(row.bonus));
                                        setAdjDed(String(row.otherDed));
                                      }}
                                      type="button"
                                    >
                                      Adjust
                                    </button>
                                  ) : null}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                <div className="card-foot">
                  {run.source === 'api'
                    ? 'Official status flow: Draft → Approved → Processed. Recalculate regenerates every payslip in your scope from the salary register.'
                    : 'Status flow: Draft → Calculated → Approved → Processed. Recalculate pulls fresh salaries from the roster.'}
                </div>
              </>
            ) : (
              <EmptyState
                icon="wallet"
                title={`No run for ${periodLabel(period)}`}
                sub={
                  official
                    ? 'No official payslips exist for this period — draft them from the salary register.'
                    : 'A draft run is created automatically for the current month. Pick another period or start a run below.'
                }
                action={
                  official ? (
                    canRunOfficial ? (
                      <button
                        className="btn btn-primary btn-sm"
                        disabled={runBusy}
                        onClick={() => void officialAct('start', { period, rows: [], payDate: periodPayDate(period) })}
                        type="button"
                      >
                        <Icon name="plus" size={14} /> {runBusy ? 'Drafting…' : `Draft ${periodLabel(period)} payslips`}
                      </button>
                    ) : undefined
                  ) : (
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() =>
                        dispatch({
                          type: 'add',
                          collection: 'payrollRuns',
                          item: {
                            id: nextId('PR-', 3),
                            period,
                            status: 'Draft',
                            rows: onRoll.map((e) => buildPayrollRow(e)),
                            payDate: periodPayDate(period),
                          } satisfies PayrollRun,
                        })
                      }
                      type="button"
                    >
                      <Icon name="plus" size={14} /> Start {periodLabel(period)} run
                    </button>
                  )
                }
              />
            )
          ) : null}

          {tab === 'payslips' ? (
            runs.length === 0 ? (
              <EmptyState icon="wallet" title="No payslips yet" sub="Process a payroll run to issue payslips." />
            ) : (
              runs.map((r) => (
                <div key={r.id} style={{ marginBottom: 22 }}>
                  <div className="ana-head">
                    <div>
                      <h2>{periodLabel(r.period)}</h2>
                      <div className="sub">
                        {r.id} · {r.rows.length} payslips · pay date {niceDate(r.payDate)}
                      </div>
                    </div>
                    <div className="tools">
                      <Pill status={r.status} />
                      <button className="btn btn-outline btn-sm" onClick={() => setPeriod(r.period)} type="button">
                        Open run
                      </button>
                    </div>
                  </div>
                  <div className="table-scroll">
                    <table className="data">
                      <thead>
                        <tr>
                          <th>Employee</th>
                          <th>Gross</th>
                          <th>Deductions</th>
                          <th>Net pay</th>
                          <th>Payslip</th>
                        </tr>
                      </thead>
                      <tbody>
                        {r.rows.map((row) => {
                          const emp = data.employees.find((e) => e.id === row.empId);
                          return (
                            <tr key={`${r.id}-${row.empId}`}>
                              <td>
                                <EmpCell name={emp?.name ?? row.empId} sub={deptName(data.departments, emp?.dept)} seed={row.empId} />
                              </td>
                              <td className="num">{money(row.gross)}</td>
                              <td className="num">{money(row.ded)}</td>
                              <td className="num">
                                <b>{money(row.net)}</b>
                              </td>
                              <td>
                                <div className="act-btns">
                                  <button className="btn btn-outline btn-sm" onClick={() => setPayslip({ run: r, row })} type="button">
                                    View
                                  </button>
                                  <button className="btn btn-outline btn-sm" onClick={() => handlePayslipDownload(r, row)} type="button">
                                    Download PDF
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))
            )
          ) : null}

          {tab === 'structure' ? (
            !canSeeOfficialStructure ? (
              <EmptyState
                icon="user"
                title="Salary register needs payroll access"
                sub="Your role can open official payslips but not the salary register."
              />
            ) : (
            <>
              <div className="info-note" style={{ marginBottom: 14 }}>
                <Icon name="info" size={14} /> Structure derives from each employee's monthly in-hand: Basic 50%, HRA 20%,
                Conveyance {money(CONVEYANCE)}, remainder as special allowance, Professional Tax {money(PROFESSIONAL_TAX)} flat.
              </div>
              <div className="table-scroll">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Employee</th>
                      <th>Department</th>
                      <th>Basic</th>
                      <th>HRA</th>
                      <th>Conveyance</th>
                      <th>Special</th>
                      <th>Gross</th>
                      <th>PT</th>
                      <th>Net in-hand</th>
                    </tr>
                  </thead>
                  <tbody>
                    {structureRows.map((e) => {
                      const b = salaryBreakdown(e.salary);
                      const net = b.gross - PROFESSIONAL_TAX;
                      return (
                        <tr key={e.id}>
                          <td>
                            <EmpCell name={e.name} sub={e.grade} seed={e.id} />
                          </td>
                          <td>{deptName(data.departments, e.dept)}</td>
                          <td className="num">{money(b.basic)}</td>
                          <td className="num">{money(b.hra)}</td>
                          <td className="num">{money(b.conv)}</td>
                          <td className="num">{money(b.special)}</td>
                          <td className="num">{money(b.gross)}</td>
                          <td className="num">{money(PROFESSIONAL_TAX)}</td>
                          <td className="num">
                            <b>{money(net)}</b>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="card-foot">{structureRows.length} employees on the pay register.</div>
            </>
            )
          ) : null}

          {tab === 'history' ? (
            runs.length === 0 ? (
              <EmptyState icon="barChart" title="No payroll history" sub="Runs appear here once created." />
            ) : (
              <div className="table-scroll">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Run</th>
                      <th>Period</th>
                      <th>Employees</th>
                      <th>Net payout</th>
                      <th>Pay date</th>
                      <th>Status</th>
                      <th aria-label="Actions" />
                    </tr>
                  </thead>
                  <tbody>
                    {runs.map((r) => {
                      const net = r.rows.reduce((s, x) => s + x.net, 0);
                      return (
                        <tr key={r.id}>
                          <td className="num">{r.id}</td>
                          <td>
                            <b>{periodLabel(r.period)}</b>
                          </td>
                          <td className="num">{r.rows.length}</td>
                          <td className="num">{money(net)}</td>
                          <td className="num">{niceDate(r.payDate)}</td>
                          <td>
                            <Pill status={r.status} />
                          </td>
                          <td>
                            <div className="act-btns">
                              <button
                                className="btn btn-outline btn-sm"
                                onClick={() => {
                                  setPeriod(r.period);
                                  setTab('processing');
                                }}
                                type="button"
                              >
                                Open
                              </button>
                              {official ? null : (
                                <button
                                  className="btn btn-danger-outline btn-sm"
                                  onClick={() => {
                                    dispatch({ type: 'remove', collection: 'payrollRuns', id: r.id });
                                    audit('Payroll run deleted', r.id);
                                    toast(`${r.id} deleted.`, 'info');
                                  }}
                                  type="button"
                                >
                                  Delete
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )
          ) : null}
        </div>
      </section>

      {payslip ? <PayslipModal data={data} run={payslip.run} row={payslip.row} onClose={() => setPayslip(null)} onPrint={() => printPayslipDocument(payslip.run, payslip.row)} onDownload={() => handlePayslipDownload(payslip.run, payslip.row)} /> : null}

      {adjust ? (
        <Modal
          title="Adjust payslip"
          onClose={() => setAdjust(null)}
          footer={
            <>
              <button className="btn btn-ghost" onClick={() => setAdjust(null)} type="button">
                Cancel
              </button>
              <button className="btn btn-primary" onClick={saveAdjust} type="button">
                Save adjustment
              </button>
            </>
          }
        >
          <div className="detail-grid" style={{ marginBottom: 16 }}>
            <dt>Employee</dt>
            <dd>{empName(data.employees, adjust.row.empId)}</dd>
            <dt>Base net</dt>
            <dd className="num">{money(adjust.row.basic + adjust.row.hra + adjust.row.conv + adjust.row.special - adjust.row.pt)}</dd>
          </div>
          <div className="form-2col">
            <div className="field">
              <label htmlFor="adj-bonus">Bonus / incentive (₹)</label>
              <input id="adj-bonus" type="number" value={adjBonus} onChange={(e) => setAdjBonus(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="adj-ded">Other deductions (₹)</label>
              <input id="adj-ded" type="number" value={adjDed} onChange={(e) => setAdjDed(e.target.value)} />
            </div>
          </div>
          <div className="info-note">
            Gross = earnings + bonus ({money(Number(adjBonus || 0))}). Deductions = professional tax + other (
            {money(PROFESSIONAL_TAX + Number(adjDed || 0))}). Net updates live when the run is recalculated.
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

/* ---------------- Payslip dialog ---------------- */
function PayslipModal({
  data,
  run,
  row,
  onClose,
  onPrint,
  onDownload,
}: {
  data: AppData;
  run: PayrollRun;
  row: PayrollRow;
  onClose: () => void;
  onPrint: () => void;
  onDownload: () => void;
}) {
  const emp: Employee | undefined = data.employees.find((e) => e.id === row.empId);
  const earnings: Array<[string, number]> = [
    ['Basic salary', row.basic],
    ['House rent allowance', row.hra],
    ['Conveyance allowance', row.conv],
    ['Special allowance', row.special],
  ];
  if (row.bonus) earnings.push(['Bonus / incentive', row.bonus]);
  const deductions: Array<[string, number]> = [['Professional tax', row.pt]];
  if (row.otherDed) deductions.push(['Other deductions', row.otherDed]);

  return (
    <Modal
      title={`Payslip — ${periodLabel(run.period)}`}
      onClose={onClose}
      large
      className="payslip-modal"
      footer={
        <>
          <button className="btn btn-ghost" onClick={onPrint} type="button">
            <Icon name="printer" size={15} /> Print
          </button>
          <button className="btn btn-outline" onClick={onDownload} type="button">
            <Icon name="download" size={15} /> Download PDF
          </button>
          <button className="btn btn-primary" onClick={onClose} type="button">
            Close
          </button>
        </>
      }
    >
      <div className="payslip">
        <div className="ps-head">
          <div>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <img src={logoMark} alt="" style={{ height: 26 }} />
              CYETHACK
            </h3>
            <div style={{ color: 'var(--text-2)', fontSize: 12, marginTop: 2 }}>
              Payslip for {periodLabel(run.period)} · {run.id}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <Pill status={row.payStatus} />
            <div style={{ color: 'var(--text-2)', fontSize: 12, marginTop: 6 }}>Pay date: {niceDate(run.payDate)}</div>
          </div>
        </div>

        <div className="detail-grid" style={{ marginBottom: 16 }}>
          <dt>Employee</dt>
          <dd>{emp?.name ?? row.empId}</dd>
          <dt>Employee ID</dt>
          <dd className="num">{row.empId}</dd>
          <dt>Designation</dt>
          <dd>{emp?.designation ?? '—'}</dd>
          <dt>Department</dt>
          <dd>{deptName(data.departments, emp?.dept)}</dd>
          <dt>Date of joining</dt>
          <dd>{emp ? niceDate(emp.joining) : '—'}</dd>
          {row.txnRef && row.payStatus === 'Paid' ? (
            <>
              <dt>Payment ref</dt>
              <dd className="num">{row.txnRef}</dd>
            </>
          ) : null}
        </div>

        <div className="ps-grid">
          <div>
            <div className="payslip-heading" style={{ marginBottom: 8 }}>
              Earnings
            </div>
            <table>
              <tbody>
                {earnings.map(([label, value]) => (
                  <tr key={label}>
                    <td>{label}</td>
                    <td className="num" style={{ textAlign: 'right' }}>
                      {money(value)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="ps-total">
              <span>Gross earnings</span>
              <span>{money(row.gross)}</span>
            </div>
          </div>
          <div>
            <div className="payslip-heading" style={{ marginBottom: 8 }}>
              Deductions
            </div>
            <table>
              <tbody>
                {deductions.map(([label, value]) => (
                  <tr key={label}>
                    <td>{label}</td>
                    <td className="num" style={{ textAlign: 'right' }}>
                      {money(value)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="ps-total">
              <span>Total deductions</span>
              <span>{money(row.ded)}</span>
            </div>
          </div>
        </div>

        <div className="ps-net">
          <span>Net pay</span>
          <b>{money(row.net)}</b>
        </div>

        <div className="card-foot" style={{ borderTop: 'none', marginTop: 8 }}>
          This is a system-generated payslip. Query window: {dateRange(run.period + '-01', todayISO())} · payroll id {run.id}.
        </div>
      </div>
    </Modal>
  );
}
