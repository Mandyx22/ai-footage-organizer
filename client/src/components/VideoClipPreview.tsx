import { Pause, Play, Volume2 } from "lucide-react";
import { useRef, useState } from "react";
import type { Clip } from "@/lib/footage";

export function VideoClipPreview({ clip }: { clip: Clip }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(Math.max(0, clip.durationMs / 1000));
  const [failed, setFailed] = useState(false);
  const togglePlayback = async () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) { await video.play(); setIsPlaying(true); } else { video.pause(); setIsPlaying(false); }
  };
  const seek = (value: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = value;
    setCurrentTime(value);
  };
  if (!clip.mediaUrl || failed) return <div className="grid aspect-[16/10] place-items-center rounded-xl border-[1.5px] border-[#2c2922]/45 bg-[#e8eff7] px-6 text-center text-xs leading-5 ink-muted">The visual note is ready. Full playback will appear once the original media finishes saving.</div>;
  return <div className="overflow-hidden rounded-xl border-[1.5px] border-[#2c2922]/55 bg-[#191919]"><video ref={videoRef} src={clip.mediaUrl} poster={clip.thumbnailUrl ?? undefined} playsInline preload="metadata" className="aspect-[16/10] w-full object-contain" onLoadedMetadata={event => setDuration(event.currentTarget.duration || duration)} onTimeUpdate={event => setCurrentTime(event.currentTarget.currentTime)} onPlay={() => setIsPlaying(true)} onPause={() => setIsPlaying(false)} onEnded={() => setIsPlaying(false)} onError={() => setFailed(true)} /><div className="flex items-center gap-2 bg-[#fffdf7] px-3 py-2"><button aria-label={isPlaying ? "Pause clip" : "Play clip"} onClick={togglePlayback} className="grid size-7 shrink-0 place-items-center rounded-full border-[1.5px] border-[#2c2922] bg-[#f4ad89] shadow-[1px_1px_0_#2c2922]">{isPlaying ? <Pause className="size-3.5" /> : <Play className="ml-0.5 size-3.5" />}</button><input aria-label="Clip progress" type="range" min={0} max={Math.max(duration, 0.01)} step={0.01} value={Math.min(currentTime, duration)} onChange={event => seek(Number(event.target.value))} className="h-1.5 min-w-0 flex-1 accent-[#e69275]" /><span className="font-mono text-[9px] text-[#665e53]">{Math.floor(currentTime)}s / {Math.ceil(duration)}s</span><Volume2 className="size-3.5 text-[#665e53]" /></div></div>;
}
