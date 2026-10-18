/* ============================================================
   LineChart — responsive two-series line chart with a crosshair
   tooltip, built as plain SVG (no chart library).
   ============================================================ */
import { useEffect, useRef, useState } from 'react';

export interface LineSeries {
  name: string;
  color: string;
  values: number[];
}

interface LineChartProps {
  labels: string[];
  series: LineSeries[];
  height?: number;
  /** aria description of the data, rendered for screen readers */
  srSummary?: string;
}

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const update = () => setWidth(node.clientWidth);
    update();
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(update);
      ro.observe(node);
      return () => ro.disconnect();
    }
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  return [ref, width] as const;
}

/** Catmull-Rom → cubic bézier, for the soft original curve. */
function smoothPath(points: Array<[number, number]>): string {
  if (!points.length) return '';
  if (points.length < 3) return points.map((p, i) => `${i ? 'L' : 'M'}${p[0]} ${p[1]}`).join(' ');
  let d = `M${points[0][0]} ${points[0][1]}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${p2[0]} ${p2[1]}`;
  }
  return d;
}

export function LineChart({ labels, series, height = 230, srSummary }: LineChartProps) {
  const [wrapRef, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const [tipPos, setTipPos] = useState({ x: 0, y: 0 });

  const padL = 40;
  const padR = 14;
  const padT = 14;
  const padB = 28;
  const w = Math.max(320, width);
  const innerW = Math.max(10, w - padL - padR);
  const innerH = Math.max(10, height - padT - padB);
  const n = labels.length;

  const maxVal = Math.max(
    1,
    ...series.flatMap((s) => s.values),
  );
  const top = Math.ceil(maxVal / 20) * 20 || 10;
  const X = (i: number) => (n <= 1 ? padL : padL + (innerW * i) / (n - 1));
  const Y = (v: number) => padT + innerH - (v / top) * innerH;

  const gridLines = [0, 0.25, 0.5, 0.75, 1].map((f) => ({
    y: padT + innerH - f * innerH,
    value: Math.round(top * f),
  }));

  return (
    <div className="chart-wrap" style={{ height }} ref={wrapRef}>
      {width > 0 ? (
        <>
          <svg width={w} height={height} role="img" aria-label={srSummary || 'Line chart'}>
            {gridLines.map((g) => (
              <g key={g.value}>
                <line x1={padL} y1={g.y} x2={w - padR} y2={g.y} stroke="var(--border)" strokeWidth="1" />
                <text x={padL - 8} y={g.y + 4} textAnchor="end" fontSize="10" fill="var(--muted)" fontFamily="var(--mono)">
                  {g.value}
                </text>
              </g>
            ))}
            {labels.map((label, i) => {
              const show = n <= 8 || i % Math.ceil(n / 8) === 0 || i === n - 1;
              if (!show) return null;
              return (
                <text
                  key={`${label}-${i}`}
                  x={X(i)}
                  y={height - 8}
                  textAnchor="middle"
                  fontSize="10"
                  fill="var(--muted)"
                >
                  {label}
                </text>
              );
            })}
            {series.map((s) => (
              <path
                key={s.name}
                d={smoothPath(s.values.map((v, i) => [X(i), Y(v)]))}
                fill="none"
                stroke={s.color}
                strokeWidth="2"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ))}
            {series.map((s) => (
              <path
                key={`${s.name}-area`}
                d={`${smoothPath(s.values.map((v, i) => [X(i), Y(v)]))} L${X(n - 1)} ${padT + innerH} L${X(0)} ${padT + innerH} Z`}
                fill={s.color}
                opacity="0.08"
                stroke="none"
              />
            ))}
            {hover !== null && n > 0 ? (
              <g>
                <line
                  x1={X(hover)}
                  y1={padT}
                  x2={X(hover)}
                  y2={padT + innerH}
                  stroke="var(--hover-border)"
                  strokeWidth="1"
                  strokeDasharray="3 3"
                />
                {series.map((s) => (
                  <circle
                    key={`${s.name}-dot`}
                    cx={X(hover)}
                    cy={Y(s.values[hover] ?? 0)}
                    r="4.5"
                    fill={s.color}
                    stroke="var(--surface)"
                    strokeWidth="2"
                  />
                ))}
              </g>
            ) : null}
            <rect
              x={padL}
              y={padT}
              width={innerW}
              height={innerH}
              fill="transparent"
              style={{ cursor: 'crosshair' }}
              onMouseMove={(ev) => {
                const rect = (ev.currentTarget as SVGRectElement).getBoundingClientRect();
                const rel = (ev.clientX - rect.left) / Math.max(1, rect.width);
                const idx = Math.max(0, Math.min(n - 1, Math.round(rel * (n - 1))));
                setHover(idx);
                setTipPos({ x: ev.clientX, y: ev.clientY });
              }}
              onMouseLeave={() => setHover(null)}
            />
          </svg>
          {hover !== null ? (
            <div
              className="tooltip"
              style={{ left: Math.min(tipPos.x + 14, window.innerWidth - 200), top: tipPos.y + 14 }}
            >
              <div className="tt-title">{labels[hover]}</div>
              {series.map((s) => (
                <div className="tt-row" key={s.name}>
                  <span className="dot" style={{ background: s.color }} />
                  {s.name}
                  <b>{s.values[hover] ?? 0}</b>
                </div>
              ))}
            </div>
          ) : null}
          {srSummary ? <div className="sr-only">{srSummary}</div> : null}
        </>
      ) : null}
    </div>
  );
}
