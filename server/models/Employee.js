/* Employee — HR record for a person. Linked to a User (the login identity)
 * where one exists. Field shape mirrors the existing portal's employee data. */
<<<<<<< HEAD
const mongoose = require('mongoose');

const employeeSchema = new mongoose.Schema(
  {
    employeeId: { type: String, required: true, unique: true, trim: true, index: true }, // e.g. CHS-0001
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    fullName: { type: String, required: true, trim: true },
    email: { type: String, lowercase: true, trim: true, unique: true, sparse: true }, // unique when present; sparse allows records without email
    phone: { type: String, trim: true },
    gender: { type: String, enum: ['Male', 'Female', 'Other', 'Prefer not to say'] },
    department: { type: String, trim: true },
    designation: { type: String, trim: true },
    manager: { type: String, trim: true }, // employeeId of the manager (mirrors portal data)
    employmentType: { type: String, default: 'Full-time' },
    location: { type: String },
    address: { type: String, trim: true },              // self-service editable
    emergencyContact: { type: String, trim: true },     // self-service editable
    joiningDate: { type: Date },
    salary: { type: Number, default: 0 },
    grade: { type: String },
    status: { type: String, enum: ['Active', 'On Leave', 'Probation', 'Exited'], default: 'Active', index: true }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Employee', employeeSchema);
=======
const mongoose = require("mongoose");

const employeeSchema = new mongoose.Schema(
  {
    employeeId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    }, // e.g. CHS-0001
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
    fullName: { type: String, required: true, trim: true },
    email: {
      type: String,
      lowercase: true,
      trim: true,
      unique: true,
      sparse: true,
    }, // unique when present; sparse allows records without email
    phone: { type: String, trim: true },
    gender: {
      type: String,
      enum: ["Male", "Female", "Other", "Prefer not to say"],
    },
    department: { type: String, trim: true },
    designation: { type: String, trim: true },
    manager: { type: String, trim: true }, // employeeId of the manager (mirrors portal data)
    employmentType: { type: String, default: "Full-time" },
    workMode: {
      type: String,
      enum: ["On-site", "Hybrid", "Remote", "Work from Home"],
      default: "On-site",
    },
    bloodGroup: {
      type: String,
      enum: ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-", "Unknown"],
      default: "Unknown",
    },
    assignedHrId: { type: String, trim: true, index: true, default: null },
    location: { type: String },
    address: { type: String, trim: true }, // self-service editable
    emergencyContact: { type: String, trim: true }, // self-service editable
    joiningDate: { type: Date },
    salary: { type: Number, default: 0 },
    grade: { type: String },
    status: {
      type: String,
      enum: ["Active", "On Leave", "Probation", "Exited"],
      default: "Active",
      index: true,
    },
    // Bank details for payslip generation
    bankName: { type: String, trim: true },
    accountNumber: { type: String, trim: true },
    ifsc: { type: String, trim: true },
    accountHolderName: { type: String, trim: true },
  },
  { timestamps: true },
);

module.exports = mongoose.model("Employee", employeeSchema);
>>>>>>> 0f31467 (intial Update HRM 1.1)
