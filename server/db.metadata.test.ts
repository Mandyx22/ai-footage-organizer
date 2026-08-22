import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  drizzle: vi.fn(),
  insertValues: vi.fn(),
  selectRows: [] as unknown[][],
}));

vi.mock("drizzle-orm/mysql2", () => ({
  drizzle: mocks.drizzle,
}));

vi.mock("nanoid", () => ({
  nanoid: () => "metadata123456",
}));

function queryChain() {
  return {
    from: () => ({
      where: () => ({
        limit: async () => mocks.selectRows.shift() ?? [],
      }),
    }),
  };
}

async function loadDbModule() {
  vi.resetModules();
  process.env.DATABASE_URL = "mysql://user:password@example.invalid:3306/db";
  mocks.drizzle.mockReturnValue({
    insert: vi.fn(() => ({
      values: mocks.insertValues.mockResolvedValue(undefined),
    })),
    select: vi.fn(queryChain),
  });
  return import("./db");
}

describe("clip metadata persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.selectRows = [];
  });

  it("stores Metadata V2 and legacy compatibility columns for new analyzed clips", async () => {
    const metadata = {
      description: "a person sits beside a lake at sunset",
      observed: {
        visibleFacts: ["person seated", "lake", "sunset"],
        subjects: ["person", "lake"],
        setting: "lakeside",
        time: "sunset",
        lighting: ["warm sunset light"],
        colors: ["gold", "blue"],
        shotType: "medium-wide",
        cameraMotion: "static",
      },
      interpretation: {
        mood: ["quiet", "reflective"],
        sceneInterpretation: "a solitary lakeside pause",
        uncertainty: ["camera motion inferred from sampled frames only"],
      },
      creative: {
        editingUses: ["memory montage", "closing moment"],
      },
    };
    const row = { id: 123, clipKey: "clip_metadata123456" };
    mocks.selectRows = [[row]];
    const { createAnalyzedClip } = await loadDbModule();

    const result = await createAnalyzedClip({
      userId: 9,
      projectId: null,
      fileName: "lake.mov",
      mimeType: "video/quicktime",
      sizeBytes: 128,
      durationMs: 4_000,
      thumbnailKey: "thumbs/lake.jpg",
      thumbnailUrl: "/manus-storage/thumbs/lake.jpg",
      metadata,
    });

    expect(result).toBe(row);
    expect(mocks.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        description: metadata.description,
        subjects: JSON.stringify(metadata.observed.subjects),
        setting: metadata.observed.setting,
        timeOfDay: metadata.observed.time,
        lighting: JSON.stringify(metadata.observed.lighting),
        colors: JSON.stringify(metadata.observed.colors),
        moods: JSON.stringify(metadata.interpretation.mood),
        shotType: metadata.observed.shotType,
        cameraMotion: metadata.observed.cameraMotion,
        possibleUses: JSON.stringify(metadata.creative.editingUses),
        metadataJson: metadata,
      })
    );
  });
});
