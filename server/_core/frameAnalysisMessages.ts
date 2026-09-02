export function buildFrameAnalysisUserContent(
  fileName: string,
  previewDataUrls: string[]
) {
  return [
    {
      type: "text" as const,
      text: `Analyze these ${previewDataUrls.length} sampled frames from ${fileName}. They are ordered from earlier to later in the clip.`,
    },
    ...previewDataUrls.flatMap((url, index) => [
      {
        type: "text" as const,
        text: `Frame ${index + 1} of ${previewDataUrls.length}`,
      },
      { type: "image_url" as const, image_url: { url } },
    ]),
  ];
}

type ChatCompletionContent =
  | string
  | Array<{ type?: string; text?: string }>
  | undefined;

export function chatCompletionContentToText(content: ChatCompletionContent) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map(part => (part.type === "text" && part.text ? part.text : ""))
      .join("")
      .trim();
  }
  return "";
}
