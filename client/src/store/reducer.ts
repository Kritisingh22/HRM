/* ============================================================
   Store reducer — every mutation in the app flows through here.

   Collections are addressed generically (`add` / `update` /
   `remove`), so a new module only needs a new collection on the
   root object — no bespoke reducer case per screen.
   ============================================================ */
import type { AppData, AttendanceRecord } from '@/types';

/** Keys of `AppData` whose value is an array of records. */
export type CollectionKey = {
  [K in keyof AppData]: AppData[K] extends Array<unknown> ? K : never;
}[keyof AppData];

/** Element type of the array stored at `collection`. */
type RowOf<K extends CollectionKey> = AppData[K] extends Array<infer T> ? T : never;

/** Internal row view — every stored record is addressable by `id`. */
interface WithId {
  id: string;
}
type Row = WithId & Record<string, unknown>;

/**
 * Collection mutations are correlated with their member type, so
 * `dispatch({ type: 'add', collection: 'employees', item })` requires a
 * complete `Employee` — a typo in a field name fails at compile time.
 */
export type AppAction =
  | {
      [K in CollectionKey]: { type: 'add'; collection: K; item: RowOf<K>; prepend?: boolean };
    }[CollectionKey]
  | {
      [K in CollectionKey]: { type: 'update'; collection: K; id: string; patch: Record<string, unknown> };
    }[CollectionKey]
  | {
      [K in CollectionKey]: { type: 'remove'; collection: K; id: string };
    }[CollectionKey]
  /** Write a raw attendance record keyed `employeeId|iso`. */
  | { type: 'override'; key: string; record: AttendanceRecord }
  /** Shallow-merge anything that is not a collection (seq, notifications…). */
  | { type: 'set'; patch: Partial<AppData> }
  /** Replace the whole dataset (reset / import). */
  | { type: 'reset'; data: AppData };

function asArray(data: AppData, key: CollectionKey): Row[] {
  return (data[key] as unknown as Row[]) ?? [];
}

export function reducer(state: AppData, action: AppAction): AppData {
  switch (action.type) {
    case 'add': {
      const rows = asArray(state, action.collection);
      const item = action.item as unknown as Row;
      const next = action.prepend ? [item, ...rows] : [...rows, item];
      return { ...state, [action.collection]: next } as AppData;
    }
    case 'update': {
      const rows = asArray(state, action.collection);
      const next = rows.map((r) => (r.id === action.id ? { ...r, ...action.patch } : r));
      return { ...state, [action.collection]: next } as AppData;
    }
    case 'remove': {
      const rows = asArray(state, action.collection);
      const next = rows.filter((r) => r.id !== action.id);
      return { ...state, [action.collection]: next } as AppData;
    }
    case 'override': {
      return {
        ...state,
        attendanceOverrides: { ...state.attendanceOverrides, [action.key]: action.record },
      };
    }
    case 'set':
      return { ...state, ...action.patch };
    case 'reset':
      return action.data;
    default:
      return state;
  }
}
