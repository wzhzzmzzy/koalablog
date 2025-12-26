/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

import type { SQLiteBlobStorage } from "./lib/blob-storage";
import type { CatppuccinTheme } from "./lib/const/config";

// use a default runtime configuration (advanced mode).
type Runtime = import("@astrojs/cloudflare").Runtime<Env>;

interface ImportMetaEnv {
  readonly DATA_SOURCE?: "d1" | "sqlite";
  readonly SQLITE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare global {
  interface HTMLElementEventMap {
    "update-theme": CustomEvent<{
      light: CatppuccinTheme;
      dark: CatppuccinTheme;
    }>;
  }

  namespace App {
    interface Locals extends Runtime {
      config: import("@/lib/kv").GlobalConfig;
      session: {
        authed: boolean;
        asRole: "admin" | "guest";
      };
      OSS?: SQLiteBlobStorage;
    }
    type Env = Env;
  }

  interface Window {
    refreshCopyListener: () => void;
    copyCode: (el: HTMLSpanElement) => void;
    refreshTagListener: () => void;
    handleTagClick: (el: HTMLSpanElement) => void;
    handleTagKeydown: (el: HTMLSpanElement, event: KeyboardEvent) => void;
  }
}

declare namespace astroHTML.JSX {
  interface ButtonHTMLAttributes {
    ghost?: boolean;
  }
}
