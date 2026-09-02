import { ENV } from "./env";
import type { FrameAnalysisInput, FrameAnalysisProvider } from "./frameAnalysisProvider";
import {
  buildFrameAnalysisUserContent,
  chatCompletionContentToText,
} from "./frameAnalysisMessages";

const OPENAI_CHAT_COMPLETIONS_URL = "https://api.openai.com/v1/chat/completions";
const DEFAULT_OPENAI_FRAME_ANALYSIS_MODEL = "gpt-4o-mini";

type OpenAiChoice = {
  message?: {
    content?: string | Array<{ type?: string; text?: string }>;
  };
};

type OpenAiCompletion = {
  choices?: OpenAiChoice[];
};

function assertOpenAiApiKey() {
  if (!ENV.openAiApiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }
}

function resolveOpenAiModel() {
  return ENV.openAiFrameAnalysisModel.trim() || DEFAULT_OPENAI_FRAME_ANALYSIS_MODEL;
}

export const openAiFrameAnalysisProvider: FrameAnalysisProvider = {
  async analyzeFrames(input: FrameAnalysisInput) {
    assertOpenAiApiKey();
    const model = resolveOpenAiModel();
    const response = await fetch(OPENAI_CHAT_COMPLETIONS_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ENV.openAiApiKey}`,
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
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `OpenAI frame analysis failed: ${response.status} ${response.statusText} - ${errorText}`
      );
    }

    const result = (await response.json()) as OpenAiCompletion;
    const content = chatCompletionContentToText(
      result.choices?.[0]?.message?.content
    );
    if (!content) {
      throw new Error("OpenAI frame analysis returned no metadata");
    }
    return content;
  },
};
