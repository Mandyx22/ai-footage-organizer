# Framefind Product Requirements Document

**Product:** Framefind — AI Footage Organizer  
**Version:** MVP prototype  
**Owner:** Manus AI  
**Status:** Implemented prototype baseline

## 1. Product summary

Framefind is a pre-editing workspace for casual creators who have disorganized personal video libraries. Its job is not to edit a finished video; it transforms raw clips into a library a creator can understand, search, group, and use to develop a possible edit.

> **Product principle:** Let creators explore their own footage before asking them to articulate a storyline.

The MVP treats the creative process as retrieval and discovery. A creator may remember a clip as “blue”, “quiet”, “two people in frame”, or “good for a transition”, even when its filename is `IMG_4821.MOV`. The product must make those memory cues actionable.

## 2. Problem, user, and outcome

| Dimension | Definition |
| --- | --- |
| Target user | A casual creator who captures travel, social, and everyday video; occasionally makes a vlog, montage, reel, or short; and does not maintain a professional media-management workflow. |
| Core problem | Raw footage is stored by filename, folder, and timestamp while the creator remembers scenes, light, color, mood, motion, or a potential editorial purpose. |
| User outcome | “I understand what I filmed and can quickly gather material for an idea.” |
| Product outcome | Shorter retrieval and organization effort before editing, with preserved creator control over aesthetic and narrative decisions. |
| Non-goal | Automatically decide the story, construct a finished edit, replace a nonlinear editor, or integrate with every editing platform. |

## 3. MVP scope

| Product area | User capability | MVP requirement |
| --- | --- | --- |
| Upload | Add several video files by browse or drag-and-drop. | Validate video type and size, display visible progress, sample multiple frames across the clip, and save the selected video to the workspace. |
| Structured metadata | Receive useful AI labels without manual tagging. | Generate strict Metadata V2 JSON that separates observed visual facts, subjective interpretation, and creative editing uses. |
| Library | Browse clips visually and scan useful metadata. | Show thumbnail, filename, duration, description, mood, shot type, and filters. |
| Natural-language search | Search via memory-like phrases. | Match an expressive query to structured metadata with lexical + synonym ranking, and explain the matching cues on each result. |
| Find Similar | Surface related shots from a reference clip. | Rank clips by selected dimensions: color, lighting, mood, subject, composition, or motion. |
| Projects | Turn discovered footage into editable groups. | Create a named editing project, save a current selection, and show automatically derived thematic project suggestions. |
| Ask My Footage | Reason about the selected material. | Answer a creative question only from selected-clip metadata; identify a direction, a simple sequence idea, and a useful caveat. |

## 4. Primary user journey

| Stage | Creator action | Product response | Success signal |
| --- | --- | --- | --- |
| Ingest | Select several raw clips. | Samples frames across the clip, analyzes visual signals, uploads the original, and shows progress. | Clip becomes `ready` with a thumbnail and structured metadata. |
| Explore | Browses the visual library and taps filters. | Shows descriptive cards rather than opaque filenames. | Creator recognizes material they had forgotten. |
| Retrieve | Searches “quiet blue night shots”. | Ranks clips using metadata and shows which query cues matched. | A relevant clip appears without manual file hunting. |
| Refine | Opens a promising clip and invokes Find Similar. | Returns related footage by an explicit similarity dimension. | Creator can gather visually coherent material. |
| Organize | Selects clips and creates a project. | Persists the named editing project and membership. | A potential montage / scene now has a home. |
| Reflect | Asks what the chosen clips could become. | Gives a constrained creative response with an uncertainty or coverage note. | Creator receives an idea while retaining authorship. |

## 5. Functional requirements and acceptance criteria

| ID | Requirement | Acceptance criteria |
| --- | --- | --- |
| FR-01 | File intake | The interface supports click selection and drag-and-drop of multiple `video/*` files, rejects unsupported files, and explains the prototype size limit. |
| FR-02 | Frame-sampling analysis | The browser samples several frames across the clip after metadata loads. The server invokes a multimodal model only after explicit creator action and validates the strict metadata schema. |
| FR-03 | Secure persistence | A clip can only be uploaded and attached in the local workspace. Video bytes remain in object storage rather than database fields. |
| FR-04 | Library cards | Every ready clip presents a thumbnail, duration, short visual description, and at least mood plus shot-type labels. |
| FR-05 | Retrieval | A natural-language query returns only clips with a non-zero metadata score and visibly identifies matching cues. |
| FR-06 | Similarity | The creator can change the matching dimension and receive a re-ranked set excluding the reference clip. |
| FR-07 | Projects | A creator can create an empty editing project or create one from a selected group of their own clips. |
| FR-08 | Creative guidance | The assistant receives selected-clip metadata and the creator’s question. It must not claim it watched unprovided footage or invent clips. |

## 6. Data model

| Entity | Purpose | Important fields |
| --- | --- | --- |
| `clips` | One uploaded footage record. | File identity, media / thumbnail storage references, analysis status, descriptive metadata, Metadata V2 JSON, and owner. |
| `editingProjects` | A named creator-controlled group. | Owner, name, description, visual accent, and whether it is AI-suggested. |
| `projectClips` | Membership relationship. | Composite project / clip key and creation timestamp. |

Metadata arrays are persisted as JSON strings in the current relational schema. That keeps retrieval and presentation straightforward for the MVP while allowing a later migration to normalized tags or vector representations.

## 7. Design principles

Framefind is intentionally intimate, quiet, and editorial rather than dashboard-heavy. It uses a dark film-room surface, soft color light, concise mono labels, and a restrained serif accent. The visual language should communicate that a clip library is a place to notice moments, not merely manage files.

The interface should show AI reasoning as an assistive layer. Search cards expose matching signals, suggested projects label their origin, and subjective fields such as mood are presented as practical creative prompts rather than deterministic judgments.

## 8. Measurement plan for a later study

| Metric | Test question |
| --- | --- |
| Retrieval time | Can a creator find a named target moment faster than by ordinary folder browsing? |
| Search success | Does a natural-language query surface the intended footage? |
| Organization time | How long does it take to move from raw clips to a usable montage collection? |
| Metadata utility | Which fields — mood, lighting, color, shot type, or possible use — prove useful in actual selection? |
| Similarity acceptance | How often does a creator keep shots returned by Find Similar? |
| Creative confidence | Does the workspace make the creator feel more aware of their available material? |

## 9. Explicitly deferred work

The MVP does not ship a timeline editor, automatic finished-video generation, production-scale asynchronous processing, audio transcription, multi-frame temporal analysis, native Premiere / CapCut integrations, external template APIs, creator collaboration, or vector embeddings. Those items should be prioritized only after the core retrieval experience demonstrates value.
