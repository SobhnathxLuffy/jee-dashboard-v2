import { describe, it, expect } from "vitest";
import type { SyllabusRow } from "@/lib/types";

describe("Syllabus chapter tier management", () => {
  const sampleSyllabus: SyllabusRow[] = [
    {
      id: "Physics:Rotational Motion",
      chapter: "Rotational Motion",
      subject: "Physics",
      tier: 1,
      status: "Not Started",
      notes: "",
      last_revised: null,
      revision_stage: 0,
      next_revision: null,
    },
    {
      id: "Chemistry:Solutions",
      chapter: "Solutions",
      subject: "Chemistry",
      tier: 2,
      status: "Learning",
      notes: "",
      last_revised: null,
      revision_stage: 0,
      next_revision: null,
    },
    {
      id: "Mathematics:Matrices",
      chapter: "Matrices",
      subject: "Mathematics",
      tier: 3,
      status: "PYQs Done",
      notes: "",
      last_revised: null,
      revision_stage: 0,
      next_revision: null,
    },
  ];

  it("allows updating chapter tier from Tier 3 to Tier 1", () => {
    const original = sampleSyllabus[2];
    const updated: SyllabusRow = { ...original, tier: 1 };

    expect(updated.tier).toBe(1);
    expect(updated.chapter).toBe("Matrices");
  });

  it("sorts chapters correctly when tier changes", () => {
    const list = [...sampleSyllabus];
    const sorter = (a: SyllabusRow, b: SyllabusRow) =>
      a.tier - b.tier || a.subject.localeCompare(b.subject);

    // Initial sort
    list.sort(sorter);
    expect(list[0].chapter).toBe("Rotational Motion");
    expect(list[1].chapter).toBe("Solutions");
    expect(list[2].chapter).toBe("Matrices");

    // Promote Matrices from Tier 3 to Tier 1
    const updatedList = list.map((item) =>
      item.chapter === "Matrices" ? { ...item, tier: 1 as const } : item
    );
    updatedList.sort(sorter);

    // Both Rotational Motion and Matrices are Tier 1; Matrices comes first or second based on subject
    const tier1Chapters = updatedList.filter((c) => c.tier === 1).map((c) => c.chapter);
    expect(tier1Chapters).toContain("Matrices");
    expect(tier1Chapters).toContain("Rotational Motion");
    expect(tier1Chapters).toHaveLength(2);
  });

  it("filters correctly by updated tier", () => {
    const updatedList: SyllabusRow[] = sampleSyllabus.map((item) =>
      item.chapter === "Solutions" ? { ...item, tier: 1 as const } : item
    );

    const tier1Rows = updatedList.filter((r) => r.tier === 1);
    const tier2Rows = updatedList.filter((r) => r.tier === 2);

    expect(tier1Rows.map((r) => r.chapter)).toEqual(["Rotational Motion", "Solutions"]);
    expect(tier2Rows).toHaveLength(0);
  });
});
