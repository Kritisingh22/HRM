/* Tiny labelled-field wrapper so the module forms stay tidy and consistent.
 * The actual <input>/<select>/<textarea> is passed as children and inherits the
 * theme's base input styling. */
export function Field({ label, required, hint, error, full, children }) {
  return (
    <label className={'ws-field' + (full ? ' full' : '')}>
      <span className="ws-field-label">{label}{required && <em> *</em>}</span>
      {children}
      {hint && !error && <span className="ws-field-hint">{hint}</span>}
      {error && <span className="ws-field-err">{error}</span>}
    </label>
  );
}
