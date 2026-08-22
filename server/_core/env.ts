export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  openAiApiKey: process.env.OPENAI_API_KEY ?? "",
  qwenApiKey: process.env.DASHSCOPE_API_KEY ?? "",
  qwenBaseUrl: process.env.QWEN_BASE_URL ?? "",
  qwenModel: process.env.QWEN_MODEL ?? "qwen3.7-plus",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
};
