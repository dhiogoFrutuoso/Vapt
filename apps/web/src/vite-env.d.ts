/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_APP_VERSION?: string;
  readonly VITE_DOWNLOAD_BASE_URL?: string;
  readonly VITE_WHATSAPP?: string;
  readonly VITE_SUPPORT_EMAIL?: string;
  readonly VITE_ANDROID_APP_URL?: string;
  readonly VITE_IOS_APP_URL?: string;
  readonly VITE_GA_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
