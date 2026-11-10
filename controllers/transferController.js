/* Transfer API — HR manages employee transfers, department changes, promotions.
 *  - HR with transfers:* permission: create, view all, approve, implement
 *  - Manager: view team transfers (read only)
 *  - Employee: view own transfers (read only)
 *  - When implemented, updates Employee record automatically */
const Transfer = require('../models/Transfer');
const Employee = require('../models/Employee');
const User = require('../models/User');
const Notification = require('../models/Notification');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');
const { logAudit } = require('../utils/audit');
const { userHasPermission } = require('../utils/permissions');
// Shared scoping (single source of truth — see utils/teamScope.js). An HR user
// is scoped to their OWN assigned employees (+ any live access-request grant),
// never every employee just because their role is HR — that was the bug here.
const { SEES_ALL, teamEmployeeIds } = require('../utils/teamScope');

async function myEmployee(user) {
  return Employee.findOne({
    $or: [{ user: user._id }, { employeeId: user.employeeId }],
  });
}

// True if this HR is allowed to see/act on the given employeeId: assigned to
// them, or covered by a live approved access-request grant (both already
// reflected in teamEmployeeIds's HR branch).
async function hrOwnsEmployee(user, employeeId) {
  if (user.role !== 'HR') return false;
  const ids = await teamEmployeeIds(user);
  const emp = await Employee.findOne({ employeeId }).select('_id');
  return !!emp && ids.some((id) => String(id) === String(emp._id));
}

/* GET /api/transfers */
exports.list = catchAsync(async (req, res) => {
  // Check permission
  if (!userHasPermission(req.user, 'transfers:read') && !userHasPermission(req.user, 'transfers:read_own')) {
    throw ApiError.forbidden('You do not have permission to view transfer records.');
  }
  
  let filter = {};
  if (SEES_ALL.includes(req.user.role) && userHasPermission(req.user, 'transfers:read')) {
    if (req.query.status) filter.status = req.query.status;
    if (req.query.type) filter.type = req.query.type;
  } else if (req.user.role === 'HR' || req.user.role === 'MANAGER') {
    // teamEmployeeIds already scopes HR to their assigned employees (+ any live
    // access-request grant) and MANAGER to their team — including themselves.
    const ids = await teamEmployeeIds(req.user);
    filter.employee = { $in: ids };
    if (req.query.status) filter.status = req.query.status;
  } else {
    const me = await myEmployee(req.user);
    filter.employee = me ? me._id : null;
    if (req.query.status) filter.status = req.query.status;
  }
  
  const transfers = await Transfer.find(filter)
    .populate('employee', 'employeeId fullName department designation location manager')
    .populate('initiatedBy', 'fullName email role')
    .populate('approvedBy', 'fullName email role')
    .populate('implementedBy', 'fullName email role')
    .sort({ createdAt: -1 })
    .limit(500);
  
  res.json({ count: transfers.length, transfers });
});

/* GET /api/transfers/:id */
exports.getOne = catchAsync(async (req, res) => {
  const transfer = await Transfer.findById(req.params.id)
    .populate('employee', 'employeeId fullName department designation location manager user')
    .populate('initiatedBy', 'fullName email role')
    .populate('approvedBy', 'fullName email role')
    .populate('implementedBy', 'fullName email role');
  
  if (!transfer) throw ApiError.notFound('Transfer record not found.');
  
  // Check access
  const me = await myEmployee(req.user);
  const isOwner = me && String(transfer.employee._id) === String(me._id);
  const isAdmin = SEES_ALL.includes(req.user.role);
  const isOwningHR = await hrOwnsEmployee(req.user, transfer.employee.employeeId);
  const isManager = req.user.role === 'MANAGER' && transfer.employee.manager === req.user.employeeId;
  
  if (!isOwner && !isAdmin && !isOwningHR && !isManager) {
    throw ApiError.forbidden('You do not have permission to view this transfer record.');
  }
  
  res.json({ transfer });
});

/* POST /api/transfers — HR creates transfer/department change */
exports.create = catchAsync(async (req, res) => {
  if (!userHasPermission(req.user, 'transfers:write')) {
    throw ApiError.forbidden('You do not have permission to create transfer records.');
  }
  
  const { employee, type, fromDepartment, fromDesignation, fromLocation, fromManager,
          toDepartment, toDesignation, toLocation, toManager, reason, effectiveDate } = req.body;
  
  if (!employee) throw ApiError.badRequest('Employee is required.');
  if (!type) throw ApiError.badRequest('Type is required.');
  if (!effectiveDate) throw ApiError.badRequest('Effective date is required.');
  
  // Validate employee exists
  const emp = await Employee.findById(employee);
  if (!emp) throw ApiError.notFound('Employee not found.');

  // An HR (not admin) may only initiate a transfer for an employee assigned to
  // them or covered by a live access-request grant — never any employee.
  if (!SEES_ALL.includes(req.user.role) && !(await hrOwnsEmployee(req.user, emp.employeeId))) {
    throw ApiError.forbidden('You can only create transfers for employees assigned to you.');
  }
  
  // Auto-populate from values if not provided
  const transferData = {
    employee,
    type,
    fromDepartment: fromDepartment || emp.department,
    fromDesignation: fromDesignation || emp.designation,
    fromLocation: fromLocation || emp.location,
    fromManager: fromManager || emp.manager,
    toDepartment: toDepartment || emp.department,
    toDesignation: toDesignation || emp.designation,
    toLocation: toLocation || emp.location,
    toManager: toManager || emp.manager,
    reason,
    effectiveDate: new Date(effectiveDate),
    initiatedBy: req.user._id,
    status: 'Pending'
  };
  
  const transfer = await Transfer.create(transferData);
  
  // Notify employee and managers
  await notifyTransferStakeholders(transfer, 'created');
  
  logAudit(req, {
    action: 'transfer.create',
    targetType: 'Transfer',
    targetId: transfer._id,
    description: `Created ${type} for ${emp.employeeId} (${emp.fullName}) effective ${effectiveDate}`
  });
  
  res.status(201).json({ transfer });
});

/* PUT /api/transfers/:id — HR approves/rejects/implements */
exports.update = catchAsync(async (req, res) => {
  const transfer = await Transfer.findById(req.params.id).populate('employee', 'employeeId fullName department designation location manager user');
  if (!transfer) throw ApiError.notFound('Transfer record not found.');
  
  const isAdmin = SEES_ALL.includes(req.user.role);
  const isOwningHR = req.user.role === 'HR' && (await hrOwnsEmployee(req.user, transfer.employee.employeeId));
  if (!isAdmin && !isOwningHR) {
    throw ApiError.forbidden('Only HR assigned to this employee (or an admin) can update this transfer record.');
  }
  
  if (!userHasPermission(req.user, 'transfers:approve')) {
    throw ApiError.forbidden('You do not have permission to approve transfers.');
  }
  
  const action = req.body.status; // Approved, Rejected, Implemented
  const validTransitions = {
    'Pending': ['Approved', 'Rejected'],
    'Approved': ['Implemented', 'Rejected'],
    'Rejected': ['Pending'], // Can reopen
  };
  
  if (action) {
    const allowed = validTransitions[transfer.status] || [];
    if (!allowed.includes(action)) {
      throw ApiError.badRequest(`Cannot transition from ${transfer.status} to ${action}.`);
    }
    
    transfer.status = action;
    
    if (action === 'Approved') {
      transfer.approvedBy = req.user._id;
      transfer.approvedAt = new Date();
      if (req.body.approvalNote !== undefined) transfer.approvalNote = req.body.approvalNote;
    } else if (action === 'Implemented') {
      transfer.implementedBy = req.user._id;
      transfer.implementedAt = new Date();
      // Apply the changes to the Employee record
      await applyTransferToEmployee(transfer);
    } else if (action === 'Rejected') {
      transfer.approvedBy = req.user._id;
      transfer.approvedAt = new Date();
      if (req.body.approvalNote !== undefined) transfer.approvalNote = req.body.approvalNote;
    }
  }
  
  // Allow updating other fields
  ['type', 'fromDepartment', 'fromDesignation', 'fromLocation', 'fromManager',
   'toDepartment', 'toDesignation', 'toLocation', 'toManager', 'reason', 'effectiveDate'].forEach(field => {
    if (req.body[field] !== undefined) transfer[field] = req.body[field];
  });
  
  await transfer.save();
  
  // Notify stakeholders
  await notifyTransferStakeholders(transfer, action || 'updated');
  
  logAudit(req, {
    action: 'transfer.update',
    targetType: 'Transfer',
    targetId: transfer._id,
    description: `Updated transfer for ${transfer.employee.employeeId}: status=${transfer.status}`
  });
  
  res.json({ transfer });
});

/* DELETE /api/transfers/:id — HR/Admin only */
exports.remove = catchAsync(async (req, res) => {
  if (!userHasPermission(req.user, 'transfers:delete')) {
    throw ApiError.forbidden('You do not have permission to delete transfer records.');
  }
  
  const transfer = await Transfer.findByIdAndDelete(req.params.id);
  if (!transfer) throw ApiError.notFound('Transfer record not found.');
  
  res.json({ ok: true });
});

// Helper: Apply transfer changes to Employee record
async function applyTransferToEmployee(transfer) {
  const emp = await Employee.findById(transfer.employee._id);
  if (!emp) return;
  
  const changes = [];
  if (transfer.toDepartment) { emp.department = transfer.toDepartment; changes.push(`department→${transfer.toDepartment}`); }
  if (transfer.toDesignation) { emp.designation = transfer.toDesignation; changes.push(`designation→${transfer.toDesignation}`); }
  if (transfer.toLocation) { emp.location = transfer.toLocation; changes.push(`location→${transfer.toLocation}`); }
  if (transfer.toManager) { emp.manager = transfer.toManager; changes.push(`manager→${transfer.toManager}`); }
  
  await emp.save();
  
  logAudit({ user: transfer.implementedBy }, {
    action: 'transfer.implement',
    targetType: 'Employee',
    targetId: emp._id,
    description: `Applied transfer changes to ${emp.employeeId}: ${changes.join(', ')}`
  });
}

// Helper: Notify employee, old/new managers of transfer
async function notifyTransferStakeholders(transfer, action) {
  try {
    const emp = transfer.employee;
    if (!emp || !emp.user) return;
    
    const notifications = [];
    
    // Notify employee
    notifications.push({
      user: emp.user,
      type: 'Transfer Update',
      title: `Transfer ${action.charAt(0).toUpperCase() + action.slice(1)} — ${transfer.type}`,
      message: `A ${transfer.type.toLowerCase()} has been ${action} for you. Effective: ${transfer.effectiveDate.toISOString().split('T')[0]}. Details: ${transfer.fromDepartment || '—'} → ${transfer.toDepartment || '—'}`,
      relatedEntity: { type: 'Transfer', id: transfer._id },
      channels: { inApp: true, email: false },
      priority: 'Normal',
      metadata: { transferId: transfer._id, action }
    });
    
    // Notify old manager if exists
    if (transfer.fromManager) {
      const oldManager = await Employee.findOne({ employeeId: transfer.fromManager }).populate('user').lean();
      if (oldManager && oldManager.user) {
        notifications.push({
          user: oldManager.user._id,
          type: 'Transfer Update',
          title: `Team Member Transfer ${action.charAt(0).toUpperCase() + action.slice(1)}`,
          message: `${emp.fullName} (${emp.employeeId}) is being transferred from your team. Effective: ${transfer.effectiveDate.toISOString().split('T')[0]}.`,
          relatedEntity: { type: 'Transfer', id: transfer._id },
          channels: { inApp: true, email: false },
          priority: 'Normal',
          metadata: { transferId: transfer._id, action, isManagerNotification: true }
        });
      }
    }
    
    // Notify new manager if exists
    if (transfer.toManager && transfer.toManager !== transfer.fromManager) {
      const newManager = await Employee.findOne({ employeeId: transfer.toManager }).populate('user').lean();
      if (newManager && newManager.user) {
        notifications.push({
          user: newManager.user._id,
          type: 'Transfer Update',
          title: `New Team Member Transfer ${action.charAt(0).toUpperCase() + action.slice(1)}`,
          message: `${emp.fullName} (${emp.employeeId}) is joining your team. Effective: ${transfer.effectiveDate.toISOString().split('T')[0]}.`,
          relatedEntity: { type: 'Transfer', id: transfer._id },
          channels: { inApp: true, email: false },
          priority: 'Normal',
          metadata: { transferId: transfer._id, action, isManagerNotification: true }
        });
      }
    }
    
    if (notifications.length > 0) {
      await Notification.insertMany(notifications);
    }
  } catch (err) {
    console.error('[Transfer] Failed to notify stakeholders:', err.message);
  }
}