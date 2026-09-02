import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  OPENAI_EMBEDDING_COMPARISON_DIMENSION,
  OPENAI_EMBEDDING_NATIVE_DIMENSION,
  OPENAI_EMBEDDINGS_URL,
} from "./openaiEmbeddingProvider";

const originalOpenAiApiKey = process.env.OPENAI_API_KEY;
const originalNodeEnv = process.env.NODE_ENV;

async function loadProvider() {
  vi.resetModules();
  return import("./openaiEmbeddingProvider");
}

function okJson(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function denseVector(dimension: number, fill: number) {
  return Array.from(
    { length: dimension },
    (_, index) => fill + index * 0.000001
  );
}

function embeddingResponse(vectors: number[][]) {
  return {
    data: vectors.map((embedding, index) => ({ embedding, index })),
  };
}

describe("OpenAI embedding provider", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    delete process.env.OPENAI_API_KEY;
    process.env.NODE_ENV = "development";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalOpenAiApiKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = originalOpenAiApiKey;
    }
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }
  });

  it("reports missing OPENAI_API_KEY before issuing a request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { createOpenAiEmbeddingProvider } = await loadProvider();

    await expect(
      createOpenAiEmbeddingProvider().embedQuery("quiet blue night shots")
    ).rejects.toThrow("OPENAI_API_KEY is not configured");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("defaults to native 3072 and omits the dimensions truncate", async () => {
    process.env.OPENAI_API_KEY = "sk-openai-test";
    const vector = denseVector(OPENAI_EMBEDDING_NATIVE_DIMENSION, 0.4);
    const fetchMock = vi.fn(async () => okJson(embeddingResponse([vector])));
    vi.stubGlobal("fetch", fetchMock);
    const { createOpenAiEmbeddingProvider } = await loadProvider();
    const provider = createOpenAiEmbeddingProvider();

    expect(provider.id).toBe("openai");
    expect(provider.model).toBe("text-embedding-3-large");
    expect(provider.dimension).toBe(3072);

    const documents = await provider.embedDocuments(["clip canonical text"]);
    const query = await provider.embedQuery("quiet blue night shots");

    expect(documents[0]).toEqual(vector);
    expect(query).toEqual(vector);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(OPENAI_EMBEDDINGS_URL);

    const documentPayload = JSON.parse(
      String(fetchMock.mock.calls[0]?.[1]?.body)
    );
    const queryPayload = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body));
    expect(documentPayload).toEqual({
      model: "text-embedding-3-large",
      input: ["clip canonical text"],
      encoding_format: "float",
    });
    expect(documentPayload).not.toHaveProperty("dimensions");
    expect(queryPayload).not.toHaveProperty("text_type");
    expect(queryPayload.input).toEqual(["quiet blue night shots"]);
  });

  it("can request the 1024 comparison truncate without changing the model", async () => {
    process.env.OPENAI_API_KEY = "sk-openai-test";
    const vector = denseVector(OPENAI_EMBEDDING_COMPARISON_DIMENSION, 0.5);
    const fetchMock = vi.fn(async () => okJson(embeddingResponse([vector])));
    vi.stubGlobal("fetch", fetchMock);
    const { createOpenAiEmbeddingProvider } = await loadProvider();
    const provider = createOpenAiEmbeddingProvider(
      OPENAI_EMBEDDING_COMPARISON_DIMENSION
    );

    expect(provider.dimension).toBe(1024);
    await provider.embedQuery("quiet blue night shots");

    const payload = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(payload.model).toBe("text-embedding-3-large");
    expect(payload.dimensions).toBe(1024);
  });

  it("reports HTTP errors without switching models", async () => {
    process.env.OPENAI_API_KEY = "sk-openai-test";
    const fetchMock = vi.fn(
      async () =>
        new Response("model_not_found", {
          status: 404,
          statusText: "Not Found",
        })
    );
    vi.stubGlobal("fetch", fetchMock);
    const { createOpenAiEmbeddingProvider } = await loadProvider();

    await expect(
      createOpenAiEmbeddingProvider().embedQuery("quiet blue night shots")
    ).rejects.toThrow(
      /OpenAI embedding failed: 404 Not Found endpoint=https:\/\/api.openai.com\/v1\/embeddings model=text-embedding-3-large/
    );
  });
});
