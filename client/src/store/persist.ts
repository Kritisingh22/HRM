/* ============================================================
   Persistence — one versioned localStorage key.

   The persisted snapshot is merged over a fresh seed so new
   collections added in a later version never break an existing
   browser. If storage is unavailable, the portal runs from
   memory for the session.
   ============================================================ */
import type { AppData } from '@/types';
import { createSeedData } from '@/data/seed';

export const STORAGE_KEY = 'cyethackHRM.v1';
const CURRENT_VERSION = 1;

let storageOK = true;

function storageAvailable(): boolean {
  if (storageOK === false) return false;
  try {
    const probe = '__hrm_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return true;
  } catch {
    storageOK = false;
    return false;
  }
}

/** Persisted snapshot → complete `AppData`, filling gaps from the seed. */
export function hydrateData(raw: unknown): AppData | null {
  if (!raw || typeof raw !== 'object') return null;
  const stored = raw as Partial<AppData> & { version?: number };
  if (stored.version !== CURRENT_VERSION) return null;

  const seed = createSeedData();
  const out: AppData = { ...seed };
  (Object.keys(seed) as Array<keyof AppData>).forEach((key) => {
    const value = stored[key];
    if (Array.isArray(seed[key])) {
      if (Array.isArray(value)) (out as unknown as Record<string, unknown>)[key] = value;
    } else if (value !== undefined) {
      (out as unknown as Record<string, unknown>)[key] = value;
    }
  });
  // Records are plain data; a malformed snapshot should not kill the boot.
  out.currentUserId = typeof stored.currentUserId === 'string' ? stored.currentUserId : seed.currentUserId;
  out.seq = typeof stored.seq === 'number' ? stored.seq : seed.seq;

  // Older snapshots predate leave decision timestamps: adopt the seed's
  // value for decided rows the seed also knows about (matched by id).
  if (Array.isArray(stored.leaveRequests) && stored.leaveRequests.length) {
    const seededAt = new Map(seed.leaveRequests.map((r) => [r.id, r.decidedAt]));
    out.leaveRequests = stored.leaveRequests.map((r) => {
      if (r.decidedAt !== undefined || r.status === 'Pending') return r;
      const seeded = seededAt.get(r.id);
      return seeded ? { ...r, decidedAt: seeded } : r;
    });
  }
  return out;
}

export function loadData(): AppData | null {
  if (!storageAvailable()) return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return hydrateData(JSON.parse(raw));
  } catch {
    return null;
  }
}

let saveTimer: number | undefined;

/** Debounced save so rapid edits collapse into one write. */
export function saveData(data: AppData): void {
  if (!storageAvailable()) return;
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...data, version: CURRENT_VERSION }));
    } catch {
      storageOK = false;
    }
  }, 600);
}

export function clearStoredData(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function isPersistenceDisabled(): boolean {
  return !storageOK;
}
