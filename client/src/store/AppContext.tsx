/* ============================================================
   App store context — one reducer, one provider, typed helpers.

   Everything a feature needs to read or mutate the HRM dataset
   comes from `useApp()`:
     data      – the AppData root
     dispatch  – mutations (demo: the reducer; real session: the
                 API bridge translates and persists them)
     nextId    – mints `PREFIX-000` ids from the shared sequence
     audit     – writes to the Activity / Audit log
     notify    – pushes a bell notification
     reset     – wipes local changes and returns to the seed

   Two data sources answer the same screens:
     · demo sessions  → the seeded local dataset (unchanged);
     · real sessions  → the store is hydrated from the authenticated
       HRM API and every mutation is persisted through it.
   ============================================================ */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { AppData, Employee, LocationRecord } from '@/types';
import { api } from '@/api/client';
import { clearStoredData, loadData, saveData } from '@/store/persist';
import { reducer, type AppAction } from '@/store/reducer';
import { nextSeq } from '@/lib/format';
import { nowTime, todayISO } from '@/lib/date';
import { setAttendanceSource } from '@/lib/attendance';
import {
  bridgeActive,
  bridgedAction,
  configureBridge,
  dispatchBridged,
  emptyApiPatch,
  hydrateAll,
  localConfigMessage,
  setBridgeUser,
  type BridgeUser,
} from '@/store/apiBridge';
import { pushToast } from '@/store/mutationGate';

interface AppContextValue {
  data: AppData;
  dispatch: React.Dispatch<AppAction>;
  nextId: (prefix: string, width?: number) => string;
  audit: (action: string, record?: string, user?: string) => void;
  notify: (text: string) => void;
  reset: () => void;
  /**
   * Store a one-shot GPS capture (login / check-in / check-out).
   * Demo: a reducer write (mirrored to the demo backend). Real
   * session: forwarded to the API's login-session GPS endpoint —
   * the server keeps no separate attendance-GPS store.
   */
  logLocation: (input: Omit<LocationRecord, 'id'>) => LocationRecord;
  /** roster record of the signed-in person, when linked */
  currentEmployee: Employee | null;
  /** true while the store is fed by the real HRM API */
  apiMode: boolean;
  /** start API mode: clear demo data and hydrate from the server */
  enableApiSession: (user: BridgeUser) => void;
  /** leave API mode: wipe server data from the store and re-seed */
  disableApiSession: () => void;
}

/** Empty app data — used as the initial state before an API session
 *  is established. All data is fetched from the server; nothing is
 *  seeded locally. */
export function emptyAppData(): AppData {
  return {
    version: 1,
    employees: [],
    departments: [],
    designations: [],
    jobs: [],
    candidates: [],
    interviews: [],
    offers: [],
    onboarding: [],
    onboardingItems: [],
    projects: [],
    tasks: [],
    teamTasks: [],
    targets: [],
    reviews: [],
    training: [],
    promotions: [],
    transfers: [],
    exits: [],
    exitItems: [],
    exitChecklists: {},
    documents: [],
    announcements: [],
    tickets: [],
    todos: [],
    leaveRequests: [],
    leaveBalance: { total: 0, used: 0, casual: 0, sick: 0, paidEarned: 0 },
    attendanceOverrides: {},
    locationLog: [],
    holidays: [],
    payrollRuns: [],
    notifications: [],
    audit: [],
    events: [],
    funnel: [],
    currentUserId: '',
    seq: 0,
  };
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [data, rawDispatch] = useReducer(reducer, undefined, () => loadData() ?? emptyAppData());
  const [apiMode, setApiMode] = useState(false);
  const dataRef = useRef(data);
  dataRef.current = data;
  const seqRef = useRef(data.seq);
  seqRef.current = Math.max(seqRef.current, data.seq);

  useEffect(() => {
    saveData(data);
  }, [data]);

  /* The bridge reads the freshest state and writes server patches
     through the raw reducer (never through itself). */
  configureBridge({ dispatch: rawDispatch, getData: () => dataRef.current });

  /* Dispatch: page mutations flow to the API when a server session is
     active; demo sessions keep the plain reducer. Local-only writes
     (seq, currentUserId …) always go straight to the reducer. */
  const dispatch = useCallback((action: AppAction) => {
    if (bridgeActive() && (bridgedAction(action) || localConfigMessage(action))) {
      dispatchBridged(action, rawDispatch);
      return;
    }
    rawDispatch(action);
  }, []);

  const nextId = useCallback((prefix: string, width = 3) => {
    const { id, seq } = nextSeq(prefix, seqRef.current, width);
    seqRef.current = seq;
    rawDispatch({ type: 'set', patch: { seq } });
    return id;
  }, []);

  const audit = useCallback(
    (action: string, record = '', user = 'HR Admin') => {
      if (bridgeActive()) return; // the server keeps its own audit trail
      rawDispatch({
        type: 'set',
        patch: {
          audit: [
            { id: `AUD-${Date.now()}-${Math.round(Math.random() * 999)}`, action, user, date: todayISO(), time: nowTime(), record },
            ...dataRef.current.audit,
          ].slice(0, 120),
        },
      });
    },
    [],
  );

  const notify = useCallback((text: string) => {
    if (bridgeActive()) return; // the server raises notifications for real actions
    rawDispatch({
      type: 'set',
      patch: {
        notifications: [
          { id: `NTF-${Date.now()}`, text, time: 'just now', read: false },
          ...dataRef.current.notifications,
        ].slice(0, 30),
      },
    });
  }, []);

  const reset = useCallback(() => {
    clearStoredData();
    seqRef.current = 0;
    rawDispatch({ type: 'reset', data: emptyAppData() });
  }, []);

  const logLocation = useCallback(
    (input: Omit<LocationRecord, 'id'>): LocationRecord => {
      const record: LocationRecord = { id: nextId('GEO', 4), ...input };
      if (bridgeActive()) {
        /* The server stores login GPS on the session row itself; the
           location log is read back from there. No client-side copy. */
        if (input.kind === 'login') void api.recordLocation(record).catch(() => {});
        return record;
      }
      /* Optimistic local copy for the UI… */
      rawDispatch({ type: 'add', collection: 'locationLog', item: record });
      /* …and the backend write (the demo server persists it the way
         MongoDB would; a failure leaves the local copy standing). */
      void api.recordLocation(record).catch(() => {});
      return record;
    },
    [nextId],
  );

  const enableApiSession = useCallback((user: BridgeUser) => {
    setBridgeUser(user);
    setAttendanceSource(true);
    setApiMode(true);
    /* Clear demo content immediately — a real workspace must never
       show seeded records, not even for the moment the fetch takes. */
    rawDispatch({ type: 'set', patch: emptyApiPatch(user.employeeId) });
    hydrateAll()
      .then((patch) => rawDispatch({ type: 'set', patch }))
      .catch((err) => {
        pushToast(
          err instanceof Error ? err.message : 'Could not load your workspace from the server.',
          'error',
        );
      });
  }, []);

  const disableApiSession = useCallback(() => {
    setBridgeUser(null);
    setAttendanceSource(false);
    setApiMode(false);
    /* Server data must not linger in the browser after the session
       ends — wipe the persisted snapshot and return to empty state. */
    clearStoredData();
    seqRef.current = 0;
    rawDispatch({ type: 'reset', data: emptyAppData() });
  }, []);

  const currentEmployee = useMemo(
    () => data.employees.find((e) => e.id === data.currentUserId) ?? null,
    [data.employees, data.currentUserId],
  );

  const value = useMemo<AppContextValue>(
    () => ({
      data,
      dispatch,
      nextId,
      audit,
      notify,
      reset,
      logLocation,
      currentEmployee,
      apiMode,
      enableApiSession,
      disableApiSession,
    }),
    [data, dispatch, nextId, audit, notify, reset, logLocation, currentEmployee, apiMode, enableApiSession, disableApiSession],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside <AppProvider>');
  return ctx;
}

/** Convenience for the (rare) places that only need the dataset. */
export function useAppData(): AppData {
  return useApp().data;
}
