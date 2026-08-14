import { AIChatBox, type Message } from "@/components/AIChatBox";
import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Archive, ArrowUpRight, Check, ChevronDown, Clapperboard, Film, FolderPlus,
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
  "from-[#8eb4cc] via-[#bad0d2] to-[#f0d1a9]", "from-[#eac08a] via-[#f3dfa6] to-[#f8eece]",
  "from-[#d77f56] via-[#e6a066] to-[#f4d7ae]", "from-[#7f9ab6] via-[#b8bdcf] to-[#dbbed1]",
  "from-[#9fb982] via-[#d3d994] to-[#efe2a4]", "from-[#b28b6f] via-[#d7b89e] to-[#eedbc0]",
  "from-[#bb8fb2] via-[#e2a6b8] to-[#f0c5b6]", "from-[#7da5b4] via-[#b7cbd0] to-[#e4d6b6]",
];

const demoImages: Record<number, string> = {
  101: "/manus-storage/framefind-neon-friends_7a73187d.jpg",
  102: "/manus-storage/framefind-train-window_d21b7acd.jpg",
  103: "/manus-storage/framefind-ramen_0e83dd49.jpg",
  104: "/manus-storage/framefind-rain-street_6a24bf45.jpg",
};

const filters = ["All clips", "Night", "Warm", "Quiet", "People", "Wide", "Moving"];

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
  const [activeFilter, setActiveFilter] = useState("All clips");
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
  const filterTerm = activeFilter === "All clips" ? "" : activeFilter;
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
    if (!isAuthenticated) { toast.info("Sign in to analyze and save your footage."); return; }
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
    if (!selectedIds.length) { toast.info("Circle one or more clips first so Framefind has something to think with."); return; }
    setChatMessages(current => [...current, { role: "user", content: question }]);
    try {
      const response = await askFootage.mutateAsync({ question, clipIds: selectedIds });
      setChatMessages(current => [...current, { role: "assistant", content: response.answer }]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The creative assistant is unavailable right now.");
    }
  };

  const createCollectionFromSelection = async () => {
    if (!isAuthenticated) { toast.info("Sign in to make a collection in your sketchbook."); return; }
    if (!collectionName.trim()) { toast.error("Give this group a name first."); return; }
    try {
      const collection = await createCollection.mutateAsync({ name: collectionName.trim(), description: selectedIds.length ? `${selectedIds.length} selected clips from Framefind.` : undefined, accent: "apricot" });
      await Promise.all(selectedIds.filter(id => id > 0).map(clipId => addClip.mutateAsync({ collectionId: collection.id, clipId })));
      await refreshWorkspace();
      setCollectionName("");
      setCollectionOpen(false);
      toast.success(selectedIds.length ? `${selectedIds.length} clips tucked into ${collection.name}.` : `${collection.name} is ready for clips.`);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not create the collection."); }
  };

  return (
    <div className="app-glow min-h-screen overflow-x-hidden ink">
      <input ref={inputRef} type="file" accept="video/*" multiple className="hidden" onChange={event => processFiles(Array.from(event.target.files ?? []))} />

      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[226px] border-r-[1.5px] border-[#2c2922]/65 bg-[#fffdf7]/90 px-4 py-6 backdrop-blur lg:flex lg:flex-col">
        <div className="flex items-center gap-3 px-2">
          <div className="grid size-10 -rotate-6 place-items-center rounded-[14px] border-[1.5px] border-[#2c2922] bg-[#f4ad89] shadow-[2px_3px_0_#2c2922]"><Clapperboard className="size-4" /></div>
          <div><p className="font-hand text-2xl font-bold leading-none tracking-[-.04em]">framefind</p><p className="mt-1 font-mono text-[8px] uppercase tracking-[.18em] ink-muted">footage sketchbook</p></div>
        </div>
        <nav className="mt-10 space-y-2">
          <button className="flex h-10 w-full items-center gap-3 rounded-xl border-[1.5px] border-[#2c2922]/55 bg-[#f8d9cc] px-3 text-sm font-semibold shadow-[2px_2px_0_rgba(44,41,34,.16)]"><Grid2X2 className="size-4" />Library <span className="ml-auto font-mono text-[10px] ink-muted">{baseClips.length}</span></button>
          <button onClick={() => { setCollectionOpen(true); setCollectionName(""); }} className="flex h-10 w-full items-center gap-3 rounded-xl px-3 text-sm ink-muted transition-colors hover:bg-[#e6f1e2] hover:text-[#2c2922]"><Layers3 className="size-4" />Collections <span className="ml-auto font-mono text-[10px]">{collections.length}</span></button>
          <button onClick={() => document.getElementById("ask-footage")?.scrollIntoView({ behavior: "smooth" })} className="flex h-10 w-full items-center gap-3 rounded-xl px-3 text-sm ink-muted transition-colors hover:bg-[#e8eff7] hover:text-[#2c2922]"><MessageCirclePlus className="size-4" />Ask my footage</button>
        </nav>
        <div className="tape note-yellow mt-auto rotate-[1deg] rounded-xl border-[1.5px] border-[#2c2922]/55 p-3.5 shadow-[3px_3px_0_rgba(44,41,34,.15)]"><div className="flex items-center gap-2 text-[11px] font-semibold"><Sparkles className="size-3.5" />Little reminder</div><p className="mt-2 text-[11px] leading-5 ink-muted">This is not an AI editor. It is a place to notice what you have.</p><button onClick={() => toast.info("Find the cut hiding between your clips.")} className="mt-3 font-hand text-base font-semibold underline decoration-wavy underline-offset-4">Why this exists <ArrowUpRight className="ml-1 inline size-3" /></button></div>
      </aside>

      <main className="lg:ml-[226px]">
        <header className="sticky top-0 z-20 border-b-[1.5px] border-[#2c2922]/55 bg-[#f7f3eb]/90 px-4 py-3 backdrop-blur sm:px-7 lg:px-10">
          <div className="mx-auto flex max-w-[1560px] items-center gap-3">
            <button className="grid size-9 -rotate-3 place-items-center rounded-xl sketch-outline bg-[#f4ad89] lg:hidden"><Clapperboard className="size-4" /></button>
            <div className="relative max-w-2xl flex-1"><Search className="absolute left-4 top-1/2 size-4 -translate-y-1/2 ink-muted" /><Input value={searchQuery} onChange={event => { setSearchQuery(event.target.value); setShowSimilar(false); }} placeholder="Search a memory — “quiet blue night shots”" className="h-11 rounded-xl border-[1.5px] border-[#2c2922]/55 bg-[#fffdf7] pl-11 pr-10 text-sm shadow-[2px_2px_0_rgba(44,41,34,.1)] placeholder:text-[#756c60] focus-visible:ring-[#e69275]" /><span className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded-md border border-[#2c2922]/25 bg-[#f2ecdf] px-1.5 py-0.5 font-mono text-[9px] ink-muted sm:block">⌘ K</span></div>
            <div className="ml-auto flex items-center gap-2"><Button onClick={() => setUploadOpen(true)} className="h-10 -rotate-1 rounded-xl border-[1.5px] border-[#2c2922] bg-[#f4ad89] px-3 text-xs font-bold text-[#2c2922] shadow-[2px_2px_0_#2c2922] hover:bg-[#fac7ae] sm:px-4"><UploadCloud className="mr-1.5 size-4" /><span className="hidden sm:inline">Add footage</span></Button>{!loading && (isAuthenticated ? <button onClick={logout} className="ml-1"><Avatar className="size-9 border-[1.5px] border-[#2c2922]/70"><AvatarFallback className="bg-[#dcefdc] text-xs font-bold text-[#2c2922]">{user?.name?.[0]?.toUpperCase() ?? "U"}</AvatarFallback></Avatar></button> : <Button onClick={() => startLogin()} variant="ghost" className="h-10 rounded-xl text-xs ink-muted hover:bg-[#fffdf7] hover:text-[#2c2922]">Sign in</Button>)}</div>
          </div>
        </header>

        <div className="mx-auto max-w-[1560px] px-4 pb-12 pt-8 sm:px-7 lg:px-10">
          <section className="reveal grid gap-7 xl:grid-cols-[minmax(0,1fr)_300px]">
            <div>
              <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
                <div><p className="font-mono text-[10px] uppercase tracking-[.2em] ink-muted">{isSample ? "Sample sketchbook" : "Your footage sketchbook"}</p><h1 className="mt-1 font-hand text-[43px] font-bold leading-none tracking-[-.045em] sm:text-[54px]">Make sense of the <span className="scribble">in-between.</span></h1><p className="mt-3 max-w-xl text-sm leading-6 ink-muted">{isSample ? "A small sample library to explore before your own clips arrive." : "Search by the feeling, colour, place, or motion you remember."}</p></div>
                <div className="flex items-center gap-2"><span className="rotate-1 rounded-md bg-[#e8eff7] px-2 py-1 font-mono text-[10px] uppercase tracking-[.14em] ink-muted">{visibleClips.length} clips</span>{selectedIds.length > 0 && <Button onClick={() => setCollectionOpen(true)} variant="outline" className="h-9 rounded-lg border-[1.5px] border-[#2c2922]/55 bg-[#dcefdc] px-3 text-xs font-semibold text-[#2c2922] hover:bg-[#c9e8c9]"><FolderPlus className="mr-1.5 size-3.5" />Collect {selectedIds.length}</Button>}</div>
              </div>
              <div className="mb-6 flex items-center gap-2 overflow-x-auto pb-1">{filters.map(filter => <button key={filter} onClick={() => setActiveFilter(filter)} className={cn("shrink-0 rounded-full border-[1.5px] px-3.5 py-1.5 text-xs transition-colors", activeFilter === filter ? "border-[#2c2922] bg-[#f8d9cc] font-semibold text-[#2c2922] shadow-[1px_1px_0_#2c2922]" : "border-[#2c2922]/35 bg-[#fffdf7]/75 ink-muted hover:bg-[#e8eff7] hover:text-[#2c2922]")}>{filter}</button>)}{(searchQuery || showSimilar) && <button onClick={() => { setSearchQuery(""); setShowSimilar(false); setActiveFilter("All clips"); }} className="ml-1 flex shrink-0 items-center gap-1 text-xs ink-muted hover:text-[#2c2922]"><X className="size-3" />Clear</button>}</div>
              {showSimilar && <div className="note-blue mb-5 flex flex-wrap items-center gap-2 rounded-xl border-[1.5px] border-[#2c2922]/48 px-3 py-2.5 shadow-[2px_2px_0_rgba(44,41,34,.12)]"><WandSparkles className="size-3.5" /><span className="mr-1 text-xs">Sketching connections to <b>{focusedClip?.fileName}</b></span>{(["all", "color", "lighting", "mood", "composition", "motion"] as const).map(dimension => <button key={dimension} onClick={() => setSimilarDimension(dimension)} className={cn("rounded-md px-2 py-1 text-[11px] capitalize", similarDimension === dimension ? "bg-white/80 font-semibold shadow-[1px_1px_0_rgba(44,41,34,.2)]" : "ink-muted hover:text-[#2c2922]")}>{dimension}</button>)}</div>}
              {!showSimilar && searchQuery.trim().length > 1 && <div className="note-green mb-5 flex items-center gap-2 rounded-xl border-[1.5px] border-[#2c2922]/48 px-3 py-2.5 text-xs shadow-[2px_2px_0_rgba(44,41,34,.12)]"><Search className="size-3.5 shrink-0" /><span><b>{visibleClips.length} matches</b> for “{searchQuery.trim()}”. Small notes on each card show why.</span></div>}
              <div className="grid gap-4 min-[520px]:grid-cols-2 2xl:grid-cols-3">
                {library.isLoading ? Array.from({ length: 6 }).map((_, index) => <div key={index} className="h-[252px] animate-pulse rounded-2xl border border-[#2c2922]/30 bg-[#fffdf7]/80" />) : visibleClips.map((clip, index) => <ClipCard key={clip.id} clip={clip} index={index} selected={selectedIds.includes(clip.id)} focused={focusedClip?.id === clip.id} matchReasons={showSimilar ? [] : matchReasons(clip, searchQuery)} onFocus={() => focusClip(clip)} onToggle={() => toggleSelection(clip.id)} />)}
              </div>
              {!visibleClips.length && <div className="paper-panel mt-4 rounded-2xl px-6 py-14 text-center"><Archive className="mx-auto size-6 ink-muted" /><p className="mt-3 text-sm font-semibold">Nothing surfaced just yet.</p><p className="mt-1 text-xs ink-muted">Try a mood, colour, subject, time of day, or a simpler phrase.</p></div>}
            </div>

            <aside className="space-y-5 xl:pt-7">
              {focusedClip && <div className="tape note-yellow reveal rounded-2xl border-[1.5px] border-[#2c2922]/58 p-4 shadow-[3px_3px_0_rgba(44,41,34,.14)]"><div className={cn("relative aspect-[16/10] overflow-hidden rounded-xl border-[1.5px] border-[#2c2922]/55 bg-gradient-to-br", gradients[Math.abs(focusedClip.id) % gradients.length])}>{(focusedClip.thumbnailUrl ?? demoImages[focusedClip.id]) && <img src={focusedClip.thumbnailUrl ?? demoImages[focusedClip.id]} alt="" className="h-full w-full object-cover" />}<div className="absolute inset-x-3 bottom-3 flex items-center justify-between"><span className="rounded-md bg-[#fffdf7]/90 px-1.5 py-1 font-mono text-[9px] shadow-sm">{formatDuration(focusedClip.durationMs)}</span><button onClick={() => setShowSimilar(true)} className="rounded-md border border-[#2c2922]/55 bg-[#fffdf7]/90 px-2 py-1 text-[10px] font-semibold shadow-sm hover:bg-white">Find similar</button></div></div><div className="mt-4 flex items-start justify-between gap-2"><div><p className="font-mono text-[10px] ink-muted">CLIP IN HAND</p><p className="mt-1 text-sm font-bold">{focusedClip.fileName}</p></div><button onClick={() => toggleSelection(focusedClip.id)} className={cn("grid size-7 place-items-center rounded-lg border-[1.5px]", selectedIds.includes(focusedClip.id) ? "border-[#2c2922] bg-[#f4ad89]" : "border-[#2c2922]/45 bg-[#fffdf7] ink-muted hover:text-[#2c2922]")}><Check className="size-3.5" /></button></div><p className="mt-3 text-xs leading-5 ink-muted">{focusedClip.description}</p><div className="mt-4 flex flex-wrap gap-1.5">{[...focusedClip.mood, focusedClip.shotType, ...focusedClip.colors.slice(0, 1)].map(tag => <span key={tag} className="rounded-md border border-[#2c2922]/25 bg-[#fffdf7]/65 px-1.5 py-1 text-[10px]">{tag}</span>)}</div></div>}
              <div><div className="mb-2 flex items-center justify-between"><p className="font-hand text-xl font-bold">Collections</p><button onClick={() => setCollectionOpen(true)} className="grid size-7 -rotate-3 place-items-center rounded-lg border-[1.5px] border-[#2c2922]/55 bg-[#dcefdc] shadow-[1px_1px_0_rgba(44,41,34,.14)] hover:bg-[#c9e8c9]"><Plus className="size-3.5" /></button></div><div className="space-y-2">{[...collections, ...suggestedCollections].slice(0, 4).map((collection: any, index) => <button key={collection.id} onClick={() => toast.info(collection.isAiSuggested ? `Framefind sketched ${collection.clipCount} clips around “${collection.name}”.` : isSample ? "Sign in to make this collection your own." : "Collection detail view is coming next.")} className="sketch-card group flex w-full items-center gap-3 rounded-xl border-[1.5px] border-[#2c2922]/43 bg-[#fffdf7]/85 p-2.5 text-left hover:bg-[#fffdf7]"><div className={cn("grid size-9 place-items-center rounded-lg border border-[#2c2922]/28", ["bg-[#e8eff7]", "bg-[#fff1ba]", "bg-[#dcefdc]"][index % 3])}><Layers3 className="size-4" /></div><div className="min-w-0"><p className="truncate text-xs font-bold">{collection.name}</p><p className="mt-0.5 truncate text-[10px] ink-muted">{collection.clipCount ?? 0} clips · {collection.isAiSuggested ? "AI sketched" : "Manual"}</p></div><ChevronDown className="ml-auto size-3 -rotate-90 ink-muted opacity-0 transition-opacity group-hover:opacity-100" /></button>)}</div></div>
              <div className="note-pink rotate-[.6deg] rounded-2xl border-[1.5px] border-[#2c2922]/48 p-4 shadow-[2px_2px_0_rgba(44,41,34,.12)]"><p className="font-hand text-xl font-bold">A tiny prompt</p><p className="mt-1 text-sm font-semibold leading-5">Your library leans toward <span className="scribble">night-time intimacy.</span></p><p className="mt-2 text-[11px] leading-5 ink-muted">Pair one wide view with two close details to give a small opening more room to breathe.</p></div>
            </aside>
          </section>

          {uploadJobs.length > 0 && <section className="paper-panel mt-8 max-w-3xl rounded-2xl p-4"><div className="mb-3 flex items-center justify-between"><p className="font-hand text-xl font-bold">Upload desk</p><button onClick={() => setUploadJobs(current => current.filter(job => job.state !== "ready"))} className="text-[11px] ink-muted underline decoration-wavy underline-offset-4 hover:text-[#2c2922]">Clear finished</button></div><div className="space-y-3">{uploadJobs.map(job => <div key={job.id} className="flex items-center gap-3"><div className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-lg border border-[#2c2922]/35 bg-[#e8eff7]">{job.previewUrl ? <video src={job.previewUrl} muted className="h-full w-full object-cover" /> : <Film className="size-4 ink-muted" />}</div><div className="min-w-0 flex-1"><div className="mb-1 flex justify-between gap-2"><p className="truncate text-xs font-semibold">{job.fileName}</p><span className={cn("font-mono text-[9px] uppercase", job.state === "failed" ? "text-red-700" : job.state === "ready" ? "text-emerald-700" : "text-orange-700")}>{job.state === "failed" ? "failed" : job.state === "ready" ? "ready" : `${job.progress}%`}</span></div><Progress value={job.progress} className="h-1 bg-[#ded6c8]" /><p className="mt-1 text-[10px] ink-muted">{job.error ?? (job.state === "sampling" ? "Finding a representative frame" : job.state === "analyzing" ? "Writing visual notes with AI" : job.state === "uploading" ? "Placing the original safely in your workspace" : "Visual notes are ready")}</p></div></div>)}</div></section>}

          <section id="ask-footage" className="reveal mt-12 grid gap-5 lg:grid-cols-[.82fr_1.18fr]">
            <div className="tape note-blue rounded-2xl border-[1.5px] border-[#2c2922]/58 p-6 shadow-[3px_3px_0_rgba(44,41,34,.14)]"><p className="font-mono text-[10px] uppercase tracking-[.2em] ink-muted">Ask my footage</p><h2 className="mt-3 font-hand text-4xl font-bold leading-[.9]">A creative thought<br /><span className="scribble">partner, not a director.</span></h2><p className="mt-5 max-w-sm text-sm leading-6 ink-muted">Circle material above, then ask about an opening, missing coverage, pacing, or a possible montage direction.</p><div className="mt-7 flex items-center gap-3 border-t border-[#2c2922]/25 pt-4"><div className="grid size-9 -rotate-3 place-items-center rounded-lg border border-[#2c2922]/36 bg-[#fffdf7]"><ImagePlus className="size-4" /></div><p className="text-xs leading-5 ink-muted"><span className="font-bold text-[#2c2922]">{selectedIds.length} circled</span><br />This little group becomes the context.</p></div></div>
            <AIChatBox messages={chatMessages} onSendMessage={handleAsk} isLoading={askFootage.isPending} height="380px" className="paper-panel overflow-hidden border-[#2c2922]/58 bg-[#fffdf7] shadow-[3px_3px_0_rgba(44,41,34,.14)]" placeholder="Ask about these circled clips…" emptyStateMessage="Start with the clips you have circled." suggestedPrompts={["What could make a strong opening?", "What visual rhythm does this suggest?", "What am I missing for a 30-second montage?"]} />
          </section>
        </div>
      </main>

      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}><DialogContent className="border-[1.5px] border-[#2c2922] bg-[#fffdf7] text-[#2c2922] shadow-[4px_4px_0_#2c2922] sm:max-w-xl"><DialogHeader><DialogTitle className="font-hand text-3xl font-bold">Bring in a moment.</DialogTitle><DialogDescription className="ink-muted">Framefind finds one representative frame, writes visual notes, then stores the original clip in your workspace.</DialogDescription></DialogHeader><button onClick={() => inputRef.current?.click()} onDragOver={event => { event.preventDefault(); setIsDragging(true); }} onDragLeave={() => setIsDragging(false)} onDrop={event => { event.preventDefault(); setIsDragging(false); processFiles(Array.from(event.dataTransfer.files)); }} className={cn("pressable mt-3 grid min-h-52 w-full place-items-center rounded-2xl border-[1.5px] border-dashed border-[#2c2922]/55 p-6 text-center transition-colors", isDragging ? "bg-[#f8d9cc]" : "bg-[#e8eff7] hover:bg-[#dcefdc]")}><div><div className="mx-auto grid size-11 -rotate-3 place-items-center rounded-xl border-[1.5px] border-[#2c2922] bg-[#f4ad89] shadow-[2px_2px_0_#2c2922]"><UploadCloud className="size-5" /></div><p className="mt-4 font-hand text-2xl font-bold">{isDragging ? "Release to make some notes" : "Drop clips here, or browse files"}</p><p className="mt-1 text-xs ink-muted">Multiple videos · 50 MB per clip in this prototype</p></div></button><p className="text-center text-[10px] leading-5 ink-muted">Files are analyzed only after you sign in and choose them. One representative frame is used to create the first visual notes.</p></DialogContent></Dialog>
      <Dialog open={collectionOpen} onOpenChange={setCollectionOpen}><DialogContent className="border-[1.5px] border-[#2c2922] bg-[#fffdf7] text-[#2c2922] shadow-[4px_4px_0_#2c2922] sm:max-w-md"><DialogHeader><DialogTitle className="font-hand text-3xl font-bold">Make a little collection</DialogTitle><DialogDescription className="ink-muted">Collections are where a possible edit begins to take shape.</DialogDescription></DialogHeader><div className="mt-2 space-y-3"><div><Label htmlFor="collection-name" className="text-xs ink-muted">Name</Label><Input id="collection-name" value={collectionName} onChange={event => setCollectionName(event.target.value)} onKeyDown={event => event.key === "Enter" && createCollectionFromSelection()} placeholder="e.g. Tokyo after dark" className="mt-2 border-[1.5px] border-[#2c2922]/55 bg-[#fffdf7]" /></div><p className="text-[11px] ink-muted">{selectedIds.length ? `${selectedIds.length} circled clips will go inside.` : "Make an empty collection now and tuck clips in later."}</p><Button onClick={createCollectionFromSelection} disabled={createCollection.isPending || addClip.isPending} className="w-full -rotate-[.3deg] rounded-xl border-[1.5px] border-[#2c2922] bg-[#f4ad89] font-bold text-[#2c2922] shadow-[2px_2px_0_#2c2922] hover:bg-[#fac7ae]">{createCollection.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <FolderPlus className="mr-2 size-4" />}Make collection</Button></div></DialogContent></Dialog>
    </div>
  );
}

function ClipCard({ clip, index, selected, focused, matchReasons: reasons, onFocus, onToggle }: { clip: Clip; index: number; selected: boolean; focused: boolean; matchReasons: string[]; onFocus: () => void; onToggle: () => void }) {
  const imageUrl = clip.thumbnailUrl ?? demoImages[clip.id];
  return <article onClick={onFocus} className={cn("sketch-card group overflow-hidden rounded-2xl border-[1.5px] bg-[#fffdf7]", focused ? "border-[#2c2922]" : "border-[#2c2922]/50")}><div className={cn("relative aspect-[16/10] overflow-hidden border-b-[1.5px] border-[#2c2922]/45 bg-gradient-to-br", gradients[index % gradients.length])}>{imageUrl && <img src={imageUrl} alt="" className="h-full w-full object-cover" />}<div className="absolute inset-x-3 top-3 flex items-center justify-between"><button onClick={event => { event.stopPropagation(); onToggle(); }} className={cn("grid size-6 place-items-center rounded-full border-[1.5px] shadow-sm transition-colors", selected ? "border-[#2c2922] bg-[#f4ad89]" : "border-[#2c2922]/50 bg-[#fffdf7]/90 hover:bg-[#dcefdc]")}><Check className="size-3.5" /></button><div className="flex items-center gap-1.5"><span className="rounded-md bg-[#fffdf7]/90 px-1.5 py-1 font-mono text-[9px] shadow-sm">{formatDuration(clip.durationMs)}</span><button onClick={event => { event.stopPropagation(); toast.info("Pick a clip to see its notes or find similar material."); }} className="grid size-6 place-items-center rounded-md border border-[#2c2922]/35 bg-[#fffdf7]/90 opacity-0 shadow-sm transition-opacity group-hover:opacity-100"><MoreHorizontal className="size-3.5" /></button></div></div><div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-black/15 to-transparent" /></div><div className="p-3.5"><div className="flex items-center justify-between gap-2"><p className="truncate font-mono text-[10px] ink-muted">{clip.fileName}</p><span className="shrink-0 rotate-1 rounded bg-[#e8eff7] px-1 text-[9px] uppercase tracking-[.12em] ink-muted">{clip.time}</span></div><p className="mt-2 line-clamp-2 text-xs leading-5 text-[#37332c]">{clip.description}</p><div className="mt-3 flex flex-wrap gap-1.5">{[clip.mood[0], clip.shotType].filter(Boolean).map(tag => <span key={tag} className="rounded-md border border-[#2c2922]/25 bg-[#f4f0e7] px-1.5 py-1 text-[10px]">{tag}</span>)}</div>{reasons.length > 0 && <p className="mt-2 text-[10px] text-[#4d7969]">Matches: {reasons.join(" · ")}</p>}</div></article>;
}
