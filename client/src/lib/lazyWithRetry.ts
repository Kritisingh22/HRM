/* ============================================================
   lazyWithRetry — a React.lazy wrapper that survives transient
   dynamic-import / chunk-load failures.

   Vite splits the app into hashed chunks. If a chunk is missing
   (stale build, CDN cache, network blip), the dynamic `import()`
   rejects and React shows a blank/error boundary. This wrapper:

   1. Retries the import once after a short back-off (covers
      transient network hiccups).
   2. On a second failure, re-throws so the nearest ErrorBoundary
      can render a meaningful message with a Retry button.
   3. Logs the failed asset URL for debugging.

   Usage:
     const Page = lazyWithRetry(() =>
       import('@/features/some/Page').then((m) => ({ default: m.Page })),
     );
   ============================================================ */

import { lazy, type ComponentType } from 'react';

/* How long to wait before the retry attempt (ms). */
const RETRY_BACKOFF_MS = 800;

/* sessionStorage key that records the last build version for which
   a chunk-reload was attempted. When the build version changes we
   clear it so a new deploy can recover. Chosen separately from the
   generic chunkReloaded flag so the two mechanisms don't clash. */
const RETRY_KEY = 'cyethackHRM.lazyRetryBuild';

function buildVersion(): string {
  /* Read a build version stamp injected by the build step. Falls back
     to a timestamp so every local dev reload is treated as a new build. */
  try {
    const el = document.querySelector('meta[name="build-version"]');
    if (el) return (el as HTMLMetaElement).content;
  } catch {
    /* ignore */
  }
  return String(Date.now());
}

/* Record that we attempted recovery for this build so we don't loop. */
function markRecoveryAttempted(version: string): void {
  try {
    sessionStorage.setItem(RETRY_KEY, version);
  } catch {
    /* storage unavailable — recovery still attempted once */
  }
}

function recoveryAttemptedFor(version: string): boolean {
  try {
    return sessionStorage.getItem(RETRY_KEY) === version;
  } catch {
    return false;
  }
}

export function lazyWithRetry(
  importer: () => Promise<{ default: ComponentType<any> }>,
): ReturnType<typeof lazy> {
  const version = buildVersion();

  const loadWithRetry = async (): Promise<{ default: ComponentType<any> }> => {
    try {
      return await importer();
    } catch (firstErr) {
      /* Log the failure with as much detail as we can gather. */
      const failedUrl = (firstErr as Error & { message?: string }).message;
      // eslint-disable-next-line no-console
      console.warn(
        `[lazyWithRetry] dynamic import failed, retrying in ${RETRY_BACKOFF_MS}ms:`,
        failedUrl,
      );

      /* Brief back-off before retrying. */
      await new Promise((resolve) => setTimeout(resolve, RETRY_BACKOFF_MS));

      try {
        return await importer();
      } catch (secondErr) {
        /* Second failure — record the attempt and re-throw so the
           ErrorBoundary can show a recovery UI. */
        if (!recoveryAttemptedFor(version)) {
          markRecoveryAttempted(version);
        }
        // eslint-disable-next-line no-console
        console.error(
          '[lazyWithRetry] dynamic import failed after retry:',
          (secondErr as Error & { message?: string }).message,
        );
        throw secondErr;
      }
    }
  };

  return lazy(loadWithRetry);
}

export { buildVersion };
