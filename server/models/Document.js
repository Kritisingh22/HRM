/* Document — the single document register for the portal.
 *
 * Replaces the old Document + EmployeeDocument split: every upload (company
 * resource, employee personal document, payslip archive) is one document row
 * with a `scope` ('personal' | 'company' | 'hr_only') and an optional `employee`
 * subject. Access is controlled by `visibility` + the owning employee + scope
 * (enforced in the controller). The bytes live in the configured object-storage
 * provider (local disk / Google Drive / Cloudflare R2); only metadata + the
 * storage key are kept here. Storage internals (storageKey, r2Key,
 * driveFileId, checksum) are stripped from every JSON response by the toJSON
 * transform.
 *
 * referenceId is the public handle (DOC-YYYY-000001, minted from the Counter
 * model on upload) — clients download by reference instead of by Mongo id:
 *   GET /api/documents/reference/:referenceId/download
 */
const mongoose = require('mongoose');
const Counter = require('./Counter');

const documentSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    /** Public reference (DOC-YYYY-NNNNNN), unique across all documents. */
    referenceId: { type: String, unique: true, sparse: true },
    category: {
      type: String,
      trim: true,
      enum: [
        'Policy',
        'Contract',
        'Payslip',
        'payslip',
        'ID Proof',
        'Certificate',
        'Personal Document',
        'personal',
        'Company Document',
        'HR Manual',
        'hr_manual',
        'Circular Document',
        'onsite_manual',
        'Other',
        'id_proof',
        'contract',
        'certificate',
        'other',
      ],
      default: 'Other',
      index: true,
    },
    /** Whose document this is (null ⇒ company-wide). */
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', index: true },
    /** The employee this document is about (personal documents / payslips). */
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', index: true },
    type: { type: String, trim: true, maxlength: 100 }, // e.g. 'Aadhaar', 'Offer Letter'
    visibility: { type: String, enum: ['private', 'hr', 'all'], default: 'private', index: true },
    /** Scope: personal (subject's own), company (company-wide), hr_only (HR only). */
    scope: { type: String, enum: ['personal', 'company', 'hr_only'], index: true },
    // stored-file details (never the raw path exposed to clients)
    storageKey: { type: String, required: true }, // provider key (object-storage key)
    originalName: { type: String, required: true, maxlength: 255 },
    mimeType: { type: String, maxlength: 100 },
    size: { type: Number, min: 0 },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    uploaderRole: { type: String }, // role snapshot at upload time

    // ---- object storage bookkeeping (bytes live in the provider, never here) ----
    storageProvider: {
      type: String,
      enum: ['local', 'google-drive', 'cloudflare-r2'],
      default: 'cloudflare-r2',
    },
    r2Key: { type: String }, // R2 object key (redundant with storageKey for clarity)
    driveFileId: { type: String }, // Google Drive file ID (legacy, internal only)
    driveFolderId: { type: String },
    checksum: { type: String }, // sha256 of the bytes
    uploadStatus: { type: String, enum: ['active', 'missing', 'deleted'], default: 'active', index: true },
    deletedAt: { type: Date },
    retention: { type: String, enum: ['standard', 'retain'], default: 'standard' },

    // ---- verification workflow (HR) ----
    verified: { type: Boolean, default: false },
    verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    verifiedAt: { type: Date },

    // ---- payroll / entity linkage (payslip archives, etc.) ----
    relatedModel: { type: String }, // e.g. 'Payroll'
    relatedId: { type: mongoose.Schema.Types.ObjectId },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_doc, ret) => {
        delete ret.storageKey;
        delete ret.r2Key;
        delete ret.driveFileId;
        delete ret.driveFolderId;
        delete ret.checksum;
        return ret;
      },
    },
  }
);

documentSchema.index({ uploadStatus: 1, createdAt: -1 });
documentSchema.index({ r2Key: 1 }, { sparse: true });
documentSchema.index({ driveFileId: 1 }, { sparse: true });
documentSchema.index({ employee: 1, createdAt: -1 });
documentSchema.index({ employee: 1, category: 1 });
documentSchema.index({ relatedModel: 1, relatedId: 1 }, { sparse: true });

/** Mint the public reference (DOC-YYYY-000001) before save when missing. */
documentSchema.pre('save', async function (next) {
  if (!this.isNew || this.referenceId) return next();
  try {
    const year = new Date().getFullYear();
    const counter = await Counter.findOneAndUpdate(
      { _id: `doc-ref:${year}` },
      { $inc: { seq: 1 } },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    );
    const seq = Number(counter && counter.seq) || 1;
    this.referenceId = `DOC-${year}-${String(seq).padStart(6, '0')}`;
  } catch (e) {
    return next(e);
  }
  next();
});

module.exports = mongoose.model('Document', documentSchema);
