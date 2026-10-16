import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Plugin } from "vite";

type Asset = { file: string; imports?: string[]; css?: string[] };

// Derive the offline shell from the actual production graph. Dynamic features
// are deliberately excluded; their hashed chunks are cached when first used.
export function fuelPwa(): Plugin {
  let root = process.cwd();
  return {
    name: "fuel-log-pwa",
    apply: "build",
    applyToEnvironment: (environment) => environment.name === "client",
    configResolved: (config) => { root = config.root; },
    async closeBundle() {
      const directory = resolve(root, "dist/client");
      const manifest: Record<string, Asset> = JSON.parse(await readFile(resolve(directory, ".vite/manifest.json"), "utf8"));
      const files = new Set<string>(["/site.webmanifest", "/fuel-icon.svg"]);
      const visited = new Set<string>();
      const visit = (key: string) => {
        if (visited.has(key)) return;
        visited.add(key);
        const item = manifest[key];
        if (!item) throw new Error(`Missing PWA launch asset: ${key}`);
        files.add("/" + item.file);
        item.css?.forEach((file) => files.add("/" + file));
        item.imports?.forEach(visit);
      };
      ["virtual:vinext-app-browser-entry", "app/page.tsx", "node_modules/vinext/dist/shims/layout-segment-context.js"].forEach(visit);
      // Vinext emits the root stylesheet separately from the JS manifest.
      const { readdir } = await import("node:fs/promises");
      for (const file of await readdir(resolve(directory, "_next/static/css"))) {
        if (file.endsWith(".css")) files.add("/_next/static/css/" + file);
      }
      const core = [...files].sort();
      const template = await readFile(resolve(root, "build/fuel-service-worker.js"), "utf8");
      const hash = createHash("sha256").update(template);
      for (const file of core) hash.update(file).update(await readFile(resolve(directory, "." + file)));
      // Server-only metadata/inline bootstrap changes must also refresh the
      // cached HTML, even when the client graph itself is unchanged.
      for (const file of ["app/layout.tsx", "lib/journal-bootstrap.ts"]) hash.update(await readFile(resolve(root, file)));
      const version = hash.digest("hex").slice(0, 16);
      await writeFile(resolve(directory, "sw.js"), template
        .replace("__FUEL_VERSION__", JSON.stringify(version))
        .replace("__FUEL_CORE_ASSETS__", JSON.stringify(core)));
      const headersPath = resolve(directory, "_headers");
      let headers = await readFile(headersPath, "utf8").catch(() => "");
      if (!headers.includes("/_next/static/*")) headers += "\n/_next/static/*\n  Cache-Control: public, max-age=31536000, immutable\n";
      await writeFile(headersPath, headers + "\n/sw.js\n  Cache-Control: no-cache, no-store, must-revalidate\n  Service-Worker-Allowed: /\n/site.webmanifest\n  Cache-Control: no-cache\n");
    },
  };
}
