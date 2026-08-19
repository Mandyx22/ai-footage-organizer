import { describe, expect, it } from "vitest";
import { createUploadQueue, getOversizeUploadError } from "./footage";

describe("raw footage upload transport", () => {
  it("uses multipart form data on the application upload endpoint with a timeout", async () => {
    let requestedMethod = "";
    let requestedUrl = "";
    let timeout = 0;
    let requestBody: unknown;
    const OriginalXHR = globalThis.XMLHttpRequest;
    class TestXHR {
      upload = { onprogress: null as unknown };
      status = 201;
      responseText = "";
      timeout = 0;
      open(method: string, url: string) { requestedMethod = method; requestedUrl = url; }
      setRequestHeader() {}
      send(body: unknown) { requestBody = body; timeout = this.timeout; this.onload?.(); }
      onload?: () => void;
      onerror?: () => void;
      ontimeout?: () => void;
    }
    globalThis.XMLHttpRequest = TestXHR as unknown as typeof XMLHttpRequest;
    try {
      const { uploadOriginalVideo } = await import("./footage");
      await uploadOriginalVideo(9, new File(["clip"], "memory.mov", { type: "video/quicktime" }), () => {});
    } finally {
      globalThis.XMLHttpRequest = OriginalXHR;
    }

    expect(requestedMethod).toBe("POST");
    expect(requestedUrl).toBe("/api/footage/upload/9");
    expect(timeout).toBe(120_000);
    expect(requestBody).toBeInstanceOf(FormData);
  });

  it("reports the actual over-limit file size with a practical retry recommendation", () => {
    expect(getOversizeUploadError("holiday.mov", 68.4 * 1024 * 1024)).toBe("holiday.mov is 68.4 MB. The prototype limit is 50 MB per clip; export a shorter or lower-resolution copy and try again.");
  });

  it("creates visible queued jobs for every selected file before sequential processing begins", () => {
    const ids = ["q-1", "q-2", "q-3"];
    const queue = createUploadQueue([{ name: "first.mov" }, { name: "second.mov" }, { name: "third.mov" }], () => ids.shift()!);
    expect(queue).toEqual([
      { id: "q-1", fileName: "first.mov", progress: 0, state: "queued" },
      { id: "q-2", fileName: "second.mov", progress: 0, state: "queued" },
      { id: "q-3", fileName: "third.mov", progress: 0, state: "queued" },
    ]);
  });
});
