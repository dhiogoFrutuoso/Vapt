import { Schema, model, type InferSchemaType } from 'mongoose';

const appVersionSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, default: 'native-app' },
    latestVersion: { type: String, required: true, trim: true },
    minVersion: { type: String, required: true, trim: true },
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
