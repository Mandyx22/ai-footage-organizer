import type { JsonSchema } from "./llm";
import { ENV } from "./env";
import { openAiFrameAnalysisProvider } from "./openaiFrameAnalysisProvider";
import { qwenFrameAnalysisProvider } from "./qwenProvider";

export type FrameAnalysisProviderName = "openai" | "qwen";

export type FrameAnalysisInput = {
  fileName: string;
  previewDataUrls: string[];
  systemPrompt: string;
  responseSchema: JsonSchema;
};

export type FrameAnalysisProvider = {
  analyzeFrames(input: FrameAnalysisInput): Promise<string>;
};

export function resolveFrameAnalysisProviderName(): FrameAnalysisProviderName {
  const raw = ENV.frameAnalysisProvider.trim().toLowerCase();
  if (!raw || raw === "qwen") return "qwen";
  if (raw === "openai") return "openai";
  throw new Error(
    `FRAME_ANALYSIS_PROVIDER must be "openai" or "qwen" (received "${ENV.frameAnalysisProvider}")`
  );
}

export function getFrameAnalysisProvider(): FrameAnalysisProvider {
  const providerName = resolveFrameAnalysisProviderName();
  if (providerName === "openai") return openAiFrameAnalysisProvider;
  return qwenFrameAnalysisProvider;
}
