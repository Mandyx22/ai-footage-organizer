import type { JsonSchema } from "./llm";
import { qwenFrameAnalysisProvider } from "./qwenProvider";

export type FrameAnalysisInput = {
  fileName: string;
  previewDataUrls: string[];
  systemPrompt: string;
  responseSchema: JsonSchema;
};

export type FrameAnalysisProvider = {
  analyzeFrames(input: FrameAnalysisInput): Promise<string>;
};

export function getFrameAnalysisProvider(): FrameAnalysisProvider {
  return qwenFrameAnalysisProvider;
}
