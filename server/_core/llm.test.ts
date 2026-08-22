import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const originalOpenAiApiKey = process.env.OPENAI_API_KEY;
const originalForgeApiKey = process.env.BUILT_IN_FORGE_API_KEY;
const originalForgeApiUrl = process.env.BUILT_IN_FORGE_API_URL;

async function loadLlm() {
  vi.resetModules();
  return import("./llm");
}

function okJson(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("OpenAI LLM provider", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    delete process.env.OPENAI_API_KEY;
    delete process.env.BUILT_IN_FORGE_API_KEY;
    delete process.env.BUILT_IN_FORGE_API_URL;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalOpenAiApiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalOpenAiApiKey;
    if (originalForgeApiKey === undefined) delete process.env.BUILT_IN_FORGE_API_KEY;
    else process.env.BUILT_IN_FORGE_API_KEY = originalForgeApiKey;
    if (originalForgeApiUrl === undefined) delete process.env.BUILT_IN_FORGE_API_URL;
    else process.env.BUILT_IN_FORGE_API_URL = originalForgeApiUrl;
  });

  it("reports missing OPENAI_API_KEY before issuing a request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { listLLMModels } = await loadLlm();

    await expect(listLLMModels()).rejects.toThrow("OPENAI_API_KEY is not configured");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("lists models from the official OpenAI endpoint using OPENAI_API_KEY", async () => {
    process.env.OPENAI_API_KEY = "sk-test-openai";
    process.env.BUILT_IN_FORGE_API_KEY = "forge-key-should-not-be-used";
    process.env.BUILT_IN_FORGE_API_URL = "https://forge.example.test";
    const fetchMock = vi.fn(async () => okJson({ object: "list", data: [{ id: "gpt-5-mini", object: "model", created: 0, owned_by: "openai" }] }));
    vi.stubGlobal("fetch", fetchMock);
    const { listLLMModels } = await loadLlm();

    const result = await listLLMModels();

    expect(result.data[0]?.id).toBe("gpt-5-mini");
    expect(fetchMock).toHaveBeenCalledWith("https://api.openai.com/v1/models", {
      headers: { authorization: "Bearer sk-test-openai" },
    });
  });

  it("sends multimodal frame analysis requests to OpenAI chat completions with structured JSON output", async () => {
    process.env.OPENAI_API_KEY = "sk-test-openai";
    const fetchMock = vi.fn(async () => okJson({
      id: "chatcmpl_test",
      created: 0,
      model: "gpt-5-mini",
      choices: [{ index: 0, message: { role: "assistant", content: "{\"description\":\"test\"}" }, finish_reason: "stop" }],
    }));
    vi.stubGlobal("fetch", fetchMock);
    const { invokeLLM } = await loadLlm();

    await invokeLLM({
      model: "gpt-5-mini",
      messages: [
        { role: "system", content: "Return only JSON." },
        {
          role: "user",
          content: [
            { type: "text", text: "Frame 1 of 1" },
            { type: "image_url", image_url: { url: "data:image/jpeg;base64,abc", detail: "low" } },
          ],
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "footage_metadata",
          strict: true,
          schema: {
            type: "object",
            properties: { description: { type: "string" } },
            required: ["description"],
            additionalProperties: false,
          },
        },
      },
    });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.openai.com/v1/chat/completions");
    expect(init.headers).toMatchObject({
      "content-type": "application/json",
      authorization: "Bearer sk-test-openai",
    });
    const payload = JSON.parse(String(init.body));
    expect(payload.model).toBe("gpt-5-mini");
    expect(payload.messages[1].content).toEqual([
      { type: "text", text: "Frame 1 of 1" },
      { type: "image_url", image_url: { url: "data:image/jpeg;base64,abc", detail: "low" } },
    ]);
    expect(payload.response_format).toMatchObject({
      type: "json_schema",
      json_schema: {
        name: "footage_metadata",
        strict: true,
      },
    });
  });
});
