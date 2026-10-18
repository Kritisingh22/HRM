/* ============================================================
   Funnel — recruitment pipeline bars with conversion tooltips,
   matching the dashboard's teal-ramp funnel.
   ============================================================ */
import { useState } from 'react';
import type { FunnelStage } from '@/types';

interface FunnelProps {
  stages: FunnelStage[];
  onSelect?: (stage: FunnelStage) => void;
}

export function Funnel({ stages, onSelect }: FunnelProps) {
  const [tip, setTip] = useState<{ text: string; x: number; y: number } | null>(null);
  if (!stages.length) return <div className="empty">No pipeline data.</div>;
  const max = Math.max(1, stages[0].count);
  return (
    <div>
      {stages.map((stage, i) => {
        const previous = stages[i - 1];
        const conversion =
          i === 0
            ? '100% of all candidates'
            : `${Math.round((stage.count / Math.max(1, previous.count)) * 100)}% of ${previous.stage}`;
        return (
          <button
            key={stage.stage}
            className="funnel-row"
            type="button"
            onMouseMove={(ev) => setTip({ text: `${stage.stage}: ${stage.count} — ${conversion}`, x: ev.clientX, y: ev.clientY })}
            onMouseLeave={() => setTip(null)}
            onClick={() => onSelect?.(stage)}
          >
            <span className="stage">{stage.stage}</span>
            <span className="track">
              <span
                className="bar"
                style={{ width: `${(stage.count / max) * 100}%`, background: stage.color }}
              />
            </span>
            <span className="count">{stage.count}</span>
          </button>
        );
      })}
      {tip ? (
        <div className="tooltip" style={{ left: Math.min(tip.x + 14, window.innerWidth - 220), top: tip.y + 14 }}>
          <div className="tt-title">{tip.text}</div>
        </div>
      ) : null}
    </div>
  );
}
