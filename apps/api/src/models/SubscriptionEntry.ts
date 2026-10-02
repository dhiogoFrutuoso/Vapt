import { Schema, model } from 'mongoose';

const schema = new Schema({
  // One invoice per user/month, enforced by MongoDB's mandatory _id index.
  _id: { type: String, required: true },
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  month: { type: String, required: true },
  kind: { type: String, enum: ['payment', 'waiver', 'adjustment'], required: true },
  requestId: { type: String, required: true },
  plan: { type: String, required: true },
  paymentDate: { type: String, required: true },
  previousEnd: { type: String, default: null },
  newEnd: { type: String, default: null },
  note: { type: String, maxlength: 1000, default: '' },
  recordedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  receiptName: { type: String, default: null },
  receiptMime: { type: String, default: null },
  receipt: { type: Buffer, select: false },
}, { timestamps: true });
export const SubscriptionEntry = model('SubscriptionEntry', schema);
