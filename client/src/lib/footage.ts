import { COOKIE_NAME } from "@shared/const";

export type Clip = {
  id: number;
  projectIds: number[];
  fileName: string;
  durationMs: number;
  thumbnailUrl: string | null;
  mediaUrl: string | null;
  status: "uploading" | "analyzing" | "ready" | "failed";
  description: string;
  subjects: string[];
  setting: string;
  time: string;
  lighting: string[];
  colors: string[];
  mood: string[];
  shotType: string;
  cameraMotion: string;
  possibleUses: string[];
  createdAt: Date | string;
};

export type UploadJob = {
  id: string;
  fileName: string;
  progress: number;
  state: "queued" | "sampling" | "analyzing" | "uploading" | "ready" | "failed";
  previewUrl?: string;
  error?: string;
};

export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

export function getOversizeUploadError(fileName: string, sizeBytes: number) {
  return `${fileName} is ${(sizeBytes / 1024 / 1024).toFixed(1)} MB. The prototype limit is 50 MB per clip; export a shorter or lower-resolution copy and try again.`;
}

export function createUploadQueue(files: Array<{ name: string }>, idFactory: () => string = () => crypto.randomUUID()): UploadJob[] {
  return files.map(file => ({ id: idFactory(), fileName: file.name, progress: 0, state: "queued" }));
}

export const gradients = [
  "from-[#8eb4cc] via-[#bad0d2] to-[#f0d1a9]", "from-[#eac08a] via-[#f3dfa6] to-[#f8eece]",
  "from-[#d77f56] via-[#e6a066] to-[#f4d7ae]", "from-[#7f9ab6] via-[#b8bdcf] to-[#dbbed1]",
  "from-[#9fb982] via-[#d3d994] to-[#efe2a4]", "from-[#b28b6f] via-[#d7b89e] to-[#eedbc0]",
  "from-[#bb8fb2] via-[#e2a6b8] to-[#f0c5b6]", "from-[#7da5b4] via-[#b7cbd0] to-[#e4d6b6]",
];

export const demoImages: Record<number, string> = {
  101: "/manus-storage/framefind-neon-friends_7a73187d.jpg",
  102: "/manus-storage/framefind-train-window_d21b7acd.jpg",
  103: "/manus-storage/framefind-ramen_0e83dd49.jpg",
  104: "/manus-storage/framefind-rain-street_6a24bf45.jpg",
};

export function hideBrokenImageElement(image: HTMLImageElement) {
  image.style.display = "none";
  image.setAttribute("aria-hidden", "true");
}

function sessionBearerHeaders() {
  try {
    const raw = sessionStorage.getItem("manus-cookie");
    if (!raw) return {};
    const prefix = `${COOKIE_NAME}=`;
    const pair = raw.split(";").find(value => value.trim().startsWith(prefix));
    const token = pair?.trim().slice(prefix.length);
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

export function formatDuration(durationMs: number) {
  const seconds = Math.max(0, Math.round(durationMs / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export const REPRESENTATIVE_FRAME_RATIOS = [0.1, 0.35, 0.6, 0.85] as const;

export function representativeFrameTimes(durationSeconds: number) {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0.25) return [0.1];
  const latestSafeTime = Math.max(durationSeconds - 0.1, 0.1);
  const times = REPRESENTATIVE_FRAME_RATIOS.map(ratio => Math.min(Math.max(durationSeconds * ratio, 0.1), latestSafeTime));
  return Array.from(new Map(times.map(time => [time.toFixed(3), time])).values());
}

async function seekVideo(video: HTMLVideoElement, time: number) {
  await new Promise<void>((resolve, reject) => {
    video.onseeked = () => resolve();
    video.onerror = () => reject(new Error("The browser could not sample a frame."));
    video.currentTime = time;
  });
}

function captureVideoFrame(video: HTMLVideoElement) {
  const ratio = Math.min(960 / video.videoWidth, 540 / video.videoHeight, 1);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(video.videoWidth * ratio));
  canvas.height = Math.max(1, Math.round(video.videoHeight * ratio));
  canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.82);
}

export async function representativeFrame(file: File) {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.preload = "metadata";
  video.muted = true;
  video.playsInline = true;
  video.src = url;
  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("The browser could not inspect this video."));
    });
    const previewDataUrls: string[] = [];
    for (const time of representativeFrameTimes(video.duration)) {
      await seekVideo(video, time);
      previewDataUrls.push(captureVideoFrame(video));
    }
    return { previewDataUrl: previewDataUrls[0], previewDataUrls, durationMs: Math.round(video.duration * 1000) };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function uploadOriginalVideo(clipId: number, file: File, onProgress: (value: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", `/api/footage/upload/${clipId}`);
    request.timeout = 120_000;
    const authHeaders = sessionBearerHeaders();
    if (authHeaders.Authorization) request.setRequestHeader("Authorization", authHeaders.Authorization);
    request.upload.onprogress = event => event.lengthComputable && onProgress(Math.round((event.loaded / event.total) * 100));
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) { resolve(); return; }
      let detail = "";
      try { detail = JSON.parse(request.responseText)?.error ?? ""; } catch { detail = ""; }
      reject(new Error(detail || `The video could not be saved (upload returned ${request.status}).`));
    };
    request.onerror = () => reject(new Error("The upload connection was interrupted before the video reached the server."));
    request.ontimeout = () => reject(new Error("The upload took longer than two minutes. Please retry with a smaller video."));
    const body = new FormData();
    body.append("video", file, file.name);
    request.send(body);
  });
}
