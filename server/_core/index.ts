import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { attachClipMedia, getClipById } from "../db";
import { toFootageClip } from "../footage";
import { storagePut } from "../storage";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => server.close(() => resolve(true)));
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) if (await isPortAvailable(port)) return port;
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  registerStorageProxy(app);
  registerOAuthRoutes(app);

  app.post("/api/footage/upload/:clipId", express.raw({ type: () => true, limit: "50mb" }), async (req, res) => {
    try {
      const ctx = await createContext({ req, res, info: {} } as unknown as Parameters<typeof createContext>[0]);
      if (!ctx.user) return res.status(401).json({ error: "Sign in before uploading footage." });
      const clipId = Number(req.params.clipId);
      const clip = await getClipById(clipId);
      if (!Number.isInteger(clipId) || !clip || clip.userId !== ctx.user.id) return res.status(404).json({ error: "Footage record not found." });
      if (!Buffer.isBuffer(req.body) || !req.body.length) return res.status(400).json({ error: "The uploaded video is empty." });
      const fileName = decodeURIComponent(String(req.header("x-file-name") ?? clip.fileName)).replace(/[^a-zA-Z0-9._-]/g, "_");
      const contentType = String(req.header("content-type") ?? clip.mimeType).split(";")[0];
      const media = await storagePut(`framefind/${ctx.user.id}/videos/${fileName}`, req.body, contentType);
      const updated = await attachClipMedia({ clipId, userId: ctx.user.id, storageKey: media.key, mediaUrl: media.url });
      if (!updated) return res.status(500).json({ error: "Video stored but footage record could not be updated." });
      return res.status(201).json({ clip: toFootageClip(updated) });
    } catch (error) {
      console.error("[Footage upload]", error);
      return res.status(500).json({ error: "The video could not be uploaded. Please try a smaller file." });
    }
  });

  app.use("/api/trpc", createExpressMiddleware({ router: appRouter, createContext }));
  if (process.env.NODE_ENV === "development") await setupVite(app, server);
  else serveStatic(app);
  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);
  if (port !== preferredPort) console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  server.listen(port, () => console.log(`Server running on http://localhost:${port}/`));
}

startServer().catch(console.error);
