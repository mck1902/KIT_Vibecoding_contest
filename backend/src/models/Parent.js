const mongoose = require('mongoose');

const parentSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, default: 'parent', immutable: true },
    name: { type: String, required: true, trim: true },
    children: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Student' }],
    inviteCode: { type: String, unique: true, sparse: true, default: null },
  },
  { timestamps: true, versionKey: false }
);

module.exports = mongoose.model('Parent', parentSchema);
