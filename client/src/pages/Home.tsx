import { AIChatBox, type Message } from "@/components/AIChatBox";
import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Archive, ArrowUpRight, Check, ChevronDown, Clapperboard, Clock3, Film, FolderPlus,
  Grid2X2, ImagePlus, Layers3, Loader2, MessageCirclePlus, MoreHorizontal, Plus,
  Search, Sparkles, UploadCloud, WandSparkles, X,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";

type Clip = {
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

type UploadJob = { id: string; fileName: string; progress: number; state: "sampling" | "analyzing" | "uploading" | "ready" | "failed"; previewUrl?: string; error?: string };

const gradients = [
  "from-[#264b84] via-[#5e4b85] to-[#d36e95]", "from-[#8c592f] via-[#d89445] to-[#f1d491]",
  "from-[#813d2e] via-[#cd6d37] to-[#e9a150]", "from-[#152c55] via-[#464580] to-[#9a668d]",
  "from-[#2e553a] via-[#87984d] to-[#e2c46e]", "from-[#4c3a30] via-[#93755e] to-[#d9c4a7]",
  "from-[#162f67] via-[#984c86] to-[#dd889b]", "from-[#183a58] via-[#526f89] to-[#aeb3b0]",
];

const demoImages: Record<number, string> = {
  101: "/manus-storage/framefind-neon-friends_7a73187d.jpg",
  102: "/manus-storage/framefind-train-window_d21b7acd.jpg",
  103: "/manus-storage/framefind-ramen_0e83dd49.jpg",
  104: "/manus-storage/framefind-rain-street_6a24bf45.jpg",
};

const filters = ["All footage", "Night", "Warm", "Quiet", "People", "Wide", "Moving"];

function formatDuration(durationMs: number) {
  const seconds = Math.max(0, Math.round(durationMs / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function matchReasons(clip: Clip, query: string) {
  const terms = query.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  const metadata = [...clip.subjects, clip.setting, clip.time, ...clip.lighting, ...clip.colors, ...clip.mood, clip.shotType, clip.cameraMotion, ...clip.possibleUses];
  return terms.filter(term => metadata.some(value => value.toLowerCase().includes(term))).slice(0, 3);
}

async function representativeFrame(file: File) {
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

function uploadRawVideo(clipId: number, file: File, onProgress: (value: number) => void) {
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

export default function Home() {
  const { user, loading, isAuthenticated, logout } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState("All footage");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [focusedClipId, setFocusedClipId] = useState<number | null>(104);
  const [similarDimension, setSimilarDimension] = useState<"all" | "color" | "mood" | "lighting" | "subject" | "composition" | "motion">("all");
  const [showSimilar, setShowSimilar] = useState(false);
  const [uploadJobs, setUploadJobs] = useState<UploadJob[]>([]);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [collectionOpen, setCollectionOpen] = useState(false);
  const [collectionName, setCollectionName] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [chatMessages, setChatMessages] = useState<Message[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const utils = trpc.useUtils();
  const searchInput = useMemo(() => ({ query: searchQuery.trim() }), [searchQuery]);
  const similarInput = useMemo(() => ({ clipId: focusedClipId ?? 0, dimension: similarDimension }), [focusedClipId, similarDimension]);
  const library = trpc.footage.list.useQuery();
  const searched = trpc.footage.search.useQuery(searchInput, { enabled: searchQuery.trim().length > 1 });
  const similar = trpc.footage.similar.useQuery(similarInput, { enabled: Boolean(focusedClipId && showSimilar) });
  const collectionData = trpc.collections.list.useQuery();
  const collectionSuggestions = trpc.collections.suggestions.useQuery();
  const analyzeFrame = trpc.footage.analyzeFrame.useMutation();
  const askFootage = trpc.footage.ask.useMutation();
  const createCollection = trpc.collections.create.useMutation();
  const addClip = trpc.collections.addClip.useMutation();

  const baseClips = (library.data?.clips ?? []) as Clip[];
  const searchedClips = (searched.data?.clips ?? []) as Clip[];
  const similarClips = (similar.data?.clips ?? []) as Clip[];
  const filterTerm = activeFilter === "All footage" ? "" : activeFilter;
  const derivedClips = showSimilar ? similarClips : searchQuery.trim().length > 1 ? searchedClips : baseClips;
  const visibleClips = filterTerm ? derivedClips.filter(clip => [clip.description, ...clip.subjects, ...clip.mood, ...clip.colors, clip.shotType, clip.cameraMotion].join(" ").toLowerCase().includes(filterTerm.toLowerCase())) : derivedClips;
  const focusedClip = baseClips.find(clip => clip.id === focusedClipId) ?? visibleClips[0] ?? null;
  const collections = collectionData.data?.collections ?? [];
  const suggestedCollections = collectionSuggestions.data?.collections ?? [];
  const isSample = library.data?.mode === "sample";

  const refreshWorkspace = async () => {
    await Promise.all([utils.footage.list.invalidate(), utils.collections.list.invalidate(), utils.collections.suggestions.invalidate()]);
  };

  const toggleSelection = (id: number) => setSelectedIds(current => current.includes(id) ? current.filter(value => value !== id) : [...current, id]);
  const focusClip = (clip: Clip) => { setFocusedClipId(clip.id); setShowSimilar(false); };

  const processFiles = async (files: File[]) => {
    if (!isAuthenticated) { toast.info("Sign in to analyze and securely save your footage."); return; }
    const videoFiles = files.filter(file => file.type.startsWith("video/"));
    if (!videoFiles.length) { toast.error("Please choose one or more video files."); return; }
    setUploadOpen(false);
    for (const file of videoFiles) {
      const id = crypto.randomUUID();
      const localPreview = URL.createObjectURL(file);
      setUploadJobs(current => [{ id, fileName: file.name, progress: 7, state: "sampling", previewUrl: localPreview }, ...current]);
      try {
        if (file.size > 50 * 1024 * 1024) throw new Error("Prototype upload limit is 50 MB per clip.");
        const frame = await representativeFrame(file);
        setUploadJobs(current => current.map(job => job.id === id ? { ...job, progress: 22, state: "analyzing" } : job));
        const analyzed = await analyzeFrame.mutateAsync({ fileName: file.name, mimeType: file.type || "video/mp4", sizeBytes: file.size, durationMs: frame.durationMs, previewDataUrl: frame.previewDataUrl });
        setUploadJobs(current => current.map(job => job.id === id ? { ...job, progress: 35, state: "uploading" } : job));
        await uploadRawVideo(analyzed.clip.id, file, progress => setUploadJobs(current => current.map(job => job.id === id ? { ...job, progress: Math.max(35, progress), state: "uploading" } : job)));
        setUploadJobs(current => current.map(job => job.id === id ? { ...job, progress: 100, state: "ready" } : job));
        await refreshWorkspace();
      } catch (error) {
        setUploadJobs(current => current.map(job => job.id === id ? { ...job, progress: 100, state: "failed", error: error instanceof Error ? error.message : "Upload failed." } : job));
      }
    }
  };

  const handleAsk = async (question: string) => {
    if (!selectedIds.length) { toast.info("Select one or more clips first so Framefind can reason about your footage."); return; }
    setChatMessages(current => [...current, { role: "user", content: question }]);
    try {
      const response = await askFootage.mutateAsync({ question, clipIds: selectedIds });
      setChatMessages(current => [...current, { role: "assistant", content: response.answer }]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The creative assistant is unavailable right now.");
    }
  };

  const createCollectionFromSelection = async () => {
    if (!isAuthenticated) { toast.info("Sign in to create a collection in your workspace."); return; }
    if (!collectionName.trim()) { toast.error("Name your collection first."); return; }
    try {
      const collection = await createCollection.mutateAsync({ name: collectionName.trim(), description: selectedIds.length ? `${selectedIds.length} selected clips from Framefind.` : undefined, accent: "violet" });
      await Promise.all(selectedIds.filter(id => id > 0).map(clipId => addClip.mutateAsync({ collectionId: collection.id, clipId })));
      await refreshWorkspace();
      setCollectionName("");
      setCollectionOpen(false);
      toast.success(selectedIds.length ? `${selectedIds.length} clips saved to ${collection.name}.` : `${collection.name} is ready for footage.`);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not create the collection."); }
  };

  return (
    <div className="app-glow min-h-screen overflow-x-hidden">
      <input ref={inputRef} type="file" accept="video/*" multiple className="hidden" onChange={event => processFiles(Array.from(event.target.files ?? []))} />
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[224px] border-r border-white/[0.07] bg-[#101016]/80 px-4 py-6 backdrop-blur-xl lg:flex lg:flex-col">
        <div className="flex items-center gap-3 px-2"><div className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-fuchsia-300 via-violet-400 to-indigo-500 text-[#15111d] shadow-[0_0_32px_rgba(198,143,255,.3)]"><Clapperboard className="size-4" /></div><div><p className="text-[15px] font-semibold tracking-[-.03em]">framefind</p><p className="font-mono text-[9px] uppercase tracking-[.18em] text-muted-foreground">creative retrieval</p></div></div>
        <nav className="mt-10 space-y-1">
          <button className="flex h-10 w-full items-center gap-3 rounded-xl bg-white/[0.08] px-3 text-sm font-medium text-white"><Grid2X2 className="size-4 text-fuchsia-300" />Library <span className="ml-auto font-mono text-[10px] text-muted-foreground">{baseClips.length}</span></button>
          <button onClick={() => { setCollectionOpen(true); setCollectionName(""); }} className="flex h-10 w-full items-center gap-3 rounded-xl px-3 text-sm text-muted-foreground transition-colors hover:bg-white/[0.05] hover:text-white"><Layers3 className="size-4" />Collections <span className="ml-auto font-mono text-[10px]">{collections.length}</span></button>
          <button onClick={() => document.getElementById("ask-footage")?.scrollIntoView({ behavior: "smooth" })} className="flex h-10 w-full items-center gap-3 rounded-xl px-3 text-sm text-muted-foreground transition-colors hover:bg-white/[0.05] hover:text-white"><MessageCirclePlus className="size-4" />Ask my footage</button>
        </nav>
        <div className="mt-auto rounded-2xl border border-white/[0.09] bg-white/[0.035] p-3.5"><div className="flex items-center gap-2 text-[11px] font-medium text-white"><Sparkles className="size-3.5 text-amber-200" />Not an AI editor</div><p className="mt-2 text-[11px] leading-5 text-muted-foreground">Explore what you have before deciding what to make.</p><button onClick={() => toast.info("The inspiration view will be the next creative surface in this prototype.")} className="mt-3 text-[11px] font-medium text-fuchsia-200 hover:text-white">How Framefind works <ArrowUpRight className="ml-1 inline size-3" /></button></div>
      </aside>

      <main className="lg:ml-[224px]">
        <header className="sticky top-0 z-20 border-b border-white/[0.07] bg-[#111118]/72 px-4 py-3 backdrop-blur-xl sm:px-7 lg:px-10"><div className="mx-auto flex max-w-[1560px] items-center gap-3"><button className="grid size-9 place-items-center rounded-xl border border-white/[0.09] bg-white/[0.04] lg:hidden"><Clapperboard className="size-4 text-fuchsia-300" /></button><div className="relative max-w-2xl flex-1"><Search className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={searchQuery} onChange={event => { setSearchQuery(event.target.value); setShowSimilar(false); }} placeholder="Search your footage — “quiet blue night shots”" className="h-11 rounded-xl border-white/[0.09] bg-white/[0.045] pl-11 pr-10 text-sm placeholder:text-muted-foreground focus-visible:ring-fuchsia-300/70" /><span className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded-md border border-white/[0.08] bg-white/[0.04] px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground sm:block">⌘ K</span></div><div className="ml-auto flex items-center gap-2"><Button onClick={() => setUploadOpen(true)} className="h-10 rounded-xl bg-[#e9d6ff] px-3 text-xs font-semibold text-[#21142f] hover:bg-white sm:px-4"><UploadCloud className="mr-1.5 size-4" /> <span className="hidden sm:inline">Add footage</span></Button>{!loading && (isAuthenticated ? <button onClick={logout} className="ml-1"><Avatar className="size-9 border border-white/15"><AvatarFallback className="bg-[#2a2232] text-xs text-fuchsia-100">{user?.name?.[0]?.toUpperCase() ?? "U"}</AvatarFallback></Avatar></button> : <Button onClick={() => startLogin()} variant="ghost" className="h-10 rounded-xl text-xs text-muted-foreground hover:bg-white/[0.05] hover:text-white">Sign in</Button>)}</div></div></header>

        <div className="mx-auto max-w-[1560px] px-4 pb-12 pt-8 sm:px-7 lg:px-10">
          <section className="reveal grid gap-7 xl:grid-cols-[minmax(0,1fr)_290px]">
            <div>
              <div className="mb-7 flex flex-wrap items-end justify-between gap-4"><div><p className="font-mono text-[10px] uppercase tracking-[.2em] text-fuchsia-200/80">{isSample ? "Sample workspace" : "Your footage library"}</p><h1 className="mt-1.5 text-3xl font-medium tracking-[-.05em] sm:text-4xl">Make sense of the <span className="font-editorial italic font-normal text-fuchsia-200">in-between.</span></h1><p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">{isSample ? "Explore a small sample library, then sign in to analyze your own clips." : "Search by what you remember — not the file name you forgot."}</p></div><div className="flex items-center gap-2"><span className="font-mono text-[10px] uppercase tracking-[.14em] text-muted-foreground">{visibleClips.length} clips</span>{selectedIds.length > 0 && <Button onClick={() => setCollectionOpen(true)} variant="outline" className="h-9 rounded-lg border-fuchsia-300/25 bg-fuchsia-300/10 px-3 text-xs text-fuchsia-100 hover:bg-fuchsia-300/20"><FolderPlus className="mr-1.5 size-3.5" />Collect {selectedIds.length}</Button>}</div></div>
              <div className="mb-6 flex items-center gap-2 overflow-x-auto pb-1">{filters.map(filter => <button key={filter} onClick={() => setActiveFilter(filter)} className={cn("shrink-0 rounded-full border px-3.5 py-1.5 text-xs transition-colors", activeFilter === filter ? "border-fuchsia-300/45 bg-fuchsia-300/14 text-fuchsia-100" : "border-white/[0.08] bg-white/[0.025] text-muted-foreground hover:border-white/20 hover:text-white")}>{filter}</button>)}{(searchQuery || showSimilar) && <button onClick={() => { setSearchQuery(""); setShowSimilar(false); setActiveFilter("All footage"); }} className="ml-1 flex shrink-0 items-center gap-1 text-xs text-muted-foreground hover:text-white"><X className="size-3" />Clear</button>}</div>
              {showSimilar && <div className="mb-5 flex flex-wrap items-center gap-2 rounded-xl border border-fuchsia-300/20 bg-fuchsia-300/[0.07] px-3 py-2.5"><WandSparkles className="size-3.5 text-fuchsia-200" /><span className="mr-1 text-xs text-fuchsia-100">Similar to <b>{focusedClip?.fileName}</b></span>{(["all", "color", "lighting", "mood", "composition", "motion"] as const).map(dimension => <button key={dimension} onClick={() => setSimilarDimension(dimension)} className={cn("rounded-md px-2 py-1 text-[11px] capitalize", similarDimension === dimension ? "bg-white/15 text-white" : "text-fuchsia-100/70 hover:text-white")}>{dimension}</button>)}</div>}
              {!showSimilar && searchQuery.trim().length > 1 && <div className="mb-5 flex items-center gap-2 rounded-xl border border-cyan-200/15 bg-cyan-200/[0.055] px-3 py-2.5 text-xs text-cyan-50"><Search className="size-3.5 shrink-0 text-cyan-200" /><span><b>{visibleClips.length} matches</b> surfaced from visual metadata for “{searchQuery.trim()}”. Each card shows the matching cues.</span></div>}
              <div className="grid gap-4 min-[520px]:grid-cols-2 2xl:grid-cols-3">
                {library.isLoading ? Array.from({ length: 6 }).map((_, index) => <div key={index} className="h-[252px] animate-pulse rounded-2xl bg-white/[0.05]" />) : visibleClips.map((clip, index) => <ClipCard key={clip.id} clip={clip} index={index} selected={selectedIds.includes(clip.id)} focused={focusedClip?.id === clip.id} matchReasons={showSimilar ? [] : matchReasons(clip, searchQuery)} onFocus={() => focusClip(clip)} onToggle={() => toggleSelection(clip.id)} />)}
              </div>
              {!visibleClips.length && <div className="glass-panel mt-4 rounded-2xl px-6 py-14 text-center"><Archive className="mx-auto size-6 text-muted-foreground" /><p className="mt-3 text-sm font-medium">No footage surfaced yet.</p><p className="mt-1 text-xs text-muted-foreground">Try a mood, colour, subject, time of day, or a simpler phrase.</p></div>}
            </div>

            <aside className="space-y-5 xl:pt-7">
              {focusedClip && <div className="glass-panel reveal rounded-2xl p-4"><div className={cn("film-grain relative aspect-[16/10] overflow-hidden rounded-xl bg-gradient-to-br", gradients[Math.abs(focusedClip.id) % gradients.length])}>{(focusedClip.thumbnailUrl ?? demoImages[focusedClip.id]) && <img src={focusedClip.thumbnailUrl ?? demoImages[focusedClip.id]} alt="" className="h-full w-full object-cover" />}<div className="absolute inset-x-3 bottom-3 flex items-center justify-between"><span className="rounded-md bg-black/40 px-1.5 py-1 font-mono text-[9px] text-white backdrop-blur">{formatDuration(focusedClip.durationMs)}</span><button onClick={() => setShowSimilar(true)} className="rounded-md bg-white/15 px-2 py-1 text-[10px] text-white backdrop-blur hover:bg-white/25">Find similar</button></div></div><div className="mt-4 flex items-start justify-between gap-2"><div><p className="font-mono text-[10px] text-muted-foreground">IN FOCUS</p><p className="mt-1 text-sm font-semibold">{focusedClip.fileName}</p></div><button onClick={() => toggleSelection(focusedClip.id)} className={cn("grid size-7 place-items-center rounded-lg border", selectedIds.includes(focusedClip.id) ? "border-fuchsia-300 bg-fuchsia-300 text-[#2a1535]" : "border-white/10 text-muted-foreground hover:text-white")}><Check className="size-3.5" /></button></div><p className="mt-3 text-xs leading-5 text-muted-foreground">{focusedClip.description}</p><div className="mt-4 flex flex-wrap gap-1.5">{[...focusedClip.mood, focusedClip.shotType, ...focusedClip.colors.slice(0, 1)].map(tag => <span key={tag} className="rounded-md border border-white/[0.09] bg-white/[0.045] px-1.5 py-1 text-[10px] text-[#ded1e8]">{tag}</span>)}</div></div>}
              <div><div className="mb-2 flex items-center justify-between"><p className="font-mono text-[10px] uppercase tracking-[.18em] text-muted-foreground">Collections</p><button onClick={() => setCollectionOpen(true)} className="grid size-6 place-items-center rounded-md text-muted-foreground hover:bg-white/5 hover:text-white"><Plus className="size-3.5" /></button></div><div className="space-y-2">{[...collections, ...suggestedCollections].slice(0, 4).map((collection: any, index) => <button key={collection.id} onClick={() => toast.info(collection.isAiSuggested ? `Framefind grouped ${collection.clipCount} clips around “${collection.name}”.` : isSample ? "Sign in to make this collection your own." : "Collection detail view is coming next.")} className="group flex w-full items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.025] p-2.5 text-left transition-colors hover:bg-white/[0.06]"><div className={cn("grid size-9 place-items-center rounded-lg", ["bg-violet-400/15 text-violet-200", "bg-amber-300/15 text-amber-100", "bg-lime-300/15 text-lime-100"][index % 3])}><Layers3 className="size-4" /></div><div className="min-w-0"><p className="truncate text-xs font-medium text-[#eee7f3]">{collection.name}</p><p className="mt-0.5 truncate text-[10px] text-muted-foreground">{collection.clipCount ?? 0} clips · {collection.isAiSuggested ? "AI suggested" : "Manual"}</p></div><ChevronDown className="ml-auto size-3 -rotate-90 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" /></button>)}</div></div>
              <div className="rounded-2xl border border-amber-100/[0.12] bg-gradient-to-br from-amber-200/[0.08] to-transparent p-4"><p className="font-mono text-[10px] uppercase tracking-[.16em] text-amber-100/70">Library signal</p><p className="mt-2 text-sm font-medium leading-5">Your footage leans toward <span className="text-amber-100">night-time intimacy.</span></p><p className="mt-2 text-[11px] leading-5 text-muted-foreground">Try pairing a wide establishing view with two close details for a more varied opening.</p></div>
            </aside>
          </section>

          {uploadJobs.length > 0 && <section className="mt-8 max-w-3xl rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4"><div className="mb-3 flex items-center justify-between"><p className="text-xs font-medium">Upload activity</p><button onClick={() => setUploadJobs(current => current.filter(job => job.state !== "ready"))} className="text-[11px] text-muted-foreground hover:text-white">Clear complete</button></div><div className="space-y-3">{uploadJobs.map(job => <div key={job.id} className="flex items-center gap-3"><div className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-lg bg-white/[0.06]">{job.previewUrl ? <video src={job.previewUrl} muted className="h-full w-full object-cover" /> : <Film className="size-4 text-muted-foreground" />}</div><div className="min-w-0 flex-1"><div className="mb-1 flex justify-between gap-2"><p className="truncate text-xs text-[#e8deed]">{job.fileName}</p><span className={cn("font-mono text-[9px] uppercase", job.state === "failed" ? "text-red-300" : job.state === "ready" ? "text-emerald-200" : "text-fuchsia-200")}>{job.state === "failed" ? "failed" : job.state === "ready" ? "ready" : `${job.progress}%`}</span></div><Progress value={job.progress} className="h-1 bg-white/[0.08]" /><p className="mt-1 text-[10px] text-muted-foreground">{job.error ?? (job.state === "sampling" ? "Sampling a representative frame" : job.state === "analyzing" ? "Reading visual metadata with AI" : job.state === "uploading" ? "Saving encrypted media to your workspace" : "Structured metadata ready")}</p></div></div>)}</div></section>}

          <section id="ask-footage" className="reveal mt-12 grid gap-5 lg:grid-cols-[.82fr_1.18fr]"><div className="glass-panel rounded-2xl p-6"><p className="font-mono text-[10px] uppercase tracking-[.2em] text-fuchsia-200">Ask my footage</p><h2 className="mt-3 text-3xl leading-[.95] tracking-[-.05em]">A creative thought<br /><span className="font-editorial italic font-normal text-fuchsia-200">partner, not a director.</span></h2><p className="mt-5 max-w-sm text-sm leading-6 text-muted-foreground">Choose material above, then ask about a visual opening, missing coverage, pacing, or possible montage direction.</p><div className="mt-7 flex items-center gap-3 border-t border-white/[0.08] pt-4"><div className="grid size-9 place-items-center rounded-lg bg-fuchsia-300/10 text-fuchsia-200"><ImagePlus className="size-4" /></div><p className="text-xs leading-5 text-muted-foreground"><span className="font-semibold text-white">{selectedIds.length} selected</span><br />Selection becomes your creative context.</p></div></div><AIChatBox messages={chatMessages} onSendMessage={handleAsk} isLoading={askFootage.isPending} height="380px" className="glass-panel overflow-hidden border-white/[0.09] shadow-none" placeholder="Ask about this selection…" emptyStateMessage="Start with the footage you have selected." suggestedPrompts={["What could make a strong opening?", "What visual rhythm does this suggest?", "What am I missing for a 30-second montage?"]} /></section>
        </div>
      </main>

      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}><DialogContent className="border-white/[0.1] bg-[#1a1720] text-white sm:max-w-xl"><DialogHeader><DialogTitle className="text-xl tracking-[-.03em]">Bring in a moment.</DialogTitle><DialogDescription className="text-muted-foreground">Framefind samples one representative frame, writes structured visual metadata, then securely saves the original clip.</DialogDescription></DialogHeader><button onClick={() => inputRef.current?.click()} onDragOver={event => { event.preventDefault(); setIsDragging(true); }} onDragLeave={() => setIsDragging(false)} onDrop={event => { event.preventDefault(); setIsDragging(false); processFiles(Array.from(event.dataTransfer.files)); }} className={cn("pressable mt-3 grid min-h-52 w-full place-items-center rounded-2xl border border-dashed p-6 text-center transition-colors", isDragging ? "border-fuchsia-100 bg-fuchsia-200/[0.16]" : "border-fuchsia-200/30 bg-fuchsia-300/[0.06] hover:bg-fuchsia-300/[0.10]")}><div><div className="mx-auto grid size-11 place-items-center rounded-xl bg-fuchsia-200 text-[#25142e]"><UploadCloud className="size-5" /></div><p className="mt-4 text-sm font-semibold">{isDragging ? "Release to analyze these clips" : "Drop clips here, or browse files"}</p><p className="mt-1 text-xs text-muted-foreground">Multiple videos · 50 MB per clip in this prototype</p></div></button><p className="text-center text-[10px] leading-5 text-muted-foreground">Files are only analyzed after you sign in and choose them. A single representative frame is used to generate metadata.</p></DialogContent></Dialog>
      <Dialog open={collectionOpen} onOpenChange={setCollectionOpen}><DialogContent className="border-white/[0.1] bg-[#1a1720] text-white sm:max-w-md"><DialogHeader><DialogTitle className="text-xl tracking-[-.03em]">Save a collection</DialogTitle><DialogDescription className="text-muted-foreground">Collections help a possible edit begin to take shape.</DialogDescription></DialogHeader><div className="mt-2 space-y-3"><div><Label htmlFor="collection-name" className="text-xs text-muted-foreground">Name</Label><Input id="collection-name" value={collectionName} onChange={event => setCollectionName(event.target.value)} onKeyDown={event => event.key === "Enter" && createCollectionFromSelection()} placeholder="e.g. Tokyo after dark" className="mt-2 border-white/[0.1] bg-white/[0.05]" /></div><p className="text-[11px] text-muted-foreground">{selectedIds.length ? `${selectedIds.length} selected clips will be added after creating the collection.` : "Create an empty collection now and add clips later."}</p><Button onClick={createCollectionFromSelection} disabled={createCollection.isPending || addClip.isPending} className="w-full rounded-xl bg-[#e9d6ff] text-[#21142f] hover:bg-white">{createCollection.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <FolderPlus className="mr-2 size-4" />}Create collection</Button></div></DialogContent></Dialog>
    </div>
  );
}

function ClipCard({ clip, index, selected, focused, matchReasons: reasons, onFocus, onToggle }: { clip: Clip; index: number; selected: boolean; focused: boolean; matchReasons: string[]; onFocus: () => void; onToggle: () => void }) {
  const imageUrl = clip.thumbnailUrl ?? demoImages[clip.id];
  return <article onClick={onFocus} className={cn("clip-card group overflow-hidden rounded-2xl border bg-[#191720]", focused ? "border-fuchsia-300/50" : "border-white/[0.08]")}><div className={cn("film-grain relative aspect-[16/10] bg-gradient-to-br", gradients[index % gradients.length])}>{imageUrl && <img src={imageUrl} alt="" className="h-full w-full object-cover" />}<div className="absolute inset-x-3 top-3 flex items-center justify-between"><button onClick={event => { event.stopPropagation(); onToggle(); }} className={cn("grid size-6 place-items-center rounded-md border backdrop-blur transition-colors", selected ? "border-fuchsia-200 bg-fuchsia-200 text-[#291634]" : "border-white/15 bg-black/15 text-white/75 hover:bg-black/30")}><Check className="size-3.5" /></button><div className="flex items-center gap-1.5"><span className="rounded-md bg-black/30 px-1.5 py-1 font-mono text-[9px] text-white backdrop-blur">{formatDuration(clip.durationMs)}</span><button onClick={event => { event.stopPropagation(); toast.info("Open a clip to use Find Similar or save it to a collection."); }} className="grid size-6 place-items-center rounded-md bg-black/25 text-white/80 opacity-0 backdrop-blur transition-opacity group-hover:opacity-100"><MoreHorizontal className="size-3.5" /></button></div></div><div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/35 to-transparent" /></div><div className="p-3.5"><div className="flex items-center justify-between gap-2"><p className="truncate font-mono text-[10px] text-muted-foreground">{clip.fileName}</p><span className="shrink-0 text-[9px] uppercase tracking-[.12em] text-fuchsia-200/75">{clip.time}</span></div><p className="mt-2 line-clamp-2 text-xs leading-5 text-[#e7dfea]">{clip.description}</p><div className="mt-3 flex flex-wrap gap-1.5">{[clip.mood[0], clip.shotType].filter(Boolean).map(tag => <span key={tag} className="rounded-md bg-white/[0.055] px-1.5 py-1 text-[10px] text-[#cfc0d8]">{tag}</span>)}</div>{reasons.length > 0 && <p className="mt-2 text-[10px] text-cyan-100/70">Matches: {reasons.join(" · ")}</p>}</div></article>;
}
