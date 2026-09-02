import { ENV } from "./env";
import type { FrameAnalysisInput, FrameAnalysisProvider } from "./frameAnalysisProvider";
import {
  buildFrameAnalysisUserContent,
  chatCompletionContentToText,
} from "./frameAnalysisMessages";

const DEFAULT_QWEN_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1";
const CHAT_COMPLETIONS_PATH = "/chat/completions";

type QwenChoice = {
  message?: {
    content?: Parameters<typeof chatCompletionContentToText>[0];
  };
};

type QwenCompletion = {
  choices?: QwenChoice[];
};

function resolveQwenBaseUrl() {
  const configured = ENV.qwenBaseUrl.trim().replace(/\/+$/, "");
  if (configured) return configured;
  if (ENV.isProduction) {
    throw new Error("QWEN_BASE_URL is required in production");
  }
  return DEFAULT_QWEN_BASE_URL;
}

function resolveQwenModel() {
  return ENV.qwenModel.trim() || "qwen3.7-plus";
}

function assertQwenApiKey() {
  if (!ENV.qwenApiKey) {
    throw new Error("DASHSCOPE_API_KEY is not configured");
  }
}

export const qwenFrameAnalysisProvider: FrameAnalysisProvider = {
  async analyzeFrames(input: FrameAnalysisInput) {
    assertQwenApiKey();
    const model = resolveQwenModel();
    const response = await fetch(`${resolveQwenBaseUrl()}${CHAT_COMPLETIONS_PATH}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ENV.qwenApiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: input.systemPrompt },
          {
            role: "user",
            content: buildFrameAnalysisUserContent(
              input.fileName,
              input.previewDataUrls
            ),
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: input.responseSchema,
        },
        enable_thinking: false,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Qwen frame analysis failed: ${response.status} ${response.statusText} - ${errorText}`
      );
    }

    const result = (await response.json()) as QwenCompletion;
    const content = chatCompletionContentToText(
      result.choices?.[0]?.message?.content
    );
    if (!content) {
      throw new Error("Qwen frame analysis returned no metadata");
    }
    return content;
  },
};
