import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const originalDashScopeApiKey = process.env.DASHSCOPE_API_KEY;
const originalQwenBaseUrl = process.env.QWEN_BASE_URL;
const originalQwenModel = process.env.QWEN_MODEL;
const originalNodeEnv = process.env.NODE_ENV;

async function loadProvider() {
  vi.resetModules();
  return import("./qwenProvider");
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

describe("Qwen frame analysis provider", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    delete process.env.DASHSCOPE_API_KEY;
    delete process.env.QWEN_BASE_URL;
    delete process.env.QWEN_MODEL;
    process.env.NODE_ENV = "development";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalDashScopeApiKey === undefined) delete process.env.DASHSCOPE_API_KEY;
    else process.env.DASHSCOPE_API_KEY = originalDashScopeApiKey;
    if (originalQwenBaseUrl === undefined) delete process.env.QWEN_BASE_URL;
    else process.env.QWEN_BASE_URL = originalQwenBaseUrl;
    if (originalQwenModel === undefined) delete process.env.QWEN_MODEL;
    else process.env.QWEN_MODEL = originalQwenModel;
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
  });

  it("reports missing DASHSCOPE_API_KEY before issuing a request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { qwenFrameAnalysisProvider } = await loadProvider();

    await expect(qwenFrameAnalysisProvider.analyzeFrames(frameInput)).rejects.toThrow("DASHSCOPE_API_KEY is not configured");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("requires QWEN_BASE_URL in production", async () => {
    process.env.NODE_ENV = "production";
    process.env.DASHSCOPE_API_KEY = "sk-qwen-test";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { qwenFrameAnalysisProvider } = await loadProvider();

    await expect(qwenFrameAnalysisProvider.analyzeFrames(frameInput)).rejects.toThrow("QWEN_BASE_URL is required in production");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends sampled frames to the configured Qwen OpenAI-compatible endpoint", async () => {
    process.env.DASHSCOPE_API_KEY = "sk-qwen-test";
    process.env.QWEN_BASE_URL = "https://workspace.cn-beijing.maas.aliyuncs.com/compatible-mode/v1/";
    process.env.QWEN_MODEL = "qwen3.7-flash";
    const fetchMock = vi.fn(async () => okJson({
      choices: [{ message: { content: "{\"description\":\"warm lake\"}" } }],
    }));
    vi.stubGlobal("fetch", fetchMock);
    const { qwenFrameAnalysisProvider } = await loadProvider();

    const result = await qwenFrameAnalysisProvider.analyzeFrames(frameInput);

    expect(result).toBe("{\"description\":\"warm lake\"}");
    expect(fetchMock).toHaveBeenCalledWith("https://workspace.cn-beijing.maas.aliyuncs.com/compatible-mode/v1/chat/completions", expect.objectContaining({
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer sk-qwen-test",
      },
    }));
    const payload = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(payload.model).toBe("qwen3.7-flash");
    expect(payload.enable_thinking).toBe(false);
    expect(payload.response_format).toEqual({
      type: "json_schema",
      json_schema: frameInput.responseSchema,
    });
    expect(payload.messages[1].content).toEqual([
      { type: "text", text: "Analyze these 2 sampled frames from lake.mov. They are ordered from earlier to later in the clip." },
      { type: "text", text: "Frame 1 of 2" },
      { type: "image_url", image_url: { url: "data:image/jpeg;base64,first" } },
      { type: "text", text: "Frame 2 of 2" },
      { type: "image_url", image_url: { url: "data:image/jpeg;base64,second" } },
    ]);
    expect(JSON.stringify(payload)).not.toContain("detail");
  });

  it("uses the local DashScope fallback only outside production", async () => {
    process.env.DASHSCOPE_API_KEY = "sk-qwen-test";
    const fetchMock = vi.fn(async () => okJson({
      choices: [{ message: { content: "{\"description\":\"warm lake\"}" } }],
    }));
    vi.stubGlobal("fetch", fetchMock);
    const { qwenFrameAnalysisProvider } = await loadProvider();

    await qwenFrameAnalysisProvider.analyzeFrames(frameInput);

    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions");
  });

  it("returns clear provider errors", async () => {
    process.env.DASHSCOPE_API_KEY = "sk-qwen-test";
    process.env.QWEN_BASE_URL = "https://workspace.cn-beijing.maas.aliyuncs.com/compatible-mode/v1";
    const fetchMock = vi.fn(async () => new Response("bad model", { status: 400, statusText: "Bad Request" }));
    vi.stubGlobal("fetch", fetchMock);
    const { qwenFrameAnalysisProvider } = await loadProvider();

    await expect(qwenFrameAnalysisProvider.analyzeFrames(frameInput)).rejects.toThrow("Qwen frame analysis failed: 400 Bad Request - bad model");
  });
});
