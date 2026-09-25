/* Secure file-upload handling (multer). Files are stored on disk under uploads/
 * with a random, non-guessable name; only whitelisted types and a size cap are
 * accepted. The raw path is never exposed — downloads go through the controller,
 * which authorises the request first. */
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const ApiError = require('../utils/ApiError');

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED = new Set([
  'application/pdf', 'image/png', 'image/jpeg', 'image/jpg', 'text/plain',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
]);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = (path.extname(file.originalname) || '').slice(0, 10).replace(/[^.\w]/g, '');
    cb(null, crypto.randomBytes(16).toString('hex') + ext);
  }
});

function fileFilter(req, file, cb) {
  if (ALLOWED.has(file.mimetype)) return cb(null, true);
  cb(new ApiError(400, 'Unsupported file type: ' + file.mimetype));
}

const upload = multer({ storage, fileFilter, limits: { fileSize: 10 * 1024 * 1024 } }); // 10 MB

module.exports = { upload, UPLOAD_DIR };
