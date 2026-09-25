const express = require("express");
const ctrl = require("../controllers/payrollController");
const authenticate = require("../middleware/authenticate");
const { requirePermission } = require("../middleware/authorize");

const router = express.Router();
router.use(authenticate);

router.get("/", ctrl.list); // own / all (scoped)
router.get("/:id/payslip", ctrl.getPayslip); // safe print/download projection
router.get("/:id", ctrl.getOne); // object-level ownership
router.post("/", requirePermission("payroll:write"), ctrl.create);
router.put("/:id", requirePermission("payroll:write"), ctrl.update);

module.exports = router;
