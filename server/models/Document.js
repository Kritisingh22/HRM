/* Document — metadata for an uploaded file. The bytes live on disk (uploads/)
 * or a configured store; only metadata + a storage key are kept here. Access is
 * controlled by `visibility` + the owning employee (enforced in the controller).
 */
const mongoose = require('mongoose');

const documentSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
<<<<<<< HEAD
    category: { type: String, enum: ['Policy', 'Contract', 'Payslip', 'ID Proof', 'Certificate', 'Other'], default: 'Other', index: true },
=======
    category: { type: String, enum: ['Policy', 'Contract', 'Payslip', 'ID Proof', 'Certificate', 'Personal Document', 'Company Document', 'HR Manual', 'Circular Document', 'Other'], default: 'Other', index: true },
>>>>>>> 0f31467 (intial Update HRM 1.1)
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', index: true }, // whose document it is (optional)
    visibility: { type: String, enum: ['private', 'hr', 'all'], default: 'private', index: true },
    // stored-file details (never the raw path exposed to clients)
    storageKey: { type: String, required: true },   // filename on disk
    originalName: { type: String, required: true },
    mimeType: { type: String },
    size: { type: Number },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Document', documentSchema);
