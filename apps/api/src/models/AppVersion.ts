import { Schema, model, type InferSchemaType } from 'mongoose';

const appVersionSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, default: 'native-app' },
    latestVersion: { type: String, required: true, trim: true },
    minVersion: { type: String, required: true, trim: true },
    buildId: { type: String, required: true, trim: true, default: '1.0.0' },
    tenantBuilds: { type: Map, of: String, default: {} },
    reason: { type: String, trim: true, default: '' },
    forceUpdate: { type: Boolean, required: true, default: true },
    downloadUrls: {
      apk: { type: String, required: true, trim: true, default: '/downloads/vapt.apk' },
      exe: { type: String, required: true, trim: true, default: '/downloads/vapt.exe' },
    },
    changelog: { type: [String], default: [] },
    publishedAt: { type: Date, required: true, default: Date.now },
  },
  { timestamps: true }
);

export type AppVersionDoc = InferSchemaType<typeof appVersionSchema>;
export const AppVersion = model('AppVersion', appVersionSchema);
