const express = require("express");
const ctrl = require("../controllers/payrollController");
const authenticate = require("../middleware/authenticate");
const ApiError = require("../utils/ApiError");
const { userHasPermission } = require("../utils/permissions");

const router = express.Router();
router.use(authenticate);

function requirePayrollPermission(permission) {
  return (req, res, next) => {
    if (!userHasPermission(req.user, permission)) {
      return next(
        ApiError.forbidden(
          "You do not have permission to perform this action.",
        ),
      );
    }
    next();
  };
}

router.post("/employee/:employeeId/generate", ctrl.generateForEmployee);

// Debug endpoint to test teamEmployeeIds
router.get("/debug/team-ids", authenticate, async (req, res) => {
  try {
    const { teamEmployeeIds } = require("../utils/teamScope");
    const ids = await teamEmployeeIds(req.user);
    res.json({ userId: req.user.employeeId, role: req.user.role, teamIds: ids.map(id => id.toString()) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/", ctrl.list); // own / all (scoped)
router.post(
  "/generate",
  requirePayrollPermission("payroll:write"),
  ctrl.generate,
);
router.post("/employee/:employeeId/generate", ctrl.generateForEmployee);
router.get("/:id/payslip", ctrl.getPayslip); // safe print/download projection
router.get("/:id/download", ctrl.downloadPDF); // download PDF with signed URL
router.get("/:id", ctrl.getOne); // object-level ownership
router.post("/", requirePayrollPermission("payroll:write"), ctrl.create);
router.put("/:id", requirePayrollPermission("payroll:write"), ctrl.update);

module.exports = router;
