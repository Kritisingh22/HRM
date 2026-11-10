/* RFC 6266/5987 Content-Disposition builder — safe filenames for downloads.
 * Keeps a quoted ASCII fallback plus a UTF-8 encoded variant, and never emits
 * control characters/newlines into headers. */
'use strict';

function contentDisposition(name, attachment) {
  const type = attachment ? 'attachment' : 'inline';
  const raw = String(name || 'document');
  const ascii = raw.replace(/[\r\n"]/g, '').replace(/[^\x20-\x7E]/g, '_').slice(0, 180) || 'document';
  const encoded = encodeURIComponent(raw.slice(0, 180));
  return `${type}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

module.exports = { contentDisposition };
