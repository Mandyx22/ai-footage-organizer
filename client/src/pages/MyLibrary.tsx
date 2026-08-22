import { useAuth } from "@/_core/hooks/useAuth";
import { LibrarySourceStatus } from "@/components/LibrarySourceStatus";
import { SketchShell } from "@/components/SketchShell";
import { UploadFootageDialog } from "@/components/UploadFootageDialog";
import { UploadHandoffNotice } from "@/components/UploadHandoffNotice";
import { VideoClipPreview } from "@/components/VideoClipPreview";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useFootageSelection } from "@/contexts/FootageSelectionContext";
import {
  formatDuration,
  gradients,
  hideBrokenImageElement,
  matchReasons,
  type Clip,
} from "@/lib/footage";
import { getMyLibraryPresentation } from "@/lib/librarySource";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import {
  Archive,
  Check,
  FolderHeart,
  FolderPlus,
  ImageUp,
  Loader2,
  Play,
  Plus,
  Search,
  Sparkles,
  Trash2,
  WandSparkles,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Link } from "wouter";

const filters = [
  "All clips",
  "Night",
  "Warm",
  "Quiet",
  "People",
  "Wide",
  "Moving",
];
type SimilarDimension =
  | "all"
  | "color"
  | "mood"
  | "lighting"
  | "subject"
  | "composition"
  | "motion";
type ActiveProject = number | null | undefined;

export default function MyLibrary() {
  const { hasWorkspaceIdentity, loading, isPrototype } = useAuth();
  const utils = trpc.useUtils();
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState("All clips");
  const [focusedClipId, setFocusedClipId] = useState<number | null>(null);
  const [showSimilar, setShowSimilar] = useState(false);
  const [similarDimension, setSimilarDimension] =
    useState<SimilarDimension>("all");
  const [activeProjectId, setActiveProjectId] =
    useState<ActiveProject>(undefined);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [createCollectionOpen, setCreateCollectionOpen] = useState(false);
  const [addCollectionOpen, setAddCollectionOpen] = useState(false);
  const [collectionName, setCollectionName] = useState("");
  const [targetCollectionId, setTargetCollectionId] = useState("");
  const [showProjectForm, setShowProjectForm] = useState(false);
  const [projectName, setProjectName] = useState("");
  const { selectedIds, toggleSelection, clearSelection, isSelected } =
    useFootageSelection();
  const projectInput = useMemo(
    () =>
      activeProjectId === undefined
        ? undefined
        : { projectId: activeProjectId },
    [activeProjectId]
  );
  const searchInput = useMemo(
    () => ({
      query: searchQuery.trim(),
      ...(activeProjectId === undefined ? {} : { projectId: activeProjectId }),
    }),
    [searchQuery, activeProjectId]
  );
  const similarInput = useMemo(
    () => ({
      clipId: focusedClipId ?? 0,
      dimension: similarDimension,
      ...(activeProjectId === undefined ? {} : { projectId: activeProjectId }),
    }),
    [focusedClipId, similarDimension, activeProjectId]
  );
  const projects = trpc.projects.list.useQuery(undefined, {
    enabled: hasWorkspaceIdentity,
  });
  const library = trpc.footage.personalList.useQuery(projectInput, {
    enabled: hasWorkspaceIdentity,
  });
  const searched = trpc.footage.personalSearch.useQuery(searchInput, {
    enabled: hasWorkspaceIdentity && searchQuery.trim().length > 1,
  });
  const similar = trpc.footage.personalSimilar.useQuery(similarInput, {
    enabled: hasWorkspaceIdentity && Boolean(focusedClipId && showSimilar),
  });
  const collectionData = trpc.collections.personalList.useQuery(undefined, {
    enabled: hasWorkspaceIdentity,
  });
  const createProject = trpc.projects.create.useMutation({
    onSuccess: async project => {
      await utils.projects.list.invalidate();
      setActiveProjectId(project.id);
      setProjectName("");
      setShowProjectForm(false);
      toast.success(`${project.name} is ready for its clips.`);
    },
  });
  const moveClip = trpc.footage.moveToProject.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.footage.personalList.invalidate(),
        utils.footage.personalSearch.invalidate(),
        utils.footage.personalSimilar.invalidate(),
        utils.projects.list.invalidate(),
      ]);
      toast.success("Clip moved to its editing project.");
    },
  });
  const createCollection = trpc.collections.create.useMutation();
  const addClipToCollection = trpc.collections.addClip.useMutation();
  const deleteClip = trpc.footage.delete.useMutation({
    onSuccess: async (_result, input) => {
      if (focusedClipId === input.clipId) {
        setFocusedClipId(null);
        setDetailOpen(false);
      }
      await Promise.all([
        utils.footage.personalList.invalidate(),
        utils.footage.personalSearch.invalidate(),
        utils.footage.personalSimilar.invalidate(),
        utils.projects.list.invalidate(),
      ]);
      toast.success("Clip removed from your workspace.");
    },
  });
  const justUploaded =
    new URLSearchParams(window.location.search).get("uploaded") === "1";
  const personalSource = getMyLibraryPresentation(library.data, justUploaded);
  const baseClips = personalSource.clips as Clip[];
  const derivedClips = showSimilar
    ? ((similar.data?.clips ?? []) as Clip[])
    : searchQuery.trim().length > 1
      ? ((searched.data?.clips ?? []) as Clip[])
      : baseClips;
  const filterTerm = activeFilter === "All clips" ? "" : activeFilter;
  const visibleClips = filterTerm
    ? derivedClips.filter(clip =>
        [
          clip.description,
          ...clip.subjects,
          ...clip.mood,
          ...clip.colors,
          clip.shotType,
          clip.cameraMotion,
        ]
          .join(" ")
          .toLowerCase()
          .includes(filterTerm.toLowerCase())
      )
    : derivedClips;
  const focusedClip =
    baseClips.find(clip => clip.id === focusedClipId) ??
    visibleClips[0] ??
    null;
  const activeProject = projects.data?.projects.find(
    project => project.id === activeProjectId
  );
  const selectedClipIds = selectedIds.filter(id =>
    baseClips.some(clip => clip.id === id)
  );
  const activeSelectionCount = selectedClipIds.length;
  const collections = collectionData.data?.collections ?? [];
  const selectedProjectForUpload =
    activeProjectId === undefined ? null : activeProjectId;
  const refreshProjectList = () =>
    Promise.all([
      utils.footage.personalList.invalidate(),
      utils.footage.personalSearch.invalidate(),
      utils.footage.personalSimilar.invalidate(),
      utils.projects.list.invalidate(),
    ]);
  const persistSelectedClipsToCollection = async (collectionId: number) => {
    if (!selectedClipIds.length) return;
    await Promise.all(
      selectedClipIds.map(clipId =>
        addClipToCollection.mutateAsync({ collectionId, clipId })
      )
    );
    await Promise.all([
      utils.collections.personalList.invalidate(),
      utils.collections.personalSuggestions.invalidate(),
    ]);
  };
  const createCollectionFromSelection = async () => {
    if (!collectionName.trim()) {
      toast.error("Give this collection a name first.");
      return;
    }
    try {
      const collection = await createCollection.mutateAsync({
        name: collectionName.trim(),
        description: selectedClipIds.length
          ? `${selectedClipIds.length} selected personal clips from Framefind.`
          : undefined,
        accent: "apricot",
      });
      await persistSelectedClipsToCollection(collection.id);
      setCollectionName("");
      setCreateCollectionOpen(false);
      toast.success(
        `${selectedClipIds.length} clips are now in ${collection.name}.`
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not make that collection."
      );
    }
  };
  const addSelectedToExistingCollection = async () => {
    const collectionId = Number(targetCollectionId);
    if (!Number.isInteger(collectionId)) {
      toast.error("Choose a collection first.");
      return;
    }
    try {
      await persistSelectedClipsToCollection(collectionId);
      setAddCollectionOpen(false);
      toast.success(`${selectedClipIds.length} clips added to collection.`);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not add those clips to the collection."
      );
    }
  };

  return (
    <>
      <SketchShell active="myLibrary" onUpload={() => setUploadOpen(true)}>
        <div className="mx-auto max-w-[1560px] px-4 pb-12 pt-8 sm:px-7 lg:px-10">
          {!loading && !hasWorkspaceIdentity ? (
            <section className="paper-panel mx-auto max-w-2xl rounded-2xl p-8 text-center">
              <Archive className="mx-auto size-7 text-[#bd7058]" />
              <p className="mt-5 font-mono text-[10px] uppercase tracking-[.18em] ink-muted">
                Workspace unavailable
              </p>
              <h1 className="mt-2 font-hand text-5xl font-bold leading-[.88]">
                Your footage needs
                <br />a <span className="scribble">workspace.</span>
              </h1>
              <p className="mx-auto mt-4 max-w-md text-sm leading-6 ink-muted">
                The prototype workspace could not be loaded. Check the database
                connection and try again.
              </p>
            </section>
          ) : (
            <section className="grid gap-6 xl:grid-cols-[230px_minmax(0,1fr)_310px]">
              <aside className="paper-panel h-fit rounded-2xl p-3 xl:sticky xl:top-5">
                <div className="mb-3 flex items-center justify-between">
                  <p className="font-mono text-[10px] uppercase tracking-[.16em] ink-muted">
                    Editing projects
                  </p>
                  <button
                    onClick={() => setShowProjectForm(value => !value)}
                    className="grid size-7 place-items-center rounded-lg border border-[#2c2922]/35 bg-[#f8d9cc] shadow-sm"
                  >
                    <FolderPlus className="size-3.5" />
                  </button>
                </div>
                {showProjectForm && (
                  <form
                    onSubmit={event => {
                      event.preventDefault();
                      if (projectName.trim())
                        createProject.mutate({ name: projectName.trim() });
                    }}
                    className="mb-3 rounded-xl border border-[#2c2922]/30 bg-[#fff1ba] p-2"
                  >
                    <input
                      autoFocus
                      value={projectName}
                      onChange={event => setProjectName(event.target.value)}
                      placeholder="e.g. Osaka cut"
                      className="h-8 w-full rounded-md border border-[#2c2922]/35 bg-[#fffdf7] px-2 text-xs outline-none"
                    />
                    <Button
                      type="submit"
                      disabled={createProject.isPending || !projectName.trim()}
                      className="mt-2 h-8 w-full rounded-md border border-[#2c2922] bg-[#f4ad89] text-[11px] font-bold text-[#2c2922]"
                    >
                      Create project
                    </Button>
                  </form>
                )}
                <div className="space-y-1.5">
                  <ProjectButton
                    active={activeProjectId === undefined}
                    onClick={() => setActiveProjectId(undefined)}
                    label="All workspace"
                    count={
                      (projects.data?.unassignedCount ?? 0) +
                      (projects.data?.projects.reduce(
                        (sum, project) => sum + project.clipCount,
                        0
                      ) ?? 0)
                    }
                  />
                  <ProjectButton
                    active={activeProjectId === null}
                    onClick={() => setActiveProjectId(null)}
                    label="Loose clips"
                    count={projects.data?.unassignedCount ?? 0}
                    subtle
                  />
                  {(projects.data?.projects ?? []).map(project => (
                    <ProjectButton
                      key={project.id}
                      active={activeProjectId === project.id}
                      onClick={() => setActiveProjectId(project.id)}
                      label={project.name}
                      count={project.clipCount}
                      accent={project.accent}
                    />
                  ))}
                </div>
                <div className="mt-5 rounded-xl border border-[#2c2922]/25 bg-[#e8eff7] p-3 text-[11px] leading-5 ink-muted">
                  <b className="text-[#2c2922]">
                    {isPrototype
                      ? "Prototype workspace."
                      : "Projects are virtual folders."}
                  </b>{" "}
                  {isPrototype
                    ? "No login is required in this local MVP; footage is saved to a shared prototype identity."
                    : "They organize clips for a specific edit without moving the original files."}
                </div>
              </aside>
              <div className={cn(activeSelectionCount > 0 && "pb-10")}>
                <div className="mb-5 rounded-2xl border-[1.5px] border-[#2c2922]/55 bg-[#dcefdc] p-4 shadow-[2px_2px_0_rgba(44,41,34,.13)]">
                  <LibrarySourceStatus mode="personal" />
                  <h1 className="mt-1 font-hand text-4xl font-bold leading-none">
                    {activeProject
                      ? activeProject.name
                      : activeProjectId === null
                        ? "Loose clips, waiting for a story."
                        : "Your footage, arranged around the edit."}
                  </h1>
                  <p className="mt-2 max-w-2xl text-xs leading-5 ink-muted">
                    {activeProject
                      ? `Uploads here belong to ${activeProject.name}.`
                      : "Every clip here is yours. Put material into projects whenever a trip, client, or edit starts to take shape."}
                  </p>
                </div>
                <UploadHandoffNotice
                  visible={personalSource.showUploadConfirmation}
                />
                <div className="mb-4 flex flex-wrap items-center gap-2">
                  <Button
                    onClick={() => setUploadOpen(true)}
                    className="rounded-xl border-[1.5px] border-[#2c2922] bg-[#f4ad89] text-xs font-bold text-[#2c2922] shadow-[2px_2px_0_#2c2922] hover:bg-[#fac7ae]"
                  >
                    <ImageUp className="mr-2 size-4" />
                    Upload to {activeProject ? activeProject.name : "Workspace"}
                  </Button>
                  {activeProject && (
                    <span className="rounded-full border border-[#2c2922]/30 bg-[#fff1ba] px-3 py-1.5 text-[11px]">
                      {activeProject.clipCount} clips in this project
                    </span>
                  )}
                </div>
                <div className="relative max-w-2xl">
                  <Search className="absolute left-4 top-1/2 size-4 -translate-y-1/2 ink-muted" />
                  <input
                    value={searchQuery}
                    onChange={event => {
                      setSearchQuery(event.target.value);
                      setShowSimilar(false);
                    }}
                    placeholder="Search this workspace — “quiet blue night shots”"
                    className="h-11 w-full rounded-xl border-[1.5px] border-[#2c2922]/55 bg-[#fffdf7] pl-11 pr-10 text-sm shadow-[2px_2px_0_rgba(44,41,34,.1)] outline-none placeholder:text-[#756c60] focus:ring-2 focus:ring-[#e69275]"
                  />
                </div>
                <div className="mt-5 flex items-center gap-2 overflow-x-auto pb-1">
                  {filters.map(filter => (
                    <button
                      key={filter}
                      onClick={() => setActiveFilter(filter)}
                      className={cn(
                        "shrink-0 rounded-full border-[1.5px] px-3.5 py-1.5 text-xs transition-colors",
                        activeFilter === filter
                          ? "border-[#2c2922] bg-[#f8d9cc] font-semibold shadow-[1px_1px_0_#2c2922]"
                          : "border-[#2c2922]/35 bg-[#fffdf7]/75 ink-muted hover:bg-[#e8eff7] hover:text-[#2c2922]"
                      )}
                    >
                      {filter}
                    </button>
                  ))}
                  {(searchQuery || showSimilar) && (
                    <button
                      onClick={() => {
                        setSearchQuery("");
                        setShowSimilar(false);
                        setActiveFilter("All clips");
                      }}
                      className="ml-1 flex shrink-0 items-center gap-1 text-xs ink-muted hover:text-[#2c2922]"
                    >
                      <X className="size-3" />
                      Clear
                    </button>
                  )}
                </div>
                {showSimilar && (
                  <div className="note-blue mt-5 flex flex-wrap items-center gap-2 rounded-xl border-[1.5px] border-[#2c2922]/48 px-3 py-2.5 shadow-[2px_2px_0_rgba(44,41,34,.12)]">
                    <WandSparkles className="size-3.5" />
                    <span className="mr-1 text-xs">
                      Connections to <b>{focusedClip?.fileName}</b>
                    </span>
                    {(
                      [
                        "all",
                        "color",
                        "lighting",
                        "mood",
                        "composition",
                        "motion",
                      ] as const
                    ).map(dimension => (
                      <button
                        key={dimension}
                        onClick={() => setSimilarDimension(dimension)}
                        className={cn(
                          "rounded-md px-2 py-1 text-[11px] capitalize",
                          similarDimension === dimension
                            ? "bg-white/80 font-semibold shadow-[1px_1px_0_rgba(44,41,34,.2)]"
                            : "ink-muted hover:text-[#2c2922]"
                        )}
                      >
                        {dimension}
                      </button>
                    ))}
                  </div>
                )}
                {!showSimilar && searchQuery.trim().length > 1 && (
                  <div className="note-green mt-5 flex items-center gap-2 rounded-xl border-[1.5px] border-[#2c2922]/48 px-3 py-2.5 text-xs shadow-[2px_2px_0_rgba(44,41,34,.12)]">
                    <Search className="size-3.5 shrink-0" />
                    <span>
                      <b>{visibleClips.length} matches</b> in this view for “
                      {searchQuery.trim()}”.
                    </span>
                  </div>
                )}
                <div className="mt-6 grid gap-4 min-[520px]:grid-cols-2 2xl:grid-cols-3">
                  {library.isLoading
                    ? Array.from({ length: 6 }).map((_, index) => (
                        <div
                          key={index}
                          className="h-[252px] animate-pulse rounded-2xl border border-[#2c2922]/30 bg-[#fffdf7]/80"
                        />
                      ))
                    : visibleClips.map((clip, index) => (
                        <PersonalClipCard
                          key={clip.id}
                          clip={clip}
                          index={index}
                          selected={isSelected(clip.id)}
                          focused={focusedClip?.id === clip.id}
                          reasons={
                            showSimilar ? [] : matchReasons(clip, searchQuery)
                          }
                          onFocus={() => {
                            setFocusedClipId(clip.id);
                            setShowSimilar(false);
                            setDetailOpen(true);
                          }}
                          onToggle={() => toggleSelection(clip.id)}
                        />
                      ))}
                </div>
                {!library.isLoading && !baseClips.length && (
                  <div className="paper-panel mt-5 rounded-2xl px-6 py-14 text-center">
                    <ImageUp className="mx-auto size-7 text-[#bd7058]" />
                    <p className="mt-4 font-hand text-3xl font-bold">
                      {activeProject
                        ? `${activeProject.name} is ready for footage.`
                        : "Your workspace is ready for its first clip."}
                    </p>
                    <p className="mx-auto mt-2 max-w-md text-xs leading-5 ink-muted">
                      Choose this project, upload material, and the visual notes
                      will stay with the edit rather than mixing with another
                      trip.
                    </p>
                    <Button
                      onClick={() => setUploadOpen(true)}
                      className="mt-5 rounded-xl border-[1.5px] border-[#2c2922] bg-[#f4ad89] text-xs font-bold text-[#2c2922] shadow-[2px_2px_0_#2c2922] hover:bg-[#fac7ae]"
                    >
                      <ImageUp className="mr-2 size-4" />
                      Upload footage
                    </Button>
                  </div>
                )}
                {!library.isLoading &&
                  baseClips.length > 0 &&
                  !visibleClips.length && (
                    <div className="paper-panel mt-5 rounded-2xl px-6 py-12 text-center">
                      <Archive className="mx-auto size-6 ink-muted" />
                      <p className="mt-3 text-sm font-semibold">
                        Nothing in this project surfaced for that search.
                      </p>
                    </div>
                  )}
                <SelectionActionBar
                  selectedCount={activeSelectionCount}
                  hasCollections={collections.length > 0}
                  creating={
                    createCollection.isPending || addClipToCollection.isPending
                  }
                  adding={addClipToCollection.isPending}
                  onCreateCollection={() => setCreateCollectionOpen(true)}
                  onAddToCollection={() => {
                    setTargetCollectionId(String(collections[0]?.id ?? ""));
                    setAddCollectionOpen(true);
                  }}
                  onClear={clearSelection}
                />
              </div>
              <aside className="space-y-5 xl:pt-2">
                <Link
                  href="/collections"
                  className="note-pink block rotate-[.5deg] rounded-2xl border-[1.5px] border-[#2c2922]/48 p-4 shadow-[2px_2px_0_rgba(44,41,34,.12)]"
                >
                  <p className="font-hand text-xl font-bold">
                    Ready to group them?
                  </p>
                  <p className="mt-1 text-xs leading-5 ink-muted">
                    Collections are saved selections inside your Workspace. Open
                    the collection desk{" "}
                    <FolderHeart className="ml-1 inline size-3" />
                  </p>
                </Link>
              </aside>
            </section>
          )}
        </div>
      </SketchShell>
      <ClipDetailDialog
        clip={focusedClip}
        open={detailOpen && Boolean(focusedClip)}
        selected={focusedClip ? isSelected(focusedClip.id) : false}
        projects={projects.data?.projects ?? []}
        deletePending={deleteClip.isPending}
        onOpenChange={setDetailOpen}
        onToggle={() => focusedClip && toggleSelection(focusedClip.id)}
        onFindSimilar={() => {
          setShowSimilar(true);
          setDetailOpen(false);
        }}
        onMove={projectId =>
          focusedClip && moveClip.mutate({ clipId: focusedClip.id, projectId })
        }
        onDelete={() => {
          if (
            focusedClip &&
            window.confirm(
              `Remove ${focusedClip.fileName} from your workspace? This cannot be undone.`
            )
          )
            deleteClip.mutate({ clipId: focusedClip.id });
        }}
      />
      <Dialog
        open={createCollectionOpen}
        onOpenChange={setCreateCollectionOpen}
      >
        <DialogContent className="border-[1.5px] border-[#2c2922] bg-[#fffdf7] text-[#2c2922] shadow-[4px_4px_0_#2c2922] sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-hand text-3xl font-bold">
              Make a collection
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs leading-5 ink-muted">
              Save {activeSelectionCount} selected clips as a persistent group.
            </p>
            <input
              autoFocus
              value={collectionName}
              onChange={event => setCollectionName(event.target.value)}
              onKeyDown={event =>
                event.key === "Enter" && createCollectionFromSelection()
              }
              placeholder="e.g. Quiet summer memory"
              className="h-10 w-full rounded-lg border-[1.5px] border-[#2c2922]/55 bg-[#fffdf7] px-3 text-sm outline-none focus:ring-2 focus:ring-[#e69275]"
            />
            <Button
              onClick={createCollectionFromSelection}
              disabled={
                !activeSelectionCount ||
                !collectionName.trim() ||
                createCollection.isPending ||
                addClipToCollection.isPending
              }
              className="w-full rounded-xl border-[1.5px] border-[#2c2922] bg-[#f4ad89] text-xs font-bold text-[#2c2922] shadow-[2px_2px_0_#2c2922] hover:bg-[#fac7ae]"
            >
              {(createCollection.isPending ||
                addClipToCollection.isPending) && (
                <Loader2 className="mr-2 size-4 animate-spin" />
              )}
              Create collection
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={addCollectionOpen} onOpenChange={setAddCollectionOpen}>
        <DialogContent className="border-[1.5px] border-[#2c2922] bg-[#fffdf7] text-[#2c2922] shadow-[4px_4px_0_#2c2922] sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-hand text-3xl font-bold">
              Add to collection
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs leading-5 ink-muted">
              Add {activeSelectionCount} selected clips to an existing saved
              group.
            </p>
            <select
              value={targetCollectionId}
              onChange={event => setTargetCollectionId(event.target.value)}
              className="h-10 w-full rounded-lg border-[1.5px] border-[#2c2922]/55 bg-[#fffdf7] px-3 text-sm outline-none focus:ring-2 focus:ring-[#e69275]"
            >
              {collections.map(collection => (
                <option key={collection.id} value={collection.id}>
                  {collection.name}
                </option>
              ))}
            </select>
            <Button
              onClick={addSelectedToExistingCollection}
              disabled={
                !activeSelectionCount ||
                !targetCollectionId ||
                addClipToCollection.isPending
              }
              className="w-full rounded-xl border-[1.5px] border-[#2c2922] bg-[#f4ad89] text-xs font-bold text-[#2c2922] shadow-[2px_2px_0_#2c2922] hover:bg-[#fac7ae]"
            >
              {addClipToCollection.isPending && (
                <Loader2 className="mr-2 size-4 animate-spin" />
              )}
              Add to collection
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <UploadFootageDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        projectId={selectedProjectForUpload}
      />
    </>
  );
}

function SelectionActionBar({
  selectedCount,
  hasCollections,
  creating,
  adding,
  onCreateCollection,
  onAddToCollection,
  onClear,
}: {
  selectedCount: number;
  hasCollections: boolean;
  creating: boolean;
  adding: boolean;
  onCreateCollection: () => void;
  onAddToCollection: () => void;
  onClear: () => void;
}) {
  if (selectedCount === 0) return null;

  return (
    <div className="sticky bottom-3 z-10 mt-6 rounded-2xl border-[1.5px] border-[#2c2922]/60 bg-[#fffdf7]/95 p-3 shadow-[3px_3px_0_rgba(44,41,34,.18)] backdrop-blur">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <span className="rounded-md bg-[#dcefdc] px-2 py-1 font-mono text-[10px] uppercase tracking-[.12em]">
          {selectedCount} selected
        </span>
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={onCreateCollection}
            disabled={creating}
            className="h-8 rounded-lg border border-[#2c2922] bg-[#f4ad89] px-2.5 text-[11px] font-bold text-[#2c2922] shadow-[1px_1px_0_#2c2922] hover:bg-[#fac7ae]"
          >
            <Plus className="mr-1.5 size-3.5" />
            Create collection
          </Button>
          {hasCollections && (
            <Button
              onClick={onAddToCollection}
              disabled={adding}
              className="h-8 rounded-lg border border-[#2c2922]/45 bg-[#fffdf7] px-2.5 text-[11px] font-bold text-[#2c2922] shadow-sm hover:bg-[#fff1ba]"
            >
              <FolderPlus className="mr-1.5 size-3.5" />
              Add to collection
            </Button>
          )}
          <Link
            href="/ask"
            className="inline-flex h-8 items-center rounded-lg border border-[#2c2922]/45 bg-[#fffdf7] px-2.5 text-[11px] font-bold text-[#2c2922] shadow-sm hover:bg-[#dcefdc]"
          >
            <Sparkles className="mr-1.5 size-3.5" />
            Ask about selected
          </Link>
          <button
            onClick={onClear}
            className="inline-flex h-8 items-center rounded-lg px-2.5 text-[11px] font-semibold ink-muted hover:bg-[#f4f0e7] hover:text-[#2c2922]"
          >
            <X className="mr-1 size-3.5" />
            Clear
          </button>
        </div>
      </div>
    </div>
  );
}

function ProjectButton({
  active,
  onClick,
  label,
  count,
  accent,
  subtle = false,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
  accent?: string;
  subtle?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded-xl border px-2.5 py-2 text-left text-xs transition-colors",
        active
          ? "border-[#2c2922] bg-[#f8d9cc] font-bold shadow-[1px_1px_0_#2c2922]"
          : subtle
            ? "border-[#2c2922]/20 bg-[#f4f0e7] ink-muted"
            : "border-[#2c2922]/20 bg-[#fffdf7] hover:bg-[#fff1ba]"
      )}
    >
      <FolderHeart
        className={cn(
          "size-3.5 shrink-0",
          accent === "blue"
            ? "text-[#567998]"
            : accent === "green"
              ? "text-[#4d7969]"
              : "text-[#bd7058]"
        )}
      />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span className="rounded bg-white/70 px-1.5 py-0.5 font-mono text-[9px]">
        {count}
      </span>
    </button>
  );
}

function ClipDetailDialog({
  clip,
  open,
  selected,
  projects,
  deletePending,
  onOpenChange,
  onToggle,
  onFindSimilar,
  onMove,
  onDelete,
}: {
  clip: Clip | null;
  open: boolean;
  selected: boolean;
  projects: Array<{ id: number; name: string }>;
  deletePending: boolean;
  onOpenChange: (open: boolean) => void;
  onToggle: () => void;
  onFindSimilar: () => void;
  onMove: (projectId: number | null) => void;
  onDelete: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto border-[1.5px] border-[#2c2922] bg-[#fffdf7] text-[#2c2922] shadow-[4px_4px_0_#2c2922] sm:max-w-4xl">
        {clip && (
          <>
            <DialogHeader className="pr-8">
              <p className="font-mono text-[10px] uppercase tracking-[.16em] ink-muted">
                Your clip notes
              </p>
              <DialogTitle className="break-words font-hand text-3xl font-bold leading-none sm:text-4xl">
                {clip.fileName}
              </DialogTitle>
            </DialogHeader>
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(240px,.65fr)]">
              <div className="min-w-0">
                <VideoClipPreview clip={clip} />
                <p className="mt-4 text-sm leading-6 ink-muted">
                  {clip.description}
                </p>
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {[
                    ...clip.subjects.slice(0, 3),
                    clip.setting,
                    ...clip.mood,
                    clip.shotType,
                    clip.cameraMotion,
                    ...clip.colors.slice(0, 2),
                  ]
                    .filter(Boolean)
                    .map(tag => (
                      <span
                        key={tag}
                        className="rounded-md border border-[#2c2922]/25 bg-[#f4f0e7] px-1.5 py-1 text-[10px]"
                      >
                        {tag}
                      </span>
                    ))}
                </div>
              </div>
              <div className="grid h-fit gap-2">
                <button
                  onClick={onToggle}
                  className={cn(
                    "rounded-lg border px-3 py-2 text-left text-xs font-semibold shadow-sm",
                    selected
                      ? "border-[#2c2922] bg-[#f4ad89]"
                      : "border-[#2c2922]/40 bg-[#fffdf7]"
                  )}
                >
                  <Check className="mr-1.5 inline size-3.5" />
                  {selected ? "Circled for later" : "Circle this clip"}
                </button>
                <button
                  onClick={onFindSimilar}
                  className="rounded-lg border border-[#2c2922]/40 bg-[#fffdf7] px-3 py-2 text-left text-xs font-semibold shadow-sm"
                >
                  <WandSparkles className="mr-1.5 inline size-3.5" />
                  Find similar in this view
                </button>
                <label className="rounded-lg border border-[#2c2922]/35 bg-[#fffdf7] px-3 py-2 text-xs">
                  <span className="mr-2 font-semibold">Move to project</span>
                  <select
                    value={clip.projectId ?? ""}
                    onChange={event =>
                      onMove(
                        event.target.value ? Number(event.target.value) : null
                      )
                    }
                    className="mt-2 w-full bg-transparent text-xs outline-none sm:mt-0"
                  >
                    <option value="">Loose clips</option>
                    {projects.map(project => (
                      <option key={project.id} value={project.id}>
                        {project.name}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  onClick={onDelete}
                  disabled={deletePending}
                  className="rounded-lg border border-[#b75252]/45 bg-[#fff0ee] px-3 py-2 text-left text-xs font-semibold text-[#8f3636]"
                >
                  <Trash2 className="mr-1.5 inline size-3.5" />
                  Remove uploaded clip
                </button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function PersonalClipCard({
  clip,
  index,
  selected,
  focused,
  reasons,
  onFocus,
  onToggle,
}: {
  clip: Clip;
  index: number;
  selected: boolean;
  focused: boolean;
  reasons: string[];
  onFocus: () => void;
  onToggle: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const canExpand = clip.description.length > 120;
  return (
    <article
      onClick={onFocus}
      className={cn(
        "sketch-card group overflow-hidden rounded-2xl border-[1.5px] bg-[#fffdf7]",
        focused ? "border-[#2c2922]" : "border-[#2c2922]/50"
      )}
    >
      <div
        className={cn(
          "relative aspect-[16/10] overflow-hidden border-b-[1.5px] border-[#2c2922]/45 bg-gradient-to-br",
          gradients[index % gradients.length]
        )}
      >
        {clip.thumbnailUrl ? (
          <img
            src={clip.thumbnailUrl}
            alt=""
            onError={event => hideBrokenImageElement(event.currentTarget)}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="grid h-full place-items-center text-[11px] ink-muted">
            Analyzing visual notes…
          </div>
        )}
        <div className="absolute inset-x-3 top-3 flex items-center justify-between">
          <button
            onClick={event => {
              event.stopPropagation();
              onToggle();
            }}
            className={cn(
              "grid size-6 place-items-center rounded-full border-[1.5px] shadow-sm transition-colors",
              selected
                ? "border-[#2c2922] bg-[#f4ad89]"
                : "border-[#2c2922]/50 bg-[#fffdf7]/90 hover:bg-[#dcefdc]"
            )}
          >
            <Check className="size-3.5" />
          </button>
          <div className="flex items-center gap-1.5">
            <span className="rounded-md bg-[#fffdf7]/90 px-1.5 py-1 font-mono text-[9px] shadow-sm">
              {formatDuration(clip.durationMs)}
            </span>
            <button
              aria-label="Open clip preview"
              onClick={event => {
                event.stopPropagation();
                onFocus();
              }}
              className="grid size-6 place-items-center rounded-md border border-[#2c2922]/35 bg-[#fffdf7]/90 shadow-sm"
            >
              <Play className="size-3" />
            </button>
          </div>
        </div>
      </div>
      <div className="p-3.5">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate font-mono text-[10px] ink-muted">
            {clip.fileName}
          </p>
          <span className="shrink-0 rotate-1 rounded bg-[#dcefdc] px-1 text-[9px] uppercase tracking-[.12em] ink-muted">
            {clip.time}
          </span>
        </div>
        <p
          className={cn(
            "mt-2 text-xs leading-5 text-[#37332c]",
            !expanded && "line-clamp-2"
          )}
        >
          {clip.description}
        </p>
        {canExpand && (
          <button
            type="button"
            aria-expanded={expanded}
            onClick={event => {
              event.stopPropagation();
              setExpanded(value => !value);
            }}
            className="mt-1 text-[10px] font-bold text-[#bd7058] underline decoration-wavy underline-offset-4"
          >
            {expanded ? "Show less" : "Read more"}
          </button>
        )}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {[clip.mood[0], clip.shotType].filter(Boolean).map(tag => (
            <span
              key={tag}
              className="rounded-md border border-[#2c2922]/25 bg-[#f4f0e7] px-1.5 py-1 text-[10px]"
            >
              {tag}
            </span>
          ))}
        </div>
        {reasons.length > 0 && (
          <p className="mt-2 text-[10px] text-[#4d7969]">
            Matches: {reasons.join(" · ")}
          </p>
        )}
      </div>
    </article>
  );
}
