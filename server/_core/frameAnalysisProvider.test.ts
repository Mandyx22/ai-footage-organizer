import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const originalFrameAnalysisProvider = process.env.FRAME_ANALYSIS_PROVIDER;

async function loadFrameAnalysisProvider() {
  vi.resetModules();
  return import("./frameAnalysisProvider");
}

describe("frame analysis provider selection", () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.FRAME_ANALYSIS_PROVIDER;
  });

  afterEach(() => {
    if (originalFrameAnalysisProvider === undefined) {
      delete process.env.FRAME_ANALYSIS_PROVIDER;
    } else {
      process.env.FRAME_ANALYSIS_PROVIDER = originalFrameAnalysisProvider;
    }
  });

  it("defaults to qwen when FRAME_ANALYSIS_PROVIDER is unset", async () => {
    const { resolveFrameAnalysisProviderName, getFrameAnalysisProvider } =
      await loadFrameAnalysisProvider();

    expect(resolveFrameAnalysisProviderName()).toBe("qwen");
    const provider = getFrameAnalysisProvider();
    const { qwenFrameAnalysisProvider } = await import("./qwenProvider");
    expect(provider).toBe(qwenFrameAnalysisProvider);
  });

  it("selects openai when FRAME_ANALYSIS_PROVIDER=openai", async () => {
    process.env.FRAME_ANALYSIS_PROVIDER = "openai";
    const { resolveFrameAnalysisProviderName, getFrameAnalysisProvider } =
      await loadFrameAnalysisProvider();

    expect(resolveFrameAnalysisProviderName()).toBe("openai");
    const provider = getFrameAnalysisProvider();
    const { openAiFrameAnalysisProvider } = await import(
      "./openaiFrameAnalysisProvider"
    );
    expect(provider).toBe(openAiFrameAnalysisProvider);
  });

  it("selects qwen when FRAME_ANALYSIS_PROVIDER=qwen", async () => {
    process.env.FRAME_ANALYSIS_PROVIDER = "qwen";
    const { resolveFrameAnalysisProviderName, getFrameAnalysisProvider } =
      await loadFrameAnalysisProvider();

    expect(resolveFrameAnalysisProviderName()).toBe("qwen");
    const provider = getFrameAnalysisProvider();
    const { qwenFrameAnalysisProvider } = await import("./qwenProvider");
    expect(provider).toBe(qwenFrameAnalysisProvider);
  });

  it("rejects unknown FRAME_ANALYSIS_PROVIDER values", async () => {
    process.env.FRAME_ANALYSIS_PROVIDER = "anthropic";
    const { resolveFrameAnalysisProviderName } =
      await loadFrameAnalysisProvider();

    expect(() => resolveFrameAnalysisProviderName()).toThrow(
      'FRAME_ANALYSIS_PROVIDER must be "openai" or "qwen" (received "anthropic")'
    );
  });
});
