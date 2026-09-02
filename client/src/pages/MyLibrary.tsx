import { ClipDescription } from "@/components/ClipDescription";
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
import { useEffect, useMemo, useRef, useState } from "react";
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
type ProjectSummary = {
  id: number;
  name: string;
  accent?: string;
  clipCount: number;
};
type ProjectSuggestion = {
  id: string;
  name: string;
  description: string;
  accent: string;
  clipCount: number;
};

export default function MyLibrary() {
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
  const [showProjectForm, setShowProjectForm] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [createProjectOpen, setCreateProjectOpen] = useState(false);
  const [addProjectOpen, setAddProjectOpen] = useState(false);
  const [targetProjectId, setTargetProjectId] = useState("");
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
  const projects = trpc.projects.list.useQuery(undefined);
  const suggestions = trpc.projects.suggestions.useQuery(undefined);
  const library = trpc.footage.personalList.useQuery(projectInput);
  const searched = trpc.footage.personalSearch.useQuery(searchInput, {
    enabled: searchQuery.trim().length > 1,
  });
  const similar = trpc.footage.personalSimilar.useQuery(similarInput, {
    enabled: Boolean(focusedClipId && showSimilar),
  });
  const refreshProjectList = () =>
    Promise.all([
      utils.footage.personalList.invalidate(),
      utils.footage.personalSearch.invalidate(),
      utils.footage.personalSimilar.invalidate(),
      utils.projects.list.invalidate(),
    ]);
  const createProject = trpc.projects.create.useMutation({
    onSuccess: async () => {
      await utils.projects.list.invalidate();
    },
  });
  const addToProject = trpc.footage.addToProject.useMutation({
    onSuccess: refreshProjectList,
  });
  const removeFromProject = trpc.footage.removeFromProject.useMutation({
    onSuccess: refreshProjectList,
  });
  const deleteClip = trpc.footage.delete.useMutation({
    onSuccess: async (_result, input) => {
      if (focusedClipId === input.clipId) {
        setFocusedClipId(null);
        setDetailOpen(false);
      }
      await refreshProjectList();
      toast.success("Clip removed from your workspace.");
    },
  });
  const renameClip = trpc.footage.rename.useMutation({
    onSuccess: async () => {
      await refreshProjectList();
      toast.success("Clip renamed.");
    },
    onError: error => {
      toast.error(error.message || "Could not rename that clip.");
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
  const selectedProjectForUpload =
    activeProjectId === undefined ? null : activeProjectId;
  const mutationPending =
    createProject.isPending ||
    addToProject.isPending ||
    removeFromProject.isPending ||
    renameClip.isPending;

  const submitProjectForm = async () => {
    if (!projectName.trim()) return;
    try {
      const project = await createProject.mutateAsync({
        name: projectName.trim(),
      });
      setActiveProjectId(project.id);
      setProjectName("");
      setShowProjectForm(false);
      toast.success(`${project.name} is ready for its clips.`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not create that project."
      );
    }
  };

  const createProjectFromSelection = async (name: string) => {
    try {
      const project = await createProject.mutateAsync({
        name: name.trim(),
        description: activeSelectionCount
          ? `${activeSelectionCount} selected clips grouped from your Workspace.`
          : undefined,
        accent: "apricot",
      });
      if (selectedClipIds.length) {
        await Promise.all(
          selectedClipIds.map(clipId =>
            addToProject.mutateAsync({ projectId: project.id, clipId })
          )
        );
      }
      setProjectName("");
      setCreateProjectOpen(false);
      toast.success(
        selectedClipIds.length
          ? `${selectedClipIds.length} clips are now in ${project.name}.`
          : `${project.name} is ready for material.`
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not make that project."
      );
    }
  };

  const addSelectedToExistingProject = async () => {
    const projectId = Number(targetProjectId);
    if (!Number.isInteger(projectId)) {
      toast.error("Choose a project first.");
      return;
    }
    try {
      await Promise.all(
        selectedClipIds.map(clipId =>
          addToProject.mutateAsync({ projectId, clipId })
        )
      );
      setAddProjectOpen(false);
      toast.success(`${selectedClipIds.length} clips added to that project.`);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not add those clips to the project."
      );
    }
  };

  const createSuggestionProject = async (suggestion: ProjectSuggestion) => {
    try {
      const project = await createProject.mutateAsync({
        name: suggestion.name,
        description: suggestion.description,
        accent: suggestion.accent,
      });
      setActiveProjectId(project.id);
      toast.success(`${project.name} is ready to fill.`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not make that project."
      );
    }
  };

  return (
    <>
      <SketchShell active="myLibrary" onUpload={() => setUploadOpen(true)}>
        <div className="mx-auto max-w-[1560px] px-4 pb-12 pt-8 sm:px-7 lg:px-10">
          <section className="grid gap-6 xl:grid-cols-[230px_minmax(0,1fr)]">
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
                      submitProjectForm();
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
                {(suggestions.data?.projects ?? []).length > 0 && (
                  <div className="mt-5">
                    <p className="mb-2 px-1 font-mono text-[9px] uppercase tracking-[.16em] ink-muted">
                      Suggested projects
                    </p>
                    <div className="space-y-1.5">
                      {(suggestions.data?.projects ?? []).map(suggestion => (
                        <div
                          key={suggestion.id}
                          className="flex items-center gap-2 rounded-xl border border-dashed border-[#2c2922]/45 bg-[#fff1ba]/55 px-2 py-2"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-bold">
                              {suggestion.name}
                            </p>
                            <p className="text-[10px] ink-muted">
                              {suggestion.clipCount} clips fit this thread
                            </p>
                          </div>
                          <button
                            onClick={() => createSuggestionProject(suggestion)}
                            disabled={createProject.isPending}
                            className="rounded-md border border-[#2c2922] bg-[#fffdf7] px-2 py-1 text-[10px] font-bold shadow-sm hover:bg-white/80 disabled:opacity-50"
                          >
                            Make
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div className="mt-5 rounded-xl border border-[#2c2922]/25 bg-[#e8eff7] p-3 text-[11px] leading-5 ink-muted">
                  <b className="text-[#2c2922]">Local workspace.</b> No login is
                  required in this single-user app; footage is saved straight to
                  your local prototype identity.
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
                            !showSimilar && searchQuery.trim().length > 1
                              ? (searched.data?.reasons[clip.id] ?? [])
                              : []
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
                  pending={mutationPending}
                  adding={addToProject.isPending}
                  onCreateProject={() => setCreateProjectOpen(true)}
                  onAddToProject={() => {
                    setTargetProjectId(
                      String(projects.data?.projects[0]?.id ?? "")
                    );
                    setAddProjectOpen(true);
                  }}
                  hasProjects={(projects.data?.projects?.length ?? 0) > 0}
                  onClear={clearSelection}
                />
              </div>
            </section>
        </div>
      </SketchShell>
      <ClipDetailDialog
        clip={focusedClip}
        open={detailOpen && Boolean(focusedClip)}
        selected={focusedClip ? isSelected(focusedClip.id) : false}
        projects={projects.data?.projects ?? []}
        deletePending={deleteClip.isPending || mutationPending}
        renamePending={renameClip.isPending}
        onOpenChange={setDetailOpen}
        onToggle={() => focusedClip && toggleSelection(focusedClip.id)}
        onFindSimilar={() => {
          setShowSimilar(true);
          setDetailOpen(false);
        }}
        onRename={fileName =>
          focusedClip &&
          renameClip.mutate({ clipId: focusedClip.id, fileName })
        }
        onToggleProject={(projectId, keep) =>
          focusedClip &&
          (keep
            ? addToProject.mutate({ clipId: focusedClip.id, projectId })
            : removeFromProject.mutate({ clipId: focusedClip.id, projectId }))
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
      <Dialog open={createProjectOpen} onOpenChange={setCreateProjectOpen}>
        <DialogContent className="border-[1.5px] border-[#2c2922] bg-[#fffdf7] text-[#2c2922] shadow-[4px_4px_0_#2c2922] sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-hand text-3xl font-bold">
              Make a project
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs leading-5 ink-muted">
              Save {activeSelectionCount} selected clips as an editing project,
              or create an empty one.
            </p>
            <input
              autoFocus
              value={projectName}
              onChange={event => setProjectName(event.target.value)}
              onKeyDown={event =>
                event.key === "Enter" && createProjectFromSelection(projectName)
              }
              placeholder="e.g. Quiet summer memory"
              className="h-10 w-full rounded-lg border-[1.5px] border-[#2c2922]/55 bg-[#fffdf7] px-3 text-sm outline-none focus:ring-2 focus:ring-[#e69275]"
            />
            <Button
              onClick={() => createProjectFromSelection(projectName)}
              disabled={
                !projectName.trim() || createProject.isPending
              }
              className="w-full rounded-xl border-[1.5px] border-[#2c2922] bg-[#f4ad89] text-xs font-bold text-[#2c2922] shadow-[2px_2px_0_#2c2922] hover:bg-[#fac7ae]"
            >
              {createProject.isPending && (
                <Loader2 className="mr-2 size-4 animate-spin" />
              )}
              Create project
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={addProjectOpen} onOpenChange={setAddProjectOpen}>
        <DialogContent className="border-[1.5px] border-[#2c2922] bg-[#fffdf7] text-[#2c2922] shadow-[4px_4px_0_#2c2922] sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-hand text-3xl font-bold">
              Add to project
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs leading-5 ink-muted">
              Put {activeSelectionCount} selected clips into an existing
              editing project.
            </p>
            <select
              value={targetProjectId}
              onChange={event => setTargetProjectId(event.target.value)}
              className="h-10 w-full rounded-lg border-[1.5px] border-[#2c2922]/55 bg-[#fffdf7] px-3 text-sm outline-none focus:ring-2 focus:ring-[#e69275]"
            >
              {(projects.data?.projects ?? []).map(project => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
            <Button
              onClick={addSelectedToExistingProject}
              disabled={
                !activeSelectionCount ||
                !targetProjectId ||
                addToProject.isPending
              }
              className="w-full rounded-xl border-[1.5px] border-[#2c2922] bg-[#f4ad89] text-xs font-bold text-[#2c2922] shadow-[2px_2px_0_#2c2922] hover:bg-[#fac7ae]"
            >
              {addToProject.isPending && (
                <Loader2 className="mr-2 size-4 animate-spin" />
              )}
              Add to project
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
  pending,
  adding,
  onCreateProject,
  onAddToProject,
  hasProjects,
  onClear,
}: {
  selectedCount: number;
  pending: boolean;
  adding: boolean;
  onCreateProject: () => void;
  onAddToProject: () => void;
  hasProjects: boolean;
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
            onClick={onCreateProject}
            disabled={pending}
            className="h-8 rounded-lg border border-[#2c2922] bg-[#f4ad89] px-2.5 text-[11px] font-bold text-[#2c2922] shadow-[1px_1px_0_#2c2922] hover:bg-[#fac7ae]"
          >
            <Plus className="mr-1.5 size-3.5" />
            Create project
          </Button>
          {hasProjects && (
            <Button
              onClick={onAddToProject}
              disabled={adding}
              className="h-8 rounded-lg border border-[#2c2922]/45 bg-[#fffdf7] px-2.5 text-[11px] font-bold text-[#2c2922] shadow-sm hover:bg-[#fff1ba]"
            >
              <FolderPlus className="mr-1.5 size-3.5" />
              Add to project
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
  renamePending,
  onOpenChange,
  onToggle,
  onFindSimilar,
  onRename,
  onToggleProject,
  onDelete,
}: {
  clip: Clip | null;
  open: boolean;
  selected: boolean;
  projects: ProjectSummary[];
  deletePending: boolean;
  renamePending: boolean;
  onOpenChange: (open: boolean) => void;
  onToggle: () => void;
  onFindSimilar: () => void;
  onRename: (fileName: string) => void;
  onToggleProject: (projectId: number, keepInProject: boolean) => void;
  onDelete: () => void;
}) {
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState("");
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setEditingName(false);
    setDraftName(clip?.fileName ?? "");
  }, [clip?.id, clip?.fileName, open]);

  useEffect(() => {
    if (editingName) nameInputRef.current?.focus();
  }, [editingName]);

  const commitRename = () => {
    const nextName = draftName.trim();
    if (!clip || !nextName || nextName === clip.fileName) {
      setEditingName(false);
      setDraftName(clip?.fileName ?? "");
      return;
    }
    onRename(nextName);
    setEditingName(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto border-[1.5px] border-[#2c2922] bg-[#fffdf7] text-[#2c2922] shadow-[4px_4px_0_#2c2922] sm:max-w-4xl">
        {clip && (
          <>
            <DialogHeader className="pr-8">
              <p className="font-mono text-[10px] uppercase tracking-[.16em] ink-muted">
                Your clip notes
              </p>
              {editingName ? (
                <input
                  ref={nameInputRef}
                  value={draftName}
                  disabled={renamePending}
                  maxLength={255}
                  onChange={event => setDraftName(event.target.value)}
                  onBlur={commitRename}
                  onKeyDown={event => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      commitRename();
                    }
                    if (event.key === "Escape") {
                      event.preventDefault();
                      setEditingName(false);
                      setDraftName(clip.fileName);
                    }
                  }}
                  className="mt-1 w-full rounded-lg border-[1.5px] border-[#2c2922] bg-white px-3 py-2 font-hand text-3xl font-bold leading-none sm:text-4xl"
                />
              ) : (
                <DialogTitle
                  title="Double-click to rename"
                  onDoubleClick={() => {
                    setDraftName(clip.fileName);
                    setEditingName(true);
                  }}
                  className="cursor-text break-words font-hand text-3xl font-bold leading-none sm:text-4xl"
                >
                  {clip.fileName}
                </DialogTitle>
              )}
              {!editingName && (
                <p className="text-[11px] ink-muted">Double-click the name to rename.</p>
              )}
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
                <div className="rounded-lg border border-[#2c2922]/35 bg-[#fffdf7] px-3 py-2">
                  <p className="text-xs font-semibold">Projects</p>
                  {projects.length ? (
                    <div className="mt-2 space-y-1.5">
                      {projects.map(project => {
                        const inProject = clip.projectIds.includes(project.id);
                        return (
                          <div
                            key={project.id}
                            className="flex items-center justify-between gap-2 rounded-md border border-[#2c2922]/25 px-2 py-1.5"
                          >
                            <span className="min-w-0 truncate text-xs">
                              {project.name}
                            </span>
                            <button
                              onClick={() =>
                                onToggleProject(project.id, !inProject)
                              }
                              className={cn(
                                "shrink-0 rounded-md px-2 py-0.5 text-[10px] font-bold transition-colors",
                                inProject
                                  ? "bg-[#dcefdc] text-[#2c2922]"
                                  : "border border-[#2c2922]/30 bg-[#fffdf7] ink-muted hover:bg-[#fff1ba]"
                              )}
                            >
                              {inProject ? "In this project" : "Add"}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="mt-2 text-[11px] leading-5 ink-muted">
                      Create a project first to give this clip a home.
                    </p>
                  )}
                </div>
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
        <ClipDescription description={clip.description} />
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