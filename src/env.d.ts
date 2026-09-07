/** Minimal server-side process typing for Vercel Functions. */
declare const process: { env: Record<string, string | undefined> };
interface ImportMetaEnv { readonly DEV: boolean }
interface ImportMeta { readonly env: ImportMetaEnv }
