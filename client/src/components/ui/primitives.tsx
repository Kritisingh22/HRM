/* ============================================================
   Small shared UI primitives — the component vocabulary every
   feature composes: pills, avatars, progress, stat chips,
   detail lists, tabs, empty states.
   ============================================================ */
import { useState, type ReactNode } from 'react';
import { Icon } from '@/components/ui/Icon';
import { avatarColor, initials, statusClass } from '@/lib/format';

/* ---------------- Status pill ---------------- */
export function Pill({ status, children }: { status: string; children?: ReactNode }) {
  return <span className={`pill-status ${statusClass(status)}`}>{children ?? status}</span>;
}

/* ---------------- Avatar ---------------- */
export function Avatar({ name, size = 32, seed }: { name: string; size?: 32 | 36; seed?: string }) {
  return (
    <span
      className={`avatar avatar-${size}`}
      style={{ background: avatarColor(seed || name) }}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  );
}

/** Avatar + name + secondary line, the standard "who" table cell. */
export function EmpCell({
  name,
  sub,
  seed,
  size = 32,
}: {
  name: string;
  sub?: string;
  seed?: string;
  size?: 32 | 36;
}) {
  return (
    <span className="emp-cell">
      <Avatar name={name} seed={seed || name} size={size} />
      <span className="who">
        <b>{name}</b>
        {sub ? <span>{sub}</span> : null}
      </span>
    </span>
  );
}

/* ---------------- Progress ---------------- */
export function Progress({ value, label }: { value: number; label?: string }) {
  const pct = Math.max(0, Math.min(100, Math.round(value || 0)));
  return (
    <div>
      {label ? (
        <div className="progress-label">
          <span>{label}</span>
          <span className="pct">{pct}%</span>
        </div>
      ) : null}
      <div
        className="progress"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label ?? `Progress ${pct}%`}
      >
        <i style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** Compact inline bar for dense tables. */
export function InlineBar({ value, label }: { value: number; label?: string }) {
  const pct = Math.max(0, Math.min(100, Math.round(value || 0)));
  return (
    <span className="inline-bar-wrap">
      <span
        className="inline-bar"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label ?? `Progress ${pct}%`}
      >
        <i style={{ width: `${pct}%` }} />
      </span>
      <span className="pct">{pct}%</span>
    </span>
  );
}

/* ---------------- Stat chips ---------------- */
export interface StatChipSpec {
  k: string;
  v: ReactNode;
  s?: string;
}

export function StatChip({ k, v, s }: StatChipSpec) {
  return (
    <div className="stat-chip">
      <span className="k">{k}</span>
      <span className="v">{v}</span>
      {s ? <span className="s">{s}</span> : null}
    </div>
  );
}

export function StatRow({ items }: { items: StatChipSpec[] }) {
  if (!items.length) return null;
  return (
    <div className="stat-row">
      {items.map((item) => (
        <StatChip key={item.k} {...item} />
      ))}
    </div>
  );
}

/* ---------------- Detail list ---------------- */
export type DetailRow = string | [label: string, value: ReactNode];

/**
 * `<dl class="detail-grid">` renderer. A plain string renders as a
 * section heading; a `[label, value]` tuple renders as a row.
 */
export function DetailList({ rows }: { rows: DetailRow[] }) {
  return (
    <dl className="detail-grid">
      {rows.map((row, i) =>
        typeof row === 'string' ? (
          <dt className="section" key={`s-${i}`}>
            {row}
          </dt>
        ) : (
          <div style={{ display: 'contents' }} key={`${row[0]}-${i}`}>
            <dt>{row[0]}</dt>
            <dd>{row[1]}</dd>
          </div>
        ),
      )}
    </dl>
  );
}

/* ---------------- Tabs ---------------- */
export interface TabDef {
  key: string;
  label: string;
}

export function Tabs({
  tabs,
  active,
  onChange,
}: {
  tabs: TabDef[];
  active: string;
  onChange: (key: string) => void;
}) {
  if (tabs.length < 2) return null;
  return (
    <div className="tabs" role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          role="tab"
          aria-selected={tab.key === active}
          className={`tab${tab.key === active ? ' active' : ''}`}
          onClick={() => onChange(tab.key)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

/* ---------------- Empty state ---------------- */
export function EmptyState({
  icon = 'clipboardCheck',
  title,
  sub,
  action,
}: {
  icon?: string;
  title: string;
  sub?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="ic">
        <Icon name={icon} size={22} />
      </span>
      <span className="title">{title}</span>
      {sub ? <span className="sub">{sub}</span> : null}
      {action ? <span className="cta">{action}</span> : null}
    </div>
  );
}

/* ---------------- Section header (analytics/report pages) ---------------- */
export function PageHead({
  title,
  sub,
  tools,
}: {
  title: string;
  sub?: string;
  tools?: ReactNode;
}) {
  return (
    <div className="ana-head">
      <div>
        <h2>{title}</h2>
        {sub ? <div className="sub">{sub}</div> : null}
      </div>
      {tools ? <div className="tools">{tools}</div> : null}
    </div>
  );
}

/* ---------------- Inline notice ---------------- */
export function InfoNote({ children }: { children: ReactNode }) {
  return <div className="info-note">{children}</div>;
}

/* ---------------- Copy-to-clipboard button ---------------- */
export interface CopyButtonProps {
  value: string;
  label?: string;
  size?: 14 | 16 | 18;
}

/**
 * One-shot copy control: shows a copy icon, flips to a check for ~1.5s after
 * a successful copy, then reverts. Never exposes the value beyond the click.
 */
export function CopyButton({ value, label = 'Copy', size = 16 }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — silently fail, value remains selectable */
    }
  };

  return (
    <button
      className="copy-btn"
      onClick={handleCopy}
      type="button"
      title={label}
      aria-label={copied ? 'Copied' : label}
    >
      <Icon name={copied ? 'check' : 'copy'} size={size} />
      {copied ? <span className="copy-hint">Copied</span> : null}
    </button>
  );
}
