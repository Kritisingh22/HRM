/* Request timeout middleware — caps how long any request can occupy the
   event loop. Prevents a single hung handler from exhausting the server
   under load (WEB_CONCURRENCY=1 on Render free tier).

   Default timeout: 30s. API routes get 10s (they should be fast).
   Sets X-Request-Timeout header so clients can distinguish timeouts.
*/

const DEFAULT_TIMEOUT_MS = 30_000;
const API_TIMEOUT_MS = 10_000;

function requestTimeout(timeoutMs = DEFAULT_TIMEOUT_MS) {
  return (req, res, next) => {
    let timer;
    const settled = () => { clearTimeout(timer); };

    res.on('finish', settled);
    res.on('close', settled);

    timer = setTimeout(() => {
      if (!res.writableEnded) {
        res.setHeader('X-Request-Timeout', 'true');
        res.status(504).json({ error: 'Request timeout — the server took too long to respond.' });
      }
    }, timeoutMs);

    next();
  };
}

/* Shorter timeout for API routes — they should respond quickly or fail. */
function apiTimeout(req, res, next) {
  return requestTimeout(API_TIMEOUT_MS)(req, res, next);
}

module.exports = { requestTimeout, apiTimeout };
