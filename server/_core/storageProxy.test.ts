import express from "express";
import { createServer } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  storageGetSignedUrl: vi.fn(),
}));

vi.mock("../storage", () => ({
  storageGetSignedUrl: mocks.storageGetSignedUrl,
}));

import { registerStorageProxy } from "./storageProxy";

async function withServer(test: (baseUrl: string) => Promise<void>) {
  const app = express();
  registerStorageProxy(app);
  const server = createServer(app);

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, resolve);
  });

  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Could not bind test server");

  try {
    await test(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close(error => (error ? reject(error) : resolve()));
    });
  }
}

describe("storage proxy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("redirects /manus-storage requests to signed S3 URLs", async () => {
    mocks.storageGetSignedUrl.mockResolvedValue("https://signed.example.test/framefind/video.mp4");

    await withServer(async baseUrl => {
      const response = await fetch(`${baseUrl}/manus-storage/framefind/42/videos/video.mp4`, {
        redirect: "manual",
      });

      expect(response.status).toBe(307);
      expect(response.headers.get("location")).toBe("https://signed.example.test/framefind/video.mp4");
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(mocks.storageGetSignedUrl).toHaveBeenCalledWith("framefind/42/videos/video.mp4");
    });
  });

  it("returns a backend error when signing fails", async () => {
    mocks.storageGetSignedUrl.mockRejectedValue(new Error("Storage config missing: set S3_ENDPOINT"));

    await withServer(async baseUrl => {
      const response = await fetch(`${baseUrl}/manus-storage/framefind/42/videos/video.mp4`, {
        redirect: "manual",
      });

      expect(response.status).toBe(502);
      await expect(response.text()).resolves.toBe("Storage proxy error");
    });
  });
});
