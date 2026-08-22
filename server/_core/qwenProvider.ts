import { ENV } from "./env";
import type { FrameAnalysisInput, FrameAnalysisProvider } from "./frameAnalysisProvider";

const DEFAULT_QWEN_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1";
const CHAT_COMPLETIONS_PATH = "/chat/completions";

type QwenMessageContent = string | Array<{ type?: string; text?: string }>;

type QwenChoice = {
  message?: {
    content?: QwenMessageContent;
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

function contentToText(content: QwenMessageContent | undefined) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map(part => part.type === "text" && part.text ? part.text : "")
      .join("")
      .trim();
  }
  return "";
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
            content: [
              { type: "text", text: `Analyze these ${input.previewDataUrls.length} sampled frames from ${input.fileName}. They are ordered from earlier to later in the clip.` },
              ...input.previewDataUrls.flatMap((url, index) => [
                { type: "text" as const, text: `Frame ${index + 1} of ${input.previewDataUrls.length}` },
                { type: "image_url" as const, image_url: { url } },
              ]),
            ],
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
    const content = contentToText(result.choices?.[0]?.message?.content);
    if (!content) {
      throw new Error("Qwen frame analysis returned no metadata");
    }
    return content;
  },
};
