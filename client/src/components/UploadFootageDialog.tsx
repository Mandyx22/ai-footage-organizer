import { UploadResultSummary } from "@/components/UploadResultSummary";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { createUploadQueue, getOversizeUploadError, MAX_UPLOAD_BYTES, representativeFrame, type UploadJob, uploadOriginalVideo } from "@/lib/footage";
import { discardFailedTemporaryClip, finalizeUploadCompletion, getPostUploadDestination, refreshPersonalFootageQueries } from "@/lib/uploadOutcome";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import { Film, Loader2, UploadCloud } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

export function UploadFootageDialog({ open, onOpenChange, projectId = null }: { open: boolean; onOpenChange: (open: boolean) => void; projectId?: number | null }) {
  const [jobs, setJobs] = useState<UploadJob[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [libraryActionReady, setLibraryActionReady] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const analyzeFrame = trpc.footage.analyzeFrame.useMutation();
  const deleteClip = trpc.footage.delete.useMutation();

  useEffect(() => {
    if (!open) return;
    setJobs([]);
    setLibraryActionReady(false);
    setIsDragging(false);
  }, [open]);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setJobs([]);
      setLibraryActionReady(false);
      setIsDragging(false);
    }
    onOpenChange(nextOpen);
  };

  const processFiles = async (files: File[]) => {
    const videoFiles = files.filter(file => file.type.startsWith("video/"));
    if (!videoFiles.length) { toast.error("Please choose one or more video files."); return; }
    const queuedJobs = createUploadQueue(videoFiles);
    setJobs(queuedJobs);
    let succeeded = 0;
    for (let index = 0; index < videoFiles.length; index += 1) {
      const file = videoFiles[index];
      const id = queuedJobs[index].id;
      let analyzedClipId: number | null = null;
      setJobs(current => current.map(job => job.id === id ? { ...job, progress: 7, state: "sampling" } : job));
      try {
        if (file.size > MAX_UPLOAD_BYTES) throw new Error(getOversizeUploadError(file.name, file.size));
        const frame = await representativeFrame(file);
        setJobs(current => current.map(job => job.id === id ? { ...job, previewUrl: frame.previewDataUrl, progress: 22, state: "analyzing" } : job));
        const analyzed = await analyzeFrame.mutateAsync({ fileName: file.name, mimeType: file.type || "video/mp4", sizeBytes: file.size, durationMs: frame.durationMs, projectId, previewDataUrl: frame.previewDataUrl, previewDataUrls: frame.previewDataUrls });
        analyzedClipId = analyzed.clip.id;
        setJobs(current => current.map(job => job.id === id ? { ...job, progress: 35, state: "uploading" } : job));
        await uploadOriginalVideo(analyzed.clip.id, file, progress => setJobs(current => current.map(job => job.id === id ? { ...job, progress: Math.max(35, progress), state: "uploading" } : job)));
        setJobs(current => current.map(job => job.id === id ? { ...job, progress: 100, state: "ready" } : job));
        succeeded += 1;
        toast.success(`${file.name} is ready to explore.`);
      } catch (error) {
        await discardFailedTemporaryClip(analyzedClipId, clipId => deleteClip.mutateAsync({ clipId }));
        toast.error(`${file.name} was not added to your Workspace. ${error instanceof Error ? error.message : "Please try again."}`);
        setJobs(current => current.map(job => job.id === id ? { ...job, progress: 100, state: "failed", error: error instanceof Error ? error.message : "Upload failed." } : job));
      }
    }
    const outcome = await finalizeUploadCompletion({
      total: videoFiles.length,
      succeeded,
      refreshPersonalFootage: () => refreshPersonalFootageQueries({
        personalList: () => utils.footage.personalList.invalidate(),
        personalSearch: () => utils.footage.personalSearch.invalidate(),
        personalSimilar: () => utils.footage.personalSimilar.invalidate(),
      }),
    });
    if (outcome.shouldOfferLibraryAction) {
      if (succeeded > 0) {
        setJobs(current => current.filter(job => job.state === "ready"));
      }
      setLibraryActionReady(true);
      const destination = getPostUploadDestination(outcome);
      if (destination) {
        handleOpenChange(false);
        navigate(destination);
      } else {
        toast.warning(outcome.message);
      }
    }
  };
  return <Dialog open={open} onOpenChange={handleOpenChange}><DialogContent className="border-[1.5px] border-[#2c2922] bg-[#fffdf7] text-[#2c2922] shadow-[4px_4px_0_#2c2922] sm:max-w-xl"><DialogHeader><DialogTitle className="font-hand text-3xl font-bold">Bring in a moment.</DialogTitle><DialogDescription className="ink-muted">Framefind reads several frames, writes visual notes, then keeps the original clip safely in your workspace.</DialogDescription></DialogHeader><input ref={inputRef} type="file" accept="video/*" multiple className="hidden" onChange={event => { processFiles(Array.from(event.target.files ?? [])); event.target.value = ""; }} /><button onClick={() => inputRef.current?.click()} onDragOver={event => { event.preventDefault(); setIsDragging(true); }} onDragLeave={() => setIsDragging(false)} onDrop={event => { event.preventDefault(); setIsDragging(false); processFiles(Array.from(event.dataTransfer.files)); }} className={cn("pressable mt-3 grid min-h-44 w-full place-items-center rounded-2xl border-[1.5px] border-dashed border-[#2c2922]/55 p-6 text-center transition-colors", isDragging ? "bg-[#f8d9cc]" : "bg-[#e8eff7] hover:bg-[#dcefdc]")}><div><div className="mx-auto grid size-11 -rotate-3 place-items-center rounded-xl border-[1.5px] border-[#2c2922] bg-[#f4ad89] shadow-[2px_2px_0_#2c2922]"><UploadCloud className="size-5" /></div><p className="mt-4 font-hand text-2xl font-bold">{isDragging ? "Release to make some notes" : "Drop clips here, or browse files"}</p><p className="mt-1 text-xs ink-muted">Multiple videos · 50 MB per clip in this prototype</p></div></button>{jobs.length > 0 && <div className="mt-4 space-y-3">{jobs.map(job => <div key={job.id} className="flex items-center gap-3 rounded-xl border border-[#2c2922]/24 bg-[#f4f0e7] p-3"><div className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-lg border border-[#2c2922]/30 bg-[#e8eff7]">{job.previewUrl ? <img src={job.previewUrl} alt="" className="h-full w-full object-cover" /> : <Film className="size-4 ink-muted" />}</div><div className="min-w-0 flex-1"><div className="mb-1 flex items-center justify-between gap-2"><p className="truncate text-xs font-semibold">{job.fileName}</p><span className={cn("font-mono text-[9px] uppercase", job.state === "failed" ? "text-red-700" : job.state === "ready" ? "text-emerald-700" : "text-orange-700")}>{job.state === "failed" ? "failed" : job.state === "ready" ? "ready" : job.state === "queued" ? "queued" : `${job.progress}%`}</span></div><Progress value={job.progress} className="h-1 bg-[#ded6c8]" /><p className="mt-1 text-[10px] ink-muted">{job.error ?? (job.state === "queued" ? "Waiting in your upload queue" : job.state === "sampling" ? "Sampling a few frames" : job.state === "analyzing" ? "Writing visual notes with AI" : job.state === "uploading" ? "Saving the original clip" : "Visual notes are ready")}</p></div></div>)}</div>}<UploadResultSummary jobs={jobs} showLibraryAction={libraryActionReady} onOpenLibrary={() => { handleOpenChange(false); navigate("/my-library?uploaded=1"); }} /><p className="text-center text-[10px] leading-5 ink-muted">Files are analyzed after you choose them. Several frames are used to write the first visual notes.</p>{analyzeFrame.isPending && <div className="flex items-center justify-center gap-2 text-xs ink-muted"><Loader2 className="size-3.5 animate-spin" />Working carefully…</div>}<Button variant="ghost" onClick={() => handleOpenChange(false)} className="mx-auto mt-1 text-xs ink-muted hover:bg-[#fff1ba] hover:text-[#2c2922]">Close upload desk</Button></DialogContent></Dialog>;
}
