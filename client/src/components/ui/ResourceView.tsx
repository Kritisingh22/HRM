/* ============================================================
   ResourceView — the CRUD workhorse.

   Every list module in the portal (employees, jobs, candidates,
   projects, documents…) is the same screen in different clothes:
   a toolbar, a table, row actions, a detail dialog and a
   validated create/edit form. This component encodes that once.
   ============================================================ */
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { Icon } from '@/components/ui/Icon';
import { Modal } from '@/components/ui/Modal';
import { DetailList, EmptyState, StatChip, type DetailRow, type StatChipSpec } from '@/components/ui/primitives';

export interface Column<T> {
  header: string;
  render: (row: T) => ReactNode;
  num?: boolean;
}

export interface FilterDef<T> {
  key: string;
  label: string;
  options: Array<{ value: string; label: string }>;
  match: (row: T, value: string) => boolean;
}

export interface ActionDef {
  key: string;
  label: string;
  /** outline = teal border, danger = red border, ghost = text */
  variant?: 'outline' | 'danger' | 'ghost';
}

export interface FieldDef {
  key: string;
  label: string;
  type?: 'text' | 'number' | 'date' | 'select' | 'textarea' | 'email' | 'tel';
  required?: boolean;
  options?: Array<{ value: string; label: string }>;
  half?: boolean;
  placeholder?: string;
  /** value pre-filled when creating a new record */
  fallback?: string;
}

export interface ResourceViewProps<T> {
  rows: T[];
  rowId: (row: T) => string;
  columns: Column<T>[];
  search?: (row: T) => string;
  filters?: Array<FilterDef<T>>;
  summary?: StatChipSpec[];
  /** extra per-row actions beyond the automatic View/Edit */
  actions?: (row: T) => ActionDef[];
  onAction?: (key: string, row: T) => void;
  detail?: (row: T) => DetailRow[];
  form?: FieldDef[];
  onCreate?: (values: Record<string, string>) => void;
  onUpdate?: (row: T, values: Record<string, string>) => void;
  createLabel?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  emptyIcon?: string;
}

function initialValues<T>(fields: FieldDef[], row: T | null): Record<string, string> {
  const out: Record<string, string> = {};
  fields.forEach((f) => {
    if (row) {
      const raw = (row as Record<string, unknown>)[f.key];
      out[f.key] = raw === undefined || raw === null ? '' : String(raw);
    } else {
      out[f.key] = f.fallback ?? (f.type === 'select' ? f.options?.[0]?.value ?? '' : '');
    }
  });
  return out;
}

export function ResourceView<T>({
  rows,
  rowId,
  columns,
  search,
  filters = [],
  summary = [],
  actions,
  onAction,
  detail,
  form,
  onCreate,
  onUpdate,
  createLabel,
  searchPlaceholder = 'Search…',
  emptyText = 'Nothing here yet.',
  emptyIcon = 'clipboardCheck',
}: ResourceViewProps<T>) {
  const [query, setQuery] = useState('');
  const [filterValues, setFilterValues] = useState<Record<string, string>>({});
  const [viewRow, setViewRow] = useState<T | null>(null);
  const [editRow, setEditRow] = useState<T | null>(null);
  const [creating, setCreating] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [invalid, setInvalid] = useState<Record<string, boolean>>({});

  /* Memoized so the Modal's focus-restore effect does not re-run on every
     keystroke (ResourceView re-renders as the user types). An inline arrow
     function here would get a new identity on each render, causing Modal
     to call first.focus() and steal focus from the input being typed in. */
  const handleClose = useCallback(() => {
    setCreating(false);
    setEditRow(null);
  }, []);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (q && search && !search(row).toLowerCase().includes(q)) return false;
      for (const f of filters) {
        const v = filterValues[f.key];
        if (v && v !== 'all' && !f.match(row, v)) return false;
      }
      return true;
    });
  }, [rows, query, search, filters, filterValues]);

  const openCreate = () => {
    if (!form) return;
    setValues(initialValues(form, null));
    setInvalid({});
    setCreating(true);
  };

  const openEdit = (row: T) => {
    if (!form) return;
    setValues(initialValues(form, row));
    setInvalid({});
    setEditRow(row);
  };

  const submit = () => {
    if (!form) return;
    const bad: Record<string, boolean> = {};
    form.forEach((f) => {
      if (f.required && !String(values[f.key] ?? '').trim()) bad[f.key] = true;
    });
    setInvalid(bad);
    if (Object.keys(bad).length) return;
    if (creating && onCreate) onCreate(values);
    else if (editRow && onUpdate) onUpdate(editRow, values);
    setCreating(false);
    setEditRow(null);
  };

  const formFields = form ?? [];
  const halfRows = formFields.filter((f) => f.half === true);

  return (
    <>
      <div className="toolbar">
        {search ? (
          <label className="toolbar-search">
            <Icon name="search" size={15} />
            <input
              type="search"
              value={query}
              placeholder={searchPlaceholder}
              onChange={(e) => setQuery(e.target.value)}
              aria-label={searchPlaceholder}
            />
          </label>
        ) : null}
        {filters.map((f) => (
          <select
            key={f.key}
            value={filterValues[f.key] ?? 'all'}
            onChange={(e) => setFilterValues((prev) => ({ ...prev, [f.key]: e.target.value }))}
            aria-label={f.label}
          >
            <option value="all">{f.label}</option>
            {f.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        ))}
        <span className="spacer" />
        {form && onCreate ? (
          <button className="btn btn-primary btn-sm" onClick={openCreate} type="button">
            <Icon name="plus" size={15} />
            {createLabel ?? 'Add'}
          </button>
        ) : null}
      </div>

      {summary.length ? (
        <div className="stat-row">
          {summary.map((s) => (
            <StatChip key={s.k} k={s.k} v={s.v} s={s.s} />
          ))}
        </div>
      ) : null}

      {visible.length === 0 ? (
        <EmptyState icon={emptyIcon} title="No records" sub={emptyText} />
      ) : (
        <div className="table-scroll">
          <table className="data">
            <thead>
              <tr>
                {columns.map((c) => (
                  <th key={c.header}>{c.header}</th>
                ))}
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => {
                const rowActions = actions ? actions(row) : [];
                return (
                  <tr key={rowId(row)}>
                    {columns.map((c) => (
                      <td key={c.header} className={c.num ? 'num' : undefined}>
                        {c.render(row)}
                      </td>
                    ))}
                    <td>
                      <div className="act-btns">
                        {detail ? (
                          <button className="btn btn-ghost btn-sm" onClick={() => setViewRow(row)} type="button">
                            View
                          </button>
                        ) : null}
                        {form && onUpdate ? (
                          <button className="btn btn-outline btn-sm" onClick={() => openEdit(row)} type="button">
                            Edit
                          </button>
                        ) : null}
                        {rowActions.map((a) => (
                          <button
                            key={a.key}
                            className={`btn btn-sm ${
                              a.variant === 'danger'
                                ? 'btn-danger-outline'
                                : a.variant === 'ghost'
                                  ? 'btn-ghost'
                                  : 'btn-outline'
                            }`}
                            onClick={() => onAction?.(a.key, row)}
                            type="button"
                          >
                            {a.label}
                          </button>
                        ))}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {viewRow && detail ? (
        <Modal title={`Details`} onClose={() => setViewRow(null)}>
          <DetailList rows={detail(viewRow)} />
        </Modal>
      ) : null}

      {creating || editRow ? (
        <Modal
          title={creating ? (createLabel ?? 'Add record') : 'Edit record'}
          onClose={handleClose}
          large
          footer={
            <>
              <button
                className="btn btn-ghost"
                onClick={() => {
                  setCreating(false);
                  setEditRow(null);
                }}
                type="button"
              >
                Cancel
              </button>
              <button className="btn btn-primary" onClick={submit} type="button">
                {creating ? createLabel ?? 'Add' : 'Save changes'}
              </button>
            </>
          }
        >
          <div className="form-2col">
            {formFields
              .filter((f) => !halfRows.includes(f))
              .map((f) => (
                <div key={f.key} className={`field${invalid[f.key] ? ' invalid' : ''}`}>
                  {renderFormField(f, values, (v) => setValues((prev) => ({ ...prev, [f.key]: v })))}
                  <div className="err">Please enter the {f.label.toLowerCase()}.</div>
                </div>
              ))}
          </div>
          {halfRows.length ? (
            <div className="form-2col">
              {halfRows.map((f) => (
                <div key={f.key} className={`field${invalid[f.key] ? ' invalid' : ''}`}>
                  {renderFormField(f, values, (v) => setValues((prev) => ({ ...prev, [f.key]: v })))}
                  <div className="err">Please enter the {f.label.toLowerCase()}.</div>
                </div>
              ))}
            </div>
          ) : null}
        </Modal>
      ) : null}
    </>
  );
}

function renderFormField(
  f: FieldDef,
  values: Record<string, string>,
  onChange: (value: string) => void,
): ReactNode {
  const id = `rf-${f.key}`;
  const value = values[f.key] ?? '';
  const label = <label htmlFor={id}>{f.label}</label>;
  if (f.type === 'select') {
    return (
      <>
        {label}
        <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
          {(f.options ?? []).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </>
    );
  }
  if (f.type === 'textarea') {
    return (
      <>
        {label}
        <textarea id={id} value={value} placeholder={f.placeholder} onChange={(e) => onChange(e.target.value)} />
      </>
    );
  }
  return (
    <>
      {label}
      <input
        id={id}
        type={f.type ?? 'text'}
        value={value}
        placeholder={f.placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </>
  );
}
