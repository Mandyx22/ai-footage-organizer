import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSignedUrl: vi.fn(),
  send: vi.fn(),
  s3Client: vi.fn(function S3Client(config: unknown) {
    return { config, send: mocks.send };
  }),
  putObjectCommand: vi.fn(function PutObjectCommand(input: unknown) {
    return { type: "PutObjectCommand", input };
  }),
  getObjectCommand: vi.fn(function GetObjectCommand(input: unknown) {
    return { type: "GetObjectCommand", input };
  }),
}));

vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: mocks.s3Client,
  PutObjectCommand: mocks.putObjectCommand,
  GetObjectCommand: mocks.getObjectCommand,
}));

vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: mocks.getSignedUrl,
}));

const originalEnv = {
  S3_ENDPOINT: process.env.S3_ENDPOINT,
  S3_REGION: process.env.S3_REGION,
  S3_BUCKET: process.env.S3_BUCKET,
  S3_ACCESS_KEY_ID: process.env.S3_ACCESS_KEY_ID,
  S3_SECRET_ACCESS_KEY: process.env.S3_SECRET_ACCESS_KEY,
  S3_FORCE_PATH_STYLE: process.env.S3_FORCE_PATH_STYLE,
};

async function loadStorage() {
  vi.resetModules();
  return import("./storage");
}

function clearS3Env() {
  delete process.env.S3_ENDPOINT;
  delete process.env.S3_REGION;
  delete process.env.S3_BUCKET;
  delete process.env.S3_ACCESS_KEY_ID;
  delete process.env.S3_SECRET_ACCESS_KEY;
  delete process.env.S3_FORCE_PATH_STYLE;
}

function setS3Env() {
  process.env.S3_ENDPOINT = "https://storage.railway.app/";
  process.env.S3_REGION = "auto";
  process.env.S3_BUCKET = "footage";
  process.env.S3_ACCESS_KEY_ID = "test-access-key";
  process.env.S3_SECRET_ACCESS_KEY = "test-secret-key";
}

describe("S3-compatible storage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearS3Env();
  });

  afterEach(() => {
    clearS3Env();
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value !== undefined) process.env[key] = value;
    }
  });

  it("fails clearly when S3 storage config is missing", async () => {
    const { storagePut } = await loadStorage();

    await expect(storagePut("framefind/42/thumbnails/lake.jpg", Buffer.from("image"), "image/jpeg")).rejects.toThrow(
      "Storage config missing: set S3_ENDPOINT, S3_REGION, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY",
    );
    expect(mocks.s3Client).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("uses PutObjectCommand for uploads and preserves app-relative media URLs", async () => {
    setS3Env();
    mocks.send.mockResolvedValue({});
    const { storagePut } = await loadStorage();

    const result = await storagePut("/framefind/42/thumbnails/lake.jpg", Buffer.from("image"), "image/jpeg");

    expect(result.key).toMatch(/^framefind\/42\/thumbnails\/lake_[a-f0-9]{8}\.jpg$/);
    expect(result.url).toBe(`/manus-storage/${result.key}`);
    expect(mocks.s3Client).toHaveBeenCalledWith({
      endpoint: "https://storage.railway.app",
      region: "auto",
      forcePathStyle: false,
      credentials: {
        accessKeyId: "test-access-key",
        secretAccessKey: "test-secret-key",
      },
    });
    expect(mocks.putObjectCommand).toHaveBeenCalledWith({
      Bucket: "footage",
      Key: result.key,
      Body: expect.any(Buffer),
      ContentType: "image/jpeg",
    });
    expect(mocks.send).toHaveBeenCalledWith({ type: "PutObjectCommand", input: expect.any(Object) });
  });

  it("uses GetObjectCommand and the S3 presigner for reads", async () => {
    setS3Env();
    process.env.S3_FORCE_PATH_STYLE = "true";
    mocks.getSignedUrl.mockResolvedValue("https://signed.example.test/video.mp4");
    const { storageGetSignedUrl } = await loadStorage();

    const signedUrl = await storageGetSignedUrl("/framefind/42/videos/video.mp4");

    expect(signedUrl).toBe("https://signed.example.test/video.mp4");
    expect(mocks.s3Client).toHaveBeenCalledWith(expect.objectContaining({ forcePathStyle: true }));
    expect(mocks.getObjectCommand).toHaveBeenCalledWith({
      Bucket: "footage",
      Key: "framefind/42/videos/video.mp4",
    });
    expect(mocks.getSignedUrl).toHaveBeenCalledWith(
      expect.objectContaining({ send: mocks.send }),
      { type: "GetObjectCommand", input: expect.any(Object) },
      { expiresIn: 3600 },
    );
  });

  it("returns app-relative URLs without touching S3 for storageGet", async () => {
    const { storageGet } = await loadStorage();

    await expect(storageGet("/framefind/42/videos/video.mp4")).resolves.toEqual({
      key: "framefind/42/videos/video.mp4",
      url: "/manus-storage/framefind/42/videos/video.mp4",
    });
    expect(mocks.s3Client).not.toHaveBeenCalled();
  });
});
