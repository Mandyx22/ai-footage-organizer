export type Clip = {
  id: number;
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
  state: "sampling" | "analyzing" | "uploading" | "ready" | "failed";
  previewUrl?: string;
  error?: string;
};

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

export function formatDuration(durationMs: number) {
  const seconds = Math.max(0, Math.round(durationMs / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export function matchReasons(clip: Clip, query: string) {
  const terms = query.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  const metadata = [...clip.subjects, clip.setting, clip.time, ...clip.lighting, ...clip.colors, ...clip.mood, clip.shotType, clip.cameraMotion, ...clip.possibleUses];
  return terms.filter(term => metadata.some(value => value.toLowerCase().includes(term))).slice(0, 3);
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
    video.currentTime = Math.min(Math.max(video.duration * 0.25, 0.1), Math.max(video.duration - 0.1, 0.1));
    await new Promise<void>((resolve, reject) => {
      video.onseeked = () => resolve();
      video.onerror = () => reject(new Error("The browser could not sample a frame."));
    });
    const ratio = Math.min(960 / video.videoWidth, 540 / video.videoHeight, 1);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(video.videoWidth * ratio));
    canvas.height = Math.max(1, Math.round(video.videoHeight * ratio));
    canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
    return { previewDataUrl: canvas.toDataURL("image/jpeg", 0.82), durationMs: Math.round(video.duration * 1000) };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function uploadRawVideo(clipId: number, file: File, onProgress: (value: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", `/api/footage/upload/${clipId}`);
    request.setRequestHeader("Content-Type", file.type || "video/mp4");
    request.setRequestHeader("x-file-name", encodeURIComponent(file.name));
    request.upload.onprogress = event => event.lengthComputable && onProgress(Math.round((event.loaded / event.total) * 100));
    request.onload = () => request.status >= 200 && request.status < 300 ? resolve() : reject(new Error("The video could not be saved."));
    request.onerror = () => reject(new Error("The upload connection was interrupted."));
    request.send(file);
  });
}
