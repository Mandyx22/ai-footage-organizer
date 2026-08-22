// S3-compatible storage helpers.
// Downloads return /manus-storage/{key} paths served via 307 redirect.

import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { ENV } from "./_core/env";

const SIGNED_URL_EXPIRES_SECONDS = 60 * 60;

function parseForcePathStyle(value: string): boolean {
  return /^(1|true|yes)$/i.test(value.trim());
}

function getS3Config() {
  const missing = [
    ["S3_ENDPOINT", ENV.s3Endpoint],
    ["S3_REGION", ENV.s3Region],
    ["S3_BUCKET", ENV.s3Bucket],
    ["S3_ACCESS_KEY_ID", ENV.s3AccessKeyId],
    ["S3_SECRET_ACCESS_KEY", ENV.s3SecretAccessKey],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);

  if (missing.length > 0) {
    throw new Error(`Storage config missing: set ${missing.join(", ")}`);
  }

  return {
    endpoint: ENV.s3Endpoint.replace(/\/+$/, ""),
    region: ENV.s3Region,
    bucket: ENV.s3Bucket,
    accessKeyId: ENV.s3AccessKeyId,
    secretAccessKey: ENV.s3SecretAccessKey,
    forcePathStyle: parseForcePathStyle(ENV.s3ForcePathStyle),
  };
}

function createS3Client() {
  const config = getS3Config();
  return {
    client: new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      forcePathStyle: config.forcePathStyle,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    }),
    bucket: config.bucket,
  };
}

function normalizeKey(relKey: string): string {
  return relKey.replace(/^\/+/, "");
}

function appendHashSuffix(relKey: string): string {
  const hash = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  const lastDot = relKey.lastIndexOf(".");
  if (lastDot === -1) return `${relKey}_${hash}`;
  return `${relKey.slice(0, lastDot)}_${hash}${relKey.slice(lastDot)}`;
}

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream",
): Promise<{ key: string; url: string }> {
  const { client, bucket } = createS3Client();
  const key = appendHashSuffix(normalizeKey(relKey));

  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: data,
    ContentType: contentType,
  }));

  return { key, url: `/manus-storage/${key}` };
}

export async function storageGet(relKey: string): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  return { key, url: `/manus-storage/${key}` };
}

export async function storageGetSignedUrl(relKey: string): Promise<string> {
  const { client, bucket } = createS3Client();
  const key = normalizeKey(relKey);

  return getSignedUrl(client, new GetObjectCommand({
    Bucket: bucket,
    Key: key,
  }), { expiresIn: SIGNED_URL_EXPIRES_SECONDS });
}
