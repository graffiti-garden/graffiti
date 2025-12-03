import { defineConfig, type ViteDevServer } from "vite";
import vue from "@vitejs/plugin-vue";
import httpProxy from "http-proxy";

const proxy = httpProxy.createProxyServer();

export default defineConfig({
  root: "web",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true,
  },
  plugins: [
    vue(),
    {
      // During dev, proxy "/api" and all
      // subdomain requests to the worker.
      name: "proxy",
      configureServer(server: ViteDevServer) {
        server.middlewares.use((req, res, next) => {
          const path = req.originalUrl;
          const host = req.headers.host;
          const subdomain = host?.match(/^([^\.]+)\.localhost:(\d+)$/)?.[1];
          if (subdomain) {
            // If there is a subdomain, route to subdomain.localhost:8787
            proxy.web(req, res, {
              target: `http://${subdomain}.localhost:8787`,
              changeOrigin: true,
            });
          } else if (path?.startsWith("/api/")) {
            // If it is an API request, send it to localhost:8787
            proxy.web(req, res, {
              target: "http://localhost:8787",
              changeOrigin: true,
            });
          } else {
            next();
          }
        });
      },
    },
  ],
});
