import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
export default defineConfig({
    plugins: [react()],
    root: __dirname,
    build: {
        outDir: path.resolve(__dirname, "../../dist/web"),
        emptyOutDir: true,
    },
    server: {
        port: 5173,
        proxy: {
            "/api": "http://localhost:3000",
            "/mock": "http://localhost:3000",
        },
    },
});
//# sourceMappingURL=vite.config.js.map