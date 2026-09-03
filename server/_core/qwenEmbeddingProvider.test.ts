import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  QWEN_EMBEDDING_DEFAULT_URL,
  QWEN_EMBEDDING_DIMENSION,
  QWEN_REAL_SMOKE_STATUS,
  resolveQwenEmbeddingUrl,
} from "./qwenEmbeddingProvider";

const originalDashScopeApiKey = process.env.DASHSCOPE_API_KEY;
const originalQwenBaseUrl = process.env.QWEN_BASE_URL;
const originalNodeEnv = process.env.NODE_ENV;

async function loadProvider() {
  vi.resetModules();
  return import("./qwenEmbeddingProvider");
}

function okJson(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function denseVector(fill: number) {
  return Array.from(
    { length: QWEN_EMBEDDING_DIMENSION },
    (_, index) => fill + index * 0.000001
  );
}

function embeddingResponse(vectors: number[][]) {
  return {
    code: "",
    output: {
      embeddings: vectors.map((embedding, text_index) => ({
        embedding,
        text_index,
      })),
    },
  };
}

describe("resolveQwenEmbeddingUrl", () => {
  it("records Qwen real smoke as blocked on Token Plan credentials", () => {
    expect(QWEN_REAL_SMOKE_STATUS).toBe(
      "blocked by credential type — existing key is Token Plan sk-sp"
    );
  });
  it("uses the China DashScope native embedding endpoint locally", () => {
    expect(resolveQwenEmbeddingUrl("", false)).toBe(QWEN_EMBEDDING_DEFAULT_URL);
  });

  it("requires QWEN_BASE_URL in production", () => {
    expect(() => resolveQwenEmbeddingUrl("", true)).toThrow(
      "QWEN_BASE_URL is required in production"
    );
  });

  it("rewrites OpenAI-compatible chat bases to the native embedding path", () => {
    expect(
      resolveQwenEmbeddingUrl(
        "https://dashscope.aliyuncs.com/compatible-mode/v1/",
        false
      )
    ).toBe(QWEN_EMBEDDING_DEFAULT_URL);
    expect(
      resolveQwenEmbeddingUrl(
        "https://workspace.cn-beijing.maas.aliyuncs.com/compatible-mode/v1",
        true
      )
    ).toBe(
      "https://workspace.cn-beijing.maas.aliyuncs.com/api/v1/services/embeddings/text-embedding/text-embedding"
    );
    expect(
      resolveQwenEmbeddingUrl("https://dashscope.aliyuncs.com/api/v1", false)
    ).toBe(QWEN_EMBEDDING_DEFAULT_URL);
  });
});

describe("Qwen embedding provider", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    delete process.env.DASHSCOPE_API_KEY;
    delete process.env.QWEN_BASE_URL;
    process.env.NODE_ENV = "development";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalDashScopeApiKey === undefined) {
      delete process.env.DASHSCOPE_API_KEY;
    } else {
      process.env.DASHSCOPE_API_KEY = originalDashScopeApiKey;
    }
    if (originalQwenBaseUrl === undefined) {
      delete process.env.QWEN_BASE_URL;
    } else {
      process.env.QWEN_BASE_URL = originalQwenBaseUrl;
    }
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }
  });

  it("reports missing DASHSCOPE_API_KEY before issuing a request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { createQwenEmbeddingProvider } = await loadProvider();

    await expect(
      createQwenEmbeddingProvider().embedQuery("quiet blue night shots")
    ).rejects.toThrow("DASHSCOPE_API_KEY is not configured");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends native document and query text_type without instruct", async () => {
    process.env.DASHSCOPE_API_KEY = "sk-qwen-test";
    const documentVector = denseVector(0.1);
    const queryVector = denseVector(0.2);
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const payload = JSON.parse(String(init?.body));
      const fill = payload.parameters.text_type === "query" ? 0.2 : 0.1;
      return okJson(embeddingResponse([denseVector(fill)]));
    });
    vi.stubGlobal("fetch", fetchMock);
    const { createQwenEmbeddingProvider } = await loadProvider();
    const provider = createQwenEmbeddingProvider();

    expect(provider.id).toBe("qwen");
    expect(provider.model).toBe("text-embedding-v4");
    expect(provider.dimension).toBe(1024);

    const documents = await provider.embedDocuments(["clip canonical text"]);
    const query = await provider.embedQuery("quiet blue night shots");

    expect(documents[0]).toEqual(documentVector);
    expect(query).toEqual(queryVector);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(QWEN_EMBEDDING_DEFAULT_URL);
    expect(String(fetchMock.mock.calls[0]?.[0])).not.toContain(
      "compatible-mode"
    );

    const documentPayload = JSON.parse(
      String(fetchMock.mock.calls[0]?.[1]?.body)
    );
    const queryPayload = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body));
    expect(documentPayload).toEqual({
      model: "text-embedding-v4",
      input: { texts: ["clip canonical text"] },
      parameters: { text_type: "document", dimension: 1024 },
    });
    expect(queryPayload.parameters.text_type).toBe("query");
    expect(queryPayload.parameters).not.toHaveProperty("instruct");
    expect(JSON.stringify(documentPayload)).not.toContain("instruct");
  });

  it("chunks documents into batches of 10", async () => {
    process.env.DASHSCOPE_API_KEY = "sk-qwen-test";
    const texts = Array.from({ length: 11 }, (_, index) => `clip ${index}`);
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const payload = JSON.parse(String(init?.body));
      return okJson(
        embeddingResponse(payload.input.texts.map(() => denseVector(0.3)))
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const { createQwenEmbeddingProvider } = await loadProvider();

    const vectors = await createQwenEmbeddingProvider().embedDocuments(texts);

    expect(vectors).toHaveLength(11);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(
      JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)).input.texts
    ).toHaveLength(10);
    expect(
      JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body)).input.texts
    ).toHaveLength(1);
  });

  it("reports DashScope error codes without switching models", async () => {
    process.env.DASHSCOPE_API_KEY = "sk-qwen-test";
    const fetchMock = vi.fn(async () =>
      okJson({
        code: "InvalidApiKey",
        message: "invalid key",
      })
    );
    vi.stubGlobal("fetch", fetchMock);
    const { createQwenEmbeddingProvider } = await loadProvider();

    await expect(
      createQwenEmbeddingProvider().embedQuery("quiet blue night shots")
    ).rejects.toThrow(
      /Qwen embedding failed: InvalidApiKey endpoint=.*text-embedding model=text-embedding-v4/
    );
  });

  it("rejects a wrong-sized Qwen vector", async () => {
    process.env.DASHSCOPE_API_KEY = "sk-qwen-test";
    const fetchMock = vi.fn(async () =>
      okJson({
        output: { embeddings: [{ embedding: [0.1, 0.2], text_index: 0 }] },
      })
    );
    vi.stubGlobal("fetch", fetchMock);
    const { createQwenEmbeddingProvider } = await loadProvider();

    await expect(
      createQwenEmbeddingProvider().embedDocuments(["clip"])
    ).rejects.toThrow(/expected 1024-d vector/);
  });
});
