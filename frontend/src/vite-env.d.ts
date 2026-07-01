/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_COGNITO_USER_POOL_ID: string;
  readonly VITE_COGNITO_CLIENT_ID: string;
  readonly VITE_REDIRECT_SIGN_OUT: string;
  readonly VITE_API_BASE_URL: string;
  readonly VITE_REDIRECT_URI: string;
  readonly VITE_COGNITO_AUTHORITY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}