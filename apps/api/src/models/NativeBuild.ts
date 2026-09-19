import { Schema, model } from 'mongoose';

// One immutable branding snapshot per base release. No employee or login data.
const schema = new Schema({
  _id: { type: String, required: true },
  appId: { type: String, required: true, index: true },
  name: { type: String, required: true },
  logoId: { type: String, required: true },
  version: { type: String, required: true },
  state: { type: String, enum: ['queued', 'building', 'ready', 'failed'], default: 'queued' },
  lease: String,
  leaseUntil: Date,
  attempts: { type: Number, default: 0 },
  artifacts: {
    apk: { url: String, sha256: String },
    exe: { url: String, sha256: String },
  },
}, { timestamps: true });
schema.index({ state: 1, createdAt: 1 });
export const NativeBuild = model('NativeBuild', schema);
