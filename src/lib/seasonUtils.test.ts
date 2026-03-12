import { describe, it, expect } from "vitest";
import { normalizeSeasonString, extractSeasonFromText, yearForMonth } from "./seasonUtils";

describe("normalizeSeasonString", () => {
  it("parses 2025-26", () => {
    expect(normalizeSeasonString("2025-26")).toEqual({ startYear: 2025, endYear: 2026 });
  });

  it("parses 2025-2026", () => {
    expect(normalizeSeasonString("2025-2026")).toEqual({ startYear: 2025, endYear: 2026 });
  });

  it("recovers corrupt 2025-20", () => {
    expect(normalizeSeasonString("2025-20")).toEqual({ startYear: 2025, endYear: 2026 });
  });

  it("returns null for empty/undefined", () => {
    expect(normalizeSeasonString(undefined)).toBeNull();
    expect(normalizeSeasonString(null)).toBeNull();
    expect(normalizeSeasonString("")).toBeNull();
  });

  it("handles bare year contextually", () => {
    const result = normalizeSeasonString("2025");
    expect(result).not.toBeNull();
    expect(result!.endYear).toBe(result!.startYear + 1);
  });
});

describe("extractSeasonFromText", () => {
  it("prefers YYYY-YYYY over bare YYYY", () => {
    expect(extractSeasonFromText("Season 2025-2026 schedule")).toBe("2025-2026");
  });

  it("finds YYYY-YY", () => {
    expect(extractSeasonFromText("NBA 2025-26 Fantasy")).toBe("2025-26");
  });

  it("falls back to bare year", () => {
    expect(extractSeasonFromText("Fantasy Basketball 2026")).toBe("2026");
  });

  it("returns null when no year", () => {
    expect(extractSeasonFromText("no year here")).toBeNull();
  });
});

describe("yearForMonth", () => {
  const season = { startYear: 2025, endYear: 2026 };

  it("Oct-Dec → startYear", () => {
    expect(yearForMonth(9, season)).toBe(2025);
    expect(yearForMonth(10, season)).toBe(2025);
    expect(yearForMonth(11, season)).toBe(2025);
  });

  it("Jan-Aug → endYear", () => {
    expect(yearForMonth(0, season)).toBe(2026);
    expect(yearForMonth(2, season)).toBe(2026); // Mar
    expect(yearForMonth(7, season)).toBe(2026);
  });
});
