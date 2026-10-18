/* ============================================================
   Mutation gate — defers page toasts while a server mutation is
   in flight.

   Feature pages dispatch a store action and toast "saved" in the
   same tick. For real (API) sessions the actual write is async, so
   a success message must not appear before the server confirms it —
   and must never appear when the call fails. The API bridge opens
   the gate for the duration of each call; the ToastProvider asks it
   whether a message should be shown now or held until the call
   settles (released on success, dropped on failure where the bridge
   itself reports the error).
   ============================================================ */

export interface GatedToast {
  message: string;
  kind: 'info' | 'success' | 'error';
}

type Emit = (toast: GatedToast) => void;

let depth = 0;
let queued: GatedToast[] = [];
let emit: Emit | null = null;

/** ToastProvider registers the real emitter on mount. */
export function setToastEmitter(fn: Emit | null): void {
  emit = fn;
}

export function mutationInFlight(): boolean {
  return depth > 0;
}

/** Open the gate — called by the API bridge before each server call. */
export function beginMutation(): void {
  depth += 1;
}

/**
 * Close the gate when the server call settles. Success releases the
 * toasts the page produced; failure drops them (the bridge shows the
 * real error message instead).
 */
export function endMutation(ok: boolean): void {
  depth = Math.max(0, depth - 1);
  if (depth > 0) return;
  const held = queued;
  queued = [];
  const fn = emit;
  if (ok && fn) held.forEach((t) => fn(t));
}

/** Returns true when the toast was captured (held) instead of shown. */
export function gateToast(message: string, kind: GatedToast['kind'] = 'info'): boolean {
  if (depth === 0) return false;
  queued.push({ message, kind });
  return true;
}

/** Surface a toast immediately, bypassing the gate (bridge errors). */
export function pushToast(message: string, kind: GatedToast['kind'] = 'info'): void {
  emit?.({ message, kind });
}
