# Visual QA Notes

**Validated:** 2026-08-15

| Surface | Result | Notes |
| --- | --- | --- |
| Desktop, 1440 px | Pass | Navigation, search, library grid, focused-clip panel, collection suggestions, upload affordance, and Ask My Footage section render without visible overlap. |
| Mobile, 390 px | Pass | The navigation collapses, the footage grid becomes a single column, and upload / selection / creative-assistant controls remain present. The header intentionally favors compact controls at this width. |
| Sample media | Pending async replacement | Generated cinematic demo-image URLs are wired into the first four cards. The image service initially displays a temporary generation placeholder and replaces it automatically when the assets are ready. |

The interface was visually checked after type checking and unit tests passed. Future usability testing should focus on the true drag-and-drop flow, authenticated upload behavior, search-query comprehension, and selection-to-collection interaction with personal footage.

## Sketch Theme Update

| Surface | Result | Notes |
| --- | --- | --- |
| Desktop, 1440 px | Pass | The workspace now presents a consistent tactile sketchbook language: warm grid-paper background, handwritten editorial moments, paper cards, pencil-style outlines, pastel notes, and taped focal panels. |
| Mobile, 390 px | Pass | Search, actions, filter pills, single-column clip cards, collections, the focused-clip note, and the Ask My Footage surface remain visible without overlapping content. |

The revised theme retains a high-contrast ink-on-paper control system for filenames and operational UI while reserving handwriting and wavy underlines for reflective, creator-facing moments.

## Information Architecture Update

| Route | Result | Notes |
| --- | --- | --- |
| `/` | Pass | Landing page states the product purpose, primary slogan, Sample entry, personal-upload entry, feature overview, workflow, and documentation call to action. |
| `/library` | Pass | Sample Library is backed by dedicated read-only endpoints and carries persistent `Sample content · read-only · fictional clips` labeling, regardless of login state. |
| `/collections` | Pass | Collections are separated from the library grid and include a visible selected-clip working pile plus transparent AI grouping explanation. |
| `/ask` | Pass | Creative questioning is a dedicated workspace with a visible clip-evidence pile and grounded-context explanation. |
| `/docs` | Pass | Documentation gives a product overview, sample-mode explanation, feature-by-feature purpose and steps, privacy notes, and prototype boundaries. |

### Mobile route verification

Collections and Ask My Footage were additionally checked at a 390 px viewport. Collections keeps its action, working pile, collection cards, and suggestion explanation in a readable single-column sequence. Ask My Footage keeps its clip-evidence grid, context count, prompt surface, composer, and feature-boundary note visible without overlap. Together with the earlier Landing, Sample Library, and Documentation checks, all five primary routes have now been verified on mobile.

## My Library isolation fix

The dedicated `/my-library` route was checked on desktop and at a 390 px mobile viewport. It renders the authenticated workspace’s uploaded clips, carries a persistent `My Library · private workspace` label, and uses personal-only query endpoints for listing, searching, and finding similar clips. `/library` continues to show the separately labeled read-only fictional Sample Library. The responsive navigation exposes both destinations, and the upload flow now invalidates personal queries before taking a successful upload to My Library.

The post-upload policy is covered by deterministic tests: after at least one successful media save, the uploader refreshes only `personalList`, `personalSearch`, and `personalSimilar`. A fully successful selection automatically opens My Library; a mixed selection remains in the upload dialog so its failed job is visible and exposes an explicit **Open My Library** action for the completed clips. The Sample Library uses distinct read-only endpoints and is not refreshed or replaced by this personal-upload policy.

Both library pages now consume a strict front-end source view model. My Library accepts only responses marked `personal`, while Sample Library accepts only responses marked `sample`. The accompanying view-model tests confirm a new personal clip reaches the My Library rendering source and that the same sample response is discarded by My Library rather than appearing as a user upload.

On an all-successful upload selection, the upload desk now refreshes the personal queries and opens `/my-library?uploaded=1`. My Library reads the refreshed `personal` source and shows an in-context confirmation only when it contains personal clips. This makes the post-upload handoff explicit to the creator while preserving the independent Sample Library route and data source.

The post-upload route was visually checked with the `uploaded=1` state. My Library visibly shows the private-workspace label, the success confirmation, and the user-owned clip cards. The Sample Library was checked alongside it and retained its `Sample content · read-only · fictional clips` label and demo imagery, with no personal-upload confirmation or personal clips present.

## Editing Projects & Sample Separation Update

| Surface | Result | Notes |
| --- | --- | --- |
| `/my-library`, desktop | Pass | The private Workspace presents an editing-project rail, loose-clip view, project-scoped upload action, clip project selector, removal action, and an original-media preview panel with play and scrub controls. |
| `/sample`, desktop | Pass | The Sample Playground carries persistent public-demo labeling and a dedicated list of fictional sample collections; it does not link its selection into private Collections. |
| `/collections`, desktop | Pass | Collections states that it contains private Workspace selections, directs users to My Projects for clips, and keeps sample content out of its data source. |
| `/my-library`, `/sample`, `/collections`, 375 px | Pass | The project rail, sample cards, sample collection list, private collection desk, preview/removal controls, and scrollable compact navigation remain available without overlap. |

The CLI `organize` flow was smoke-tested in a temporary folder. It indexed a local video placeholder, printed the proposed source and destination, copied only after the explicit confirmation flag, preserved the relative destination path, and left the source file byte-identical and in place.

## Projects-Collections Merge Update

**Validated:** 2026-08-29

Collections and editing projects were merged into a single Projects model, so the earlier `/collections` route no longer exists and the sections above that reference it are historical.

| Surface | Result | Notes |
| --- | --- | --- |
| `/my-library`, desktop | Pending re-check | The private Workspace now renders an editing-project rail, a one-click create form, a **Suggested projects** section (one-tap Make), loose-clip view, project-scoped upload action, and an original-media preview panel with play and scrub controls. |
| `/my-library`, 375 px | Pending re-check | Project rail, suggested groups, filter pills, single-column cards, the focused-clip note (now a Projects check-list), and the sticky selection action bar should stack without overlap. |

Behavior changes since the sections above were written: selection-to-collection became **Create project from selection** and **Add to project** on the selection action bar; the focused-clip note now toggles clip membership across projects (many-to-many) instead of a single-move selector; the Sample Playground no longer shows sample collections and instead shows read-only sample project groupings. A manual desktop + 375 px re-check is still open for both `/my-library` states.

## Auth Removal Update (Phase B)

**Validated:** 2026-08-31

The app is now a single-user local workspace with no auth surface. OAuth routes, the JWT/session SDK, the login/logout UI, the `auth.me` endpoint, the admin procedure, owner notifications, and the `axios`/`jose`/`cookie` dependencies were removed. Every request `createContext` resolves to the persisted prototype user (`framefind-prototype-workspace`).

| Surface | Result | Notes |
| --- | --- | --- |
| `/my-library`, desktop + mobile | Pending re-check | The header now shows a static `Local workspace` chip instead of Sign in / avatar; the sidebar workspace note reads "Local workspace. No login is required…". No workspace-unavailable gate remains. The "Workspace unavailable" empty-state section was deleted. |

Notes: `protectedProcedure`/`publicProcedure` remain (`protected` just scopes to the workspace user and always passes). Legacy dead core modules that referenced the removed Forge env (`map`, `dataApi`, `heartbeat`, `voiceTranscription`, `imageGeneration`) were deleted. A full desktop + 375 px re-check of the header and My Library is still open.
