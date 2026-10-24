import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));

/** the changes of web2 for its changelog page: date and summary of each commit */
const changes = (() => {
    try {
        return execSync("git log -n 400 --date=short --format=%ad%x09%s", { encoding: "utf8" })
            .trim()
            .split("\n")
            .map((l) => l.split("\t"));
    } catch {
        return [];
    }
})();

// The app is served by teddyCloud below /web/v2/ (see README). All asset paths are relative
// ("./"), so it also works behind a reverse proxy that adds a path prefix.
export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), "");
    // dev server: forward the API to a running teddyCloud, e.g. TEDDYCLOUD=http://teddycloud.local
    const target = env.TEDDYCLOUD || "http://localhost";
    const proxy = Object.fromEntries(
        ["/api", "/content", "/cache", "/custom_img", "/library", "/img_", "/v1", "/reverse"].map((p) => [
            p,
            { target, changeOrigin: true },
        ]),
    );
    return {
        base: "./",
        plugins: [react()],
        define: { __APP_VERSION__: JSON.stringify(pkg.version), __CHANGES__: JSON.stringify(changes) },
        build: {
            outDir: "dist",
            assetsDir: "assets",
            chunkSizeWarningLimit: 800,
        },
        server: { host: true, port: 5173, proxy },
    };
});
