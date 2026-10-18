/* ============================================================
   DonutChart — department-distribution ring with hover highlight
   and an interactive legend, mirroring the dashboard spec.
   ============================================================ */
import { useState } from 'react';

export interface DonutDatum {
  label: string;
  value: number;
  color: string;
}

interface DonutChartProps {
  data: DonutDatum[];
  size?: number;
  ring?: number;
  centerLabel?: string;
  /** legend rows are clickable when provided */
  onSelect?: (datum: DonutDatum) => void;
  ariaLabel?: string;
}

export function DonutChart({
  data,
  size = 160,
  ring = 22,
  centerLabel = 'Employees',
  onSelect,
  ariaLabel,
}: DonutChartProps) {
  const [active, setActive] = useState<number | null>(null);
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const r = (size - ring) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const gap = 2.5; // degrees between segments

  let angle = -90;
  const segments = data.map((d) => {
    const sweep = (d.value / total) * 360 - gap;
    const a0 = angle + gap / 2;
    const a1 = a0 + sweep;
    const p0 = [cx + r * Math.cos((a0 * Math.PI) / 180), cy + r * Math.sin((a0 * Math.PI) / 180)];
    const p1 = [cx + r * Math.cos((a1 * Math.PI) / 180), cy + r * Math.sin((a1 * Math.PI) / 180)];
    angle += (d.value / total) * 360;
    return {
      d,
      path: `M${p0[0].toFixed(2)} ${p0[1].toFixed(2)} A${r} ${r} 0 ${sweep > 180 ? 1 : 0} 1 ${p1[0].toFixed(2)} ${p1[1].toFixed(2)}`,
    };
  });

  return (
    <div className="donut-wrap">
      <div className="donut-box">
        <svg
          width={size}
          height={size}
          role="img"
          aria-label={ariaLabel || `Donut chart: ${data.map((d) => `${d.label} ${d.value}`).join(', ')}`}
        >
          {segments.map((seg, i) => (
            <path
              key={seg.d.label}
              d={seg.path}
              fill="none"
              stroke={seg.d.color}
              strokeWidth={active === i ? ring + 4 : ring}
              style={{ transition: 'stroke-width .15s ease', cursor: onSelect ? 'pointer' : 'default' }}
              onMouseEnter={() => setActive(i)}
              onMouseLeave={() => setActive(null)}
              onClick={() => onSelect?.(seg.d)}
            />
          ))}
        </svg>
        <div className="donut-center">
          <div>
            <b>{total}</b>
            <span>{centerLabel}</span>
          </div>
        </div>
      </div>
      <div className="dept-legend">
        {data.map((d, i) => (
          <button
            key={d.label}
            className="dept-row"
            style={active === i ? { background: 'var(--hover)' } : undefined}
            onMouseEnter={() => setActive(i)}
            onMouseLeave={() => setActive(null)}
            onClick={() => onSelect?.(d)}
            type="button"
          >
            <span
              className="dot"
              style={{ width: 8, height: 8, borderRadius: '50%', background: d.color, flex: '0 0 auto' }}
            />
            <span className="name">{d.label}</span>
            <span className="nums">
              {d.value} · {Math.round((d.value / total) * 100)}%
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
