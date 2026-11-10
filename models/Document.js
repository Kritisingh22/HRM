/* Document — metadata for an uploaded file. The bytes live in the configured
 * storage provider (Google Drive or local disk); only metadata + a storage key
 * are kept here. Access is controlled by `visibility` + the owning employee
 * (enforced in the controller). Storage internals (storageKey, driveFileId,
 * checksum) are stripped from every JSON response by the toJSON transform.
 */
const mongoose = require('mongoose');

const documentSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    category: { type: String, enum: ['Policy', 'Contract', 'Payslip', 'ID Proof', 'Certificate', 'Personal Document', 'Company Document', 'HR Manual', 'Circular Document', 'Other'], default: 'Other', index: true },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', index: true }, // whose document it is (optional)
    visibility: { type: String, enum: ['private', 'hr', 'all'], default: 'private', index: true },
    // stored-file details (never the raw path exposed to clients)
    storageKey: { type: String, required: true },   // provider key (disk filename or Drive file ID)
    originalName: { type: String, required: true, maxlength: 255 },
    mimeType: { type: String, maxlength: 100 },
    size: { type: Number, min: 0 },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

    // ---- object storage bookkeeping (bytes live in the provider, never here) ----
    storageProvider: { type: String, enum: ['local', 'google-drive'], default: 'local' },
    driveFileId: { type: String },                  // Google Drive file ID (internal only)
    driveFolderId: { type: String },
    checksum: { type: String },                     // sha256 of the bytes
    uploadStatus: { type: String, enum: ['active', 'missing', 'deleted'], default: 'active', index: true },
    deletedAt: { type: Date },
    retention: { type: String, enum: ['standard', 'retain'], default: 'standard' },
    uploaderRole: { type: String },                 // role snapshot at upload time

    // ---- verification workflow (HR) ----
    verified: { type: Boolean, default: false },
    verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    verifiedAt: { type: Date },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_doc, ret) => {
        delete ret.storageKey;
        delete ret.driveFileId;
        delete ret.driveFolderId;
        delete ret.checksum;
        return ret;
      },
    },
  }
);

documentSchema.index({ uploadStatus: 1, createdAt: -1 });
documentSchema.index({ driveFileId: 1 }, { sparse: true });

module.exports = mongoose.model('Document', documentSchema);
