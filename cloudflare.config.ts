import { bindings, defineConfig } from "cf/config";

export default defineConfig(({ isPreview, mode }) => ({
  worker: {
    name: "media-parser-tool",
    entrypoint: "./src/index.ts",
    compatibilityDate: "2026-10-30",
    assets: { runWorkerFirst: ["/api/*", "/config.json"] },
    workersDev: false,
    previewUrls: true,
    env: {
      ENVIRONMENT: bindings.text(isPreview ? "preview" : mode === "development" ? "development" : "production"),
      PARSE_LIMIT: bindings.rateLimit({ namespace: "2101", simple: { limit: 20, period: 60 } }),
      MEDIA_LIMIT: bindings.rateLimit({ namespace: "2102", simple: { limit: 60, period: 60 } }),
      TURNSTILE_SITE_KEY: bindings.text(isPreview || mode === "development" ? "1x00000000000000000000AA" : ""),
      TURNSTILE_SECRET: isPreview ? bindings.text(process.env.TURNSTILE_SECRET || "") : bindings.secret(),
      RESOURCE_SIGNING_KEY: isPreview ? bindings.text(process.env.RESOURCE_SIGNING_KEY || "") : bindings.secret(),
      API_KEY: isPreview ? bindings.text(process.env.API_KEY || "") : bindings.secret(),
    },
  },
}));
