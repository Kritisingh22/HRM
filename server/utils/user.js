/* ============================================================
   safeUserJson — Centralized user serialization utility.

   Works on both Mongoose documents (have .toSafeJSON()) and
   lean/plain objects (from .lean() queries, no Mongoose methods).

   Never leaks passwordHash, refresh tokens, reset tokens, or
   authentication secrets. Always preserves employee and role info.

   Usage:
     const safe = safeUserJson(user);  // lean or document
     res.json({ user: safe });
   ============================================================ */

function safeUserJson(user) {
  if (user && typeof user.toSafeJSON === 'function') {
    return user.toSafeJSON();
  }
  // Lean / plain object fallback — manually project safe fields.
  return {
    id: user._id,
    employeeId: user.employeeId,
    name: user.fullName,
    email: user.email,
    role: user.role,
    department: user.department,
    designation: user.designation,
    status: user.status,
    accountStatus: user.accountStatus,
    mustChangePassword: user.mustChangePassword,
    permissions: user.permissions || [],
  };
}

module.exports = { safeUserJson };