/** Minimal server-side process typing for Vercel Functions. */
declare const process: { env: Record<string, string | undefined> };
interface ImportMetaEnv { readonly DEV: boolean; readonly VITE_TEST_AUTH?: string }
interface ImportMeta { readonly env: ImportMetaEnv }
