import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));

// The app is served by teddyCloud below /web/v2/ (see README). All asset paths are relative
// ("./"), so it also works behind a reverse proxy that adds a path prefix.
export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), "");
    // dev server: forward the API to a running teddyCloud, e.g. TEDDYCLOUD=http://teddycloud.local
    const target = env.TEDDYCLOUD || "http://localhost";
    const proxy = Object.fromEntries(
        ["/api", "/content", "/cache", "/custom_img", "/library", "/img_"].map((p) => [
            p,
            { target, changeOrigin: true },
        ]),
    );
    return {
        base: "./",
        plugins: [react()],
        define: { __APP_VERSION__: JSON.stringify(pkg.version) },
        build: {
            outDir: "dist",
            assetsDir: "assets",
            chunkSizeWarningLimit: 800,
        },
        server: { host: true, port: 5173, proxy },
    };
});
