export const ENV = {
  databaseUrl: process.env.DATABASE_URL ?? "",
  isProduction: process.env.NODE_ENV === "production",
  openAiApiKey: process.env.OPENAI_API_KEY ?? "",
  /** Frame analysis provider: openai | qwen (default qwen). */
  frameAnalysisProvider: process.env.FRAME_ANALYSIS_PROVIDER ?? "qwen",
  /** OpenAI vision model for frame analysis when FRAME_ANALYSIS_PROVIDER=openai. */
  openAiFrameAnalysisModel: process.env.OPENAI_FRAME_ANALYSIS_MODEL ?? "",
  qwenApiKey: process.env.DASHSCOPE_API_KEY ?? "",
  qwenBaseUrl: process.env.QWEN_BASE_URL ?? "",
  qwenModel: process.env.QWEN_MODEL ?? "qwen3.7-plus",
  s3Endpoint: process.env.S3_ENDPOINT ?? "",
  s3Region: process.env.S3_REGION ?? "",
  s3Bucket: process.env.S3_BUCKET ?? "",
  s3AccessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
  s3SecretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
  s3ForcePathStyle: process.env.S3_FORCE_PATH_STYLE ?? "",
};
