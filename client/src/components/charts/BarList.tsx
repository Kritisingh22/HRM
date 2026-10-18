/* ============================================================
   BarList — horizontal bars used by Analytics and Reports.
   Rows can be clickable to drill into a filter.
   ============================================================ */
export interface BarItem {
  key: string;
  label: string;
  value: number;
  color: string;
  hint?: string;
}

interface BarListProps {
  items: BarItem[];
  format?: (value: number) => string;
  onSelect?: (item: BarItem) => void;
  /** a row counts as "active" when it is part of the current drill filter */
  isActive?: (item: BarItem) => boolean;
}

export function BarList({ items, format, onSelect, isActive }: BarListProps) {
  const max = Math.max(1, ...items.map((i) => i.value));
  if (!items.length) return <div className="empty">No data for this selection.</div>;
  return (
    <div className="ana-bars">
      {items.map((item) => {
        const active = isActive?.(item) ?? false;
        const width = Math.max(2, (item.value / max) * 100);
        const className = `ana-bar-row${onSelect ? ' ana-clk' : ''}`;
        const content = (
          <>
            <span className="nm" title={item.label}>
              {item.label}
            </span>
            <span className="ana-track">
              <span
                className="ana-fill"
                style={{ width: `${width}%`, background: item.color, opacity: active ? 1 : 0.85 }}
              />
            </span>
            <span className="vl">{format ? format(item.value) : item.value}</span>
          </>
        );
        return onSelect ? (
          <button key={item.key} className={className} onClick={() => onSelect(item)} type="button">
            {content}
          </button>
        ) : (
          <div key={item.key} className={className}>
            {content}
          </div>
        );
      })}
    </div>
  );
}
