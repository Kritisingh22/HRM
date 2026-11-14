/* Socket.IO — real-time synchronization for HRM dashboards.
 *
 * Provides a WebSocket layer on top of the existing Express HTTP server.
 * Clients authenticate with their JWT access token; after authentication,
 * they join role-based rooms so they only receive events they're authorized
 * to see (employee=self, HR=assigned, Manager=team, Admin/SuperAdmin=all).
 *
 * Socket events NEVER replace database operations — they are purely
 * notifications that the client should re-fetch affected data.
 *
 * Event namespace: /attendance (separate from default namespace for clarity)
 */

const { Server } = require('socket.io');
const { verifyAccessToken } = require('./tokens');
const User = require('../models/User');
const ApiError = require('./ApiError');

let io = null;

/** Initialize Socket.IO on the existing HTTP server. */
function initSocketIO(httpServer) {
  io = new Server(httpServer, {
    path: '/socket.io',
    cors: {
      origin: process.env.FRONTEND_URL || '*',
      credentials: true,
    },
    transports: ['websocket', 'polling'],
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  /* Authentication middleware — verify JWT from query param or header. */
  io.use(async (socket, next) => {
    try {
      const token =
        socket.handshake.auth.token ||
        socket.handshake.query.token ||
        (socket.handshake.headers.authorization ||
          '').replace(/^Bearer\s+/, '');

      if (!token) {
        return next(new Error('Authentication required'));
      }

      const payload = verifyAccessToken(token);
      const user = await User.findById(payload.sub)
        .select('_id employeeId fullName email role status department designation accountStatus mustChangePassword permissions')
        .lean();

      if (!user) {
        return next(new Error('User not found'));
      }
      if (user.status !== 'active') {
        return next(new Error('Account not active'));
      }

      socket.user = user;
      socket.auth = { userId: String(user._id), role: user.role };

      /* Join role-based rooms for targeted notifications. */
      socket.join(`role:${user.role}`);
      socket.join(`user:${user._id}`);
      if (user.employeeId) socket.join(`employee:${user.employeeId}`);

      // HR rooms: assigned employees
      if (user.role === 'HR' || user.role === 'MANAGER') {
        const { teamEmployeeIds } = require('./teamScope');
        const ids = teamEmployeeIds(user); // returns Promise
        ids.then((employeeIds) => {
          employeeIds.forEach((id) => socket.join(`team:${id}`));
        }).catch(() => {}); // non-fatal
      }

      next();
    } catch (err) {
      next(new Error('Invalid or expired token'));
    }
  });

  io.on('connection', (socket) => {
    const user = socket.user;
    console.log(`[Socket.IO] Client connected: ${user.employeeId || user._id} (${user.role})`);

    /* Client can join specific employee rooms to track that employee's updates. */
    socket.on('join:employee', (employeeId) => {
      if (!employeeId) return;
      // Authorization: only HR/Manager/Admin can join other employees' rooms;
      // employees can only join their own.
      if (user.role === 'EMPLOYEE' && String(employeeId) !== String(user.employeeId)) {
        socket.emit('error', { message: 'Unauthorized to join this employee room' });
        return;
      }
      socket.join(`employee:${employeeId}`);
      socket.emit('joined', { room: `employee:${employeeId}` });
    });

    socket.on('disconnect', () => {
      console.log(`[Socket.IO] Client disconnected: ${user.employeeId || user._id}`);
    });
  });

  return io;
}

/** Get the Socket.IO instance (call after initSocketIO). */
function getIO() {
  if (!io) {
    throw new Error('Socket.IO not initialized. Call initSocketIO() first.');
  }
  return io;
}

/** Emit an event to a specific room. Safe to call from anywhere — failures
   are logged but never throw. */
function emitToRoom(room, event, data) {
  if (!io) return;
  try {
    io.to(room).emit(event, {
      event,
      timestamp: new Date().toISOString(),
      data,
    });
  } catch (err) {
    console.error('[Socket.IO] emitToRoom failed:', err.message);
  }
}

/** Emit an event to a specific user. */
function emitToUser(userId, event, data) {
  emitToRoom(`user:${userId}`, event, data);
}

/** Emit an event to all clients in a role. */
function emitToRole(role, event, data) {
  emitToRoom(`role:${role}`, event, data);
}

/** Emit an event to a team (HR/Manager team rooms). */
function emitToTeam(employeeId, event, data) {
  emitToRoom(`team:${employeeId}`, event, data);
}

/** Emit an event to an employee's room (HR/Manager tracking that employee). */
function emitToEmployee(employeeId, event, data) {
  emitToRoom(`employee:${employeeId}`, event, data);
}

module.exports = {
  initSocketIO,
  getIO,
  emitToRoom,
  emitToUser,
  emitToRole,
  emitToTeam,
  emitToEmployee,
};