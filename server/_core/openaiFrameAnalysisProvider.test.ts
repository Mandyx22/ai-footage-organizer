import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const originalOpenAiApiKey = process.env.OPENAI_API_KEY;
const originalOpenAiFrameAnalysisModel = process.env.OPENAI_FRAME_ANALYSIS_MODEL;

async function loadProvider() {
  vi.resetModules();
  return import("./openaiFrameAnalysisProvider");
}

function okJson(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

const frameInput = {
  fileName: "lake.mov",
  previewDataUrls: [
    "data:image/jpeg;base64,first",
    "data:image/jpeg;base64,second",
  ],
  systemPrompt: "Return only JSON.",
  responseSchema: {
    name: "footage_metadata",
    strict: true,
    schema: {
      type: "object",
      properties: { description: { type: "string" } },
      required: ["description"],
      additionalProperties: false,
    },
  },
};

describe("OpenAI frame analysis provider", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_FRAME_ANALYSIS_MODEL;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalOpenAiApiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalOpenAiApiKey;
    if (originalOpenAiFrameAnalysisModel === undefined) {
      delete process.env.OPENAI_FRAME_ANALYSIS_MODEL;
    } else {
      process.env.OPENAI_FRAME_ANALYSIS_MODEL = originalOpenAiFrameAnalysisModel;
    }
  });

  it("reports missing OPENAI_API_KEY before issuing a request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { openAiFrameAnalysisProvider } = await loadProvider();

    await expect(
      openAiFrameAnalysisProvider.analyzeFrames(frameInput)
    ).rejects.toThrow("OPENAI_API_KEY is not configured");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends sampled frames to the official OpenAI chat completions endpoint", async () => {
    process.env.OPENAI_API_KEY = "sk-openai-test";
    process.env.OPENAI_FRAME_ANALYSIS_MODEL = "gpt-4o-mini";
    const fetchMock = vi.fn(async () =>
      okJson({
        choices: [{ message: { content: '{"description":"warm lake"}' } }],
      })
    );
    vi.stubGlobal("fetch", fetchMock);
    const { openAiFrameAnalysisProvider } = await loadProvider();

    const result = await openAiFrameAnalysisProvider.analyzeFrames(frameInput);

    expect(result).toBe('{"description":"warm lake"}');
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.openai.com/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: "Bearer sk-openai-test",
        },
      })
    );
    const payload = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(payload.model).toBe("gpt-4o-mini");
    expect(payload.response_format).toEqual({
      type: "json_schema",
      json_schema: frameInput.responseSchema,
    });
    expect(payload.messages[1].content).toEqual([
      {
        type: "text",
        text: "Analyze these 2 sampled frames from lake.mov. They are ordered from earlier to later in the clip.",
      },
      { type: "text", text: "Frame 1 of 2" },
      { type: "image_url", image_url: { url: "data:image/jpeg;base64,first" } },
      { type: "text", text: "Frame 2 of 2" },
      { type: "image_url", image_url: { url: "data:image/jpeg;base64,second" } },
    ]);
    expect(JSON.stringify(payload)).not.toContain("enable_thinking");
  });

  it("defaults to gpt-4o-mini when OPENAI_FRAME_ANALYSIS_MODEL is unset", async () => {
    process.env.OPENAI_API_KEY = "sk-openai-test";
    const fetchMock = vi.fn(async () =>
      okJson({
        choices: [{ message: { content: '{"description":"warm lake"}' } }],
      })
    );
    vi.stubGlobal("fetch", fetchMock);
    const { openAiFrameAnalysisProvider } = await loadProvider();

    await openAiFrameAnalysisProvider.analyzeFrames(frameInput);

    const payload = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(payload.model).toBe("gpt-4o-mini");
  });

  it("returns clear provider errors", async () => {
    process.env.OPENAI_API_KEY = "sk-openai-test";
    const fetchMock = vi.fn(
      async () => new Response("bad request", { status: 400, statusText: "Bad Request" })
    );
    vi.stubGlobal("fetch", fetchMock);
    const { openAiFrameAnalysisProvider } = await loadProvider();

    await expect(
      openAiFrameAnalysisProvider.analyzeFrames(frameInput)
    ).rejects.toThrow(
      "OpenAI frame analysis failed: 400 Bad Request - bad request"
    );
  });
});
