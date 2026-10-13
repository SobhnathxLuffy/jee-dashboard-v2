import { describe, it, expect } from "vitest";
import { fmtSecs, todayStr } from "@/lib/types";

describe("fmtSecs", () => {
  it("formats zero seconds", () => {
    expect(fmtSecs(0)).toBe("0m 00s");
  });

  it("formats sub-minute seconds with zero-padding", () => {
    expect(fmtSecs(5)).toBe("0m 05s");
    expect(fmtSecs(30)).toBe("0m 30s");
    expect(fmtSecs(59)).toBe("0m 59s");
  });

  it("formats exact minutes", () => {
    expect(fmtSecs(60)).toBe("1m 00s");
    expect(fmtSecs(120)).toBe("2m 00s");
    expect(fmtSecs(600)).toBe("10m 00s");
  });

  it("does NOT show '0m 60s' for inputs in [59.5, 60) — the bug fix", () => {
    // Before fix: Math.floor(59.5/60)=0, Math.round(59.5%60)=60 → "0m 60s"
    // After fix:  Math.round(59.5)=60 → 1m 00s
    expect(fmtSecs(59.5)).toBe("1m 00s");
    expect(fmtSecs(59.6)).toBe("1m 00s");
    expect(fmtSecs(59.9)).toBe("1m 00s");
  });

  it("formats minutes + seconds", () => {
    expect(fmtSecs(65)).toBe("1m 05s");
    expect(fmtSecs(125)).toBe("2m 05s");
    expect(fmtSecs(599)).toBe("9m 59s");
  });

  it("switches to hours at 60 minutes", () => {
    expect(fmtSecs(3600)).toBe("1h 0m");
    expect(fmtSecs(3665)).toBe("1h 1m");
    expect(fmtSecs(7200)).toBe("2h 0m");
  });
});

describe("todayStr", () => {
  it("returns a YYYY-MM-DD string in local time (not UTC)", () => {
    const s = todayStr();
    expect(s).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // Must match the local date components, not Date().toISOString() (UTC).
    const d = new Date();
    const expected = `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, "0")}-${`${d.getDate()}`.padStart(2, "0")}`;
    expect(s).toBe(expected);
  });
});
