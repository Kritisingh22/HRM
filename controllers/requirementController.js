/* Requirement API — Manager submits requirement requests for their team.
 *  - Manager: create, view own requests
 *  - HR/Admin: view all, review (approve/reject/on hold), create linked hiring jobs
 *  - Notifications sent to HR on new requests */
const Requirement = require('../models/Requirement');
const Hiring = require('../models/Hiring');
const User = require('../models/User');
const Employee = require('../models/Employee');
const Notification = require('../models/Notification');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');
const { logAudit } = require('../utils/audit');
const { userHasPermission } = require('../utils/permissions');

const SEES_ALL = ['HR', 'ADMIN', 'SUPER_ADMIN'];

async function myEmployee(user) {
  return Employee.findOne({
    $or: [{ user: user._id }, { employeeId: user.employeeId }],
  });
}

/* GET /api/requirements */
exports.list = catchAsync(async (req, res) => {
  // Check permission
  if (!userHasPermission(req.user, 'requirements:read') && !userHasPermission(req.user, 'requirements:read_own')) {
    throw ApiError.forbidden('You do not have permission to view requirement requests.');
  }
  
  let filter = {};
  if (SEES_ALL.includes(req.user.role) && userHasPermission(req.user, 'requirements:read')) {
    // HR/Admin see all
    if (req.query.status) filter.status = req.query.status;
  } else if (req.user.role === 'MANAGER') {
    // Manager sees only their own requests
    filter.requestedBy = req.user._id;
    if (req.query.status) filter.status = req.query.status;
  } else {
    // Employee - no access by default
    throw ApiError.forbidden('You do not have permission to view requirement requests.');
  }
  
  const requirements = await Requirement.find(filter)
    .populate('requestedBy', 'fullName email role')
    .populate('reviewedBy', 'fullName email role')
    .populate('linkedJob', 'jobId title status')
    .sort({ createdAt: -1 })
    .limit(500);
  
  res.json({ count: requirements.length, requirements });
});

/* GET /api/requirements/:id */
exports.getOne = catchAsync(async (req, res) => {
  const requirement = await Requirement.findById(req.params.id)
    .populate('requestedBy', 'fullName email role')
    .populate('reviewedBy', 'fullName email role')
    .populate('linkedJob', 'jobId title status department openings');
  
  if (!requirement) throw ApiError.notFound('Requirement request not found.');
  
  // Check access
  const isOwner = String(requirement.requestedBy._id) === String(req.user._id);
  const isHR = SEES_ALL.includes(req.user.role);
  if (!isOwner && !isHR) {
    throw ApiError.forbidden('You do not have permission to view this requirement request.');
  }
  
  res.json({ requirement });
});

/* POST /api/requirements — Manager creates requirement request */
exports.create = catchAsync(async (req, res) => {
  // Check permission
  if (!userHasPermission(req.user, 'requirements:write') && !userHasPermission(req.user, 'requirements:write_own')) {
    throw ApiError.forbidden('You do not have permission to create requirement requests.');
  }
  
  const { title, description, department, team, requiredCount, skills, priority } = req.body;
  
  if (!title) throw ApiError.badRequest('Title is required.');
  if (!department) throw ApiError.badRequest('Department is required.');
  if (!team) throw ApiError.badRequest('Team is required.');
  
  const requirement = await Requirement.create({
    title,
    description,
    department,
    team,
    requiredCount: requiredCount || 1,
    skills,
    priority: priority || 'Normal',
    requestedBy: req.user._id,
    status: 'Pending',
  });
  
  // Notify HR users
  await notifyHR(requirement);
  
  logAudit(req, {
    action: 'requirement.create',
    targetType: 'Requirement',
    targetId: requirement._id,
    description: `Created requirement request: ${title} for ${team} (${requiredCount} position(s))`
  });
  
  res.status(201).json({ requirement });
});

/* PUT /api/requirements/:id — Update requirement (Manager: own pending; HR: review) */
exports.update = catchAsync(async (req, res) => {
  const requirement = await Requirement.findById(req.params.id);
  if (!requirement) throw ApiError.notFound('Requirement request not found.');
  
  const isOwner = String(requirement.requestedBy) === String(req.user._id);
  const isHR = SEES_ALL.includes(req.user.role);
  const action = req.body.status;
  
  // Manager can update their own pending requests
  if (isOwner && !isHR) {
    if (requirement.status !== 'Pending') {
      throw ApiError.badRequest('You can only edit pending requests.');
    }
    // Allow updating fields except status transitions to approved/rejected
    const allowedFields = ['title', 'description', 'department', 'team', 'requiredCount', 'skills', 'priority'];
    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) requirement[field] = req.body[field];
    });
    // Manager can withdraw (set to Cancelled equivalent - we'll use Rejected with note)
    if (action === 'Cancelled') {
      requirement.status = 'Rejected';
      requirement.reviewNote = req.body.reviewNote || 'Withdrawn by requester';
      requirement.reviewedBy = req.user._id;
      requirement.reviewedAt = new Date();
    }
  } 
  // HR/Admin can review and update status
  else if (isHR) {
    if (!userHasPermission(req.user, 'requirements:approve')) {
      throw ApiError.forbidden('You do not have permission to review requirement requests.');
    }
    
    // Status transitions
    if (action) {
      const validTransitions = {
        'Pending': ['Under Review', 'Approved', 'Rejected', 'On Hold'],
        'Under Review': ['Approved', 'Rejected', 'On Hold', 'Pending'],
        'On Hold': ['Under Review', 'Approved', 'Rejected', 'Pending'],
      };
      
      const allowed = validTransitions[requirement.status] || [];
      if (!allowed.includes(action)) {
        throw ApiError.badRequest(`Cannot transition from ${requirement.status} to ${action}.`);
      }
      
      requirement.status = action;
      requirement.reviewedBy = req.user._id;
      requirement.reviewedAt = new Date();
      if (req.body.reviewNote !== undefined) requirement.reviewNote = req.body.reviewNote;
    }
    
    // HR can also update other fields
    ['title', 'description', 'department', 'team', 'requiredCount', 'skills', 'priority'].forEach(field => {
      if (req.body[field] !== undefined) requirement[field] = req.body[field];
    });
  } else {
    throw ApiError.forbidden('You do not have permission to update this requirement request.');
  }
  
  await requirement.save();
  
  // Notify requester of status change
  if (action && action !== requirement.status) {
    await notifyRequester(requirement, action);
  }
  
  logAudit(req, {
    action: 'requirement.update',
    targetType: 'Requirement',
    targetId: requirement._id,
    description: `Updated requirement request: ${requirement.title} (status: ${requirement.status})`
  });
  
  res.json({ requirement });
});

/* POST /api/requirements/:id/create-job — HR creates linked hiring job from requirement */
exports.createJob = catchAsync(async (req, res) => {
  const requirement = await Requirement.findById(req.params.id);
  if (!requirement) throw ApiError.notFound('Requirement request not found.');
  
  if (!SEES_ALL.includes(req.user.role)) {
    throw ApiError.forbidden('Only HR can create hiring jobs from requirements.');
  }
  
  if (!userHasPermission(req.user, 'hiring:write')) {
    throw ApiError.forbidden('You do not have permission to create hiring jobs.');
  }
  
  if (requirement.linkedJob) {
    throw ApiError.badRequest('A hiring job has already been created for this requirement.');
  }
  
  const { jobId, location, openings, description } = req.body;
  
  if (!jobId) throw ApiError.badRequest('Job ID is required.');
  if (!openings) throw ApiError.badRequest('Number of openings is required.');
  
  const job = await Hiring.create({
    jobId,
    title: requirement.title,
    department: requirement.department,
    location,
    openings: Number(openings),
    status: 'Open',
    description: description || requirement.description,
    createdBy: req.user._id,
    candidates: []
  });
  
  requirement.linkedJob = job._id;
  requirement.status = 'Approved';
  requirement.reviewedBy = req.user._id;
  requirement.reviewedAt = new Date();
  requirement.reviewNote = req.body.reviewNote || 'Hiring job created';
  await requirement.save();
  
  // Notify requester
  await notifyRequester(requirement, 'Approved - Job Created');
  
  logAudit(req, {
    action: 'requirement.create_job',
    targetType: 'Requirement',
    targetId: requirement._id,
    description: `Created hiring job ${jobId} from requirement ${requirement.title}`
  });
  
  res.status(201).json({ job, requirement });
});

/* DELETE /api/requirements/:id — HR/Admin only */
exports.remove = catchAsync(async (req, res) => {
  if (!userHasPermission(req.user, 'requirements:delete')) {
    throw ApiError.forbidden('You do not have permission to delete requirement requests.');
  }
  
  const requirement = await Requirement.findByIdAndDelete(req.params.id);
  if (!requirement) throw ApiError.notFound('Requirement request not found.');
  
  res.json({ ok: true });
});

// Helper: Notify HR users of new requirement request
async function notifyHR(requirement) {
  try {
    const hrUsers = await User.find({ role: { $in: ['HR', 'ADMIN', 'SUPER_ADMIN'] }, status: 'active' }).select('_id').lean();
    
    const notifications = hrUsers.map(hrUser => ({
      user: hrUser._id,
      type: 'Requirement Request',
      title: `New Requirement Request — ${requirement.title}`,
      message: `Manager has requested ${requirement.requiredCount} position(s) for ${requirement.team} (${requirement.department}). Priority: ${requirement.priority}.`,
      relatedEntity: { type: 'Requirement', id: requirement._id },
      channels: { inApp: true, email: false },
      priority: requirement.priority === 'Urgent' || requirement.priority === 'High' ? 'High' : 'Normal',
      metadata: { requirementId: requirement._id }
    }));
    
    if (notifications.length > 0) {
      await Notification.insertMany(notifications);
    }
  } catch (err) {
    console.error('[Requirement] Failed to notify HR:', err.message);
  }
}

// Helper: Notify requester of status change
async function notifyRequester(requirement, action) {
  try {
    await Notification.create({
      user: requirement.requestedBy,
      type: 'Requirement Update',
      title: `Requirement Request ${action} — ${requirement.title}`,
      message: `Your requirement request for ${requirement.team} has been ${action.toLowerCase()}.`,
      relatedEntity: { type: 'Requirement', id: requirement._id },
      channels: { inApp: true, email: false },
      priority: 'Normal',
      metadata: { requirementId: requirement._id, action }
    });
  } catch (err) {
    console.error('[Requirement] Failed to notify requester:', err.message);
  }
}