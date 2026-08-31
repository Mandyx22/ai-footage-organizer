import "dotenv/config";
import express from "express";
import multer from "multer";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
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
  app.use(express.json({ limit: "32mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  registerStorageProxy(app);

  const originalVideoUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024, files: 1 } }).single("video");
  app.post("/api/footage/upload/:clipId", (req, res) => originalVideoUpload(req, res, async error => {
    if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") return res.status(413).json({ error: "This video is larger than the 50 MB prototype limit. Export a shorter or lower-resolution copy and try again." });
    if (error) return res.status(400).json({ error: "The video form could not be read. Please try the upload again." });
    try {
      const ctx = await createContext({ req, res, info: {} } as unknown as Parameters<typeof createContext>[0]);
      const clipId = Number(req.params.clipId);
      const clip = await getClipById(clipId);
      if (!Number.isInteger(clipId) || !clip || clip.userId !== ctx.user.id) return res.status(404).json({ error: "Footage record not found." });
      const file = req.file;
      if (!file?.buffer.length) return res.status(400).json({ error: "The uploaded video is empty." });
      const fileName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
      const media = await storagePut(`framefind/${ctx.user.id}/videos/${fileName}`, file.buffer, file.mimetype || clip.mimeType);
      const updated = await attachClipMedia({ clipId, userId: ctx.user.id, storageKey: media.key, mediaUrl: media.url });
      if (!updated) return res.status(500).json({ error: "Video stored but footage record could not be updated." });
      return res.status(201).json({ clip: toFootageClip(updated) });
    } catch (error) {
      console.error("[Footage upload]", error);
      return res.status(500).json({ error: "The video could not be saved to secure storage. Please try again." });
    }
  }));

  app.use("/api/trpc", createExpressMiddleware({ router: appRouter, createContext }));
  if (process.env.NODE_ENV === "development") await setupVite(app, server);
  else serveStatic(app);
  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);
  if (port !== preferredPort) console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  server.listen(port, () => console.log(`Server running on http://localhost:${port}/`));
}

startServer().catch(console.error);
