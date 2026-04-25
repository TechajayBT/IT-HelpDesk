/**
 * Frontend Utility Tests
 *
 * Tests for src/utils/helpers.js
 * Pure functions — no DOM, no network, no React needed.
 */

import {
  formatDate,
  formatDateTime,
  timeAgo,
  getStatusClasses,
  getPriorityClasses,
  STATUS_STEPS,
  getStatusStepIndex,
  truncate,
  formatFileSize,
  buildQueryString,
  getInitials,
} from "../../utils/helpers";

// ── formatDate ────────────────────────────────────────────────────────────────

describe("formatDate", () => {
  it("formats a valid ISO date string", () => {
    expect(formatDate("2026-04-11T10:30:00.000Z")).toMatch(/Apr 11, 2026/);
  });

  it("returns em dash for null/undefined", () => {
    expect(formatDate(null)).toBe("—");
    expect(formatDate(undefined)).toBe("—");
    expect(formatDate("")).toBe("—");
  });

  it("returns 'Invalid date' for garbage input", () => {
    expect(formatDate("not-a-date")).toBe("Invalid date");
  });
});

// ── formatDateTime ────────────────────────────────────────────────────────────

describe("formatDateTime", () => {
  it("includes time portion", () => {
    const result = formatDateTime("2026-04-11T14:32:00.000Z");
    expect(result).toContain("2026");
    expect(result).toContain("at");
  });

  it("returns em dash for null", () => {
    expect(formatDateTime(null)).toBe("—");
  });
});

// ── getStatusClasses ──────────────────────────────────────────────────────────

describe("getStatusClasses", () => {
  const statuses = ["Created", "Assigned", "Started", "Completed", "Blocked"];

  it("returns a non-empty string for every valid status", () => {
    statuses.forEach((s) => {
      const cls = getStatusClasses(s);
      expect(typeof cls).toBe("string");
      expect(cls.length).toBeGreaterThan(0);
    });
  });

  it("each status gets a distinct class string", () => {
    const classes = statuses.map(getStatusClasses);
    const unique = new Set(classes);
    expect(unique.size).toBe(statuses.length);
  });

  it("returns a fallback string for unknown statuses", () => {
    expect(getStatusClasses("Unknown")).toBeTruthy();
  });
});

// ── getPriorityClasses ────────────────────────────────────────────────────────

describe("getPriorityClasses", () => {
  it("returns distinct classes for Low, High, Critical", () => {
    const low = getPriorityClasses("Low");
    const high = getPriorityClasses("High");
    const critical = getPriorityClasses("Critical");
    expect(low).not.toBe(high);
    expect(high).not.toBe(critical);
    expect(low).not.toBe(critical);
  });

  it("each value contains valid Tailwind-style class tokens", () => {
    ["Low", "High", "Critical"].forEach((p) => {
      const cls = getPriorityClasses(p);
      expect(cls).toMatch(/bg-/);
      expect(cls).toMatch(/text-/);
    });
  });
});

// ── STATUS_STEPS & getStatusStepIndex ─────────────────────────────────────────

describe("STATUS_STEPS", () => {
  it("has exactly 4 ordered steps", () => {
    expect(STATUS_STEPS).toEqual(["Created", "Assigned", "Started", "Completed"]);
  });
});

describe("getStatusStepIndex", () => {
  it("returns correct 0-based index for each step", () => {
    expect(getStatusStepIndex("Created")).toBe(0);
    expect(getStatusStepIndex("Assigned")).toBe(1);
    expect(getStatusStepIndex("Started")).toBe(2);
    expect(getStatusStepIndex("Completed")).toBe(3);
  });

  it("returns -1 for Blocked (special state outside the main flow)", () => {
    expect(getStatusStepIndex("Blocked")).toBe(-1);
  });
});

// ── truncate ──────────────────────────────────────────────────────────────────

describe("truncate", () => {
  it("leaves strings shorter than maxLen unchanged", () => {
    expect(truncate("short", 80)).toBe("short");
  });

  it("truncates strings longer than maxLen with ellipsis", () => {
    const long = "a".repeat(100);
    const result = truncate(long, 80);
    expect(result.length).toBe(83); // 80 chars + "..."
    expect(result.endsWith("...")).toBe(true);
  });

  it("handles null/undefined gracefully", () => {
    expect(truncate(null)).toBe("");
    expect(truncate(undefined)).toBe("");
  });

  it("uses 80 as default max length", () => {
    const exactly80 = "x".repeat(80);
    expect(truncate(exactly80)).toBe(exactly80); // exactly 80 → no truncation
    const over80 = "x".repeat(81);
    expect(truncate(over80).endsWith("...")).toBe(true);
  });
});

// ── formatFileSize ────────────────────────────────────────────────────────────

describe("formatFileSize", () => {
  it("formats bytes correctly", () => {
    expect(formatFileSize(0)).toBe("0 B");
    expect(formatFileSize(512)).toBe("512 B");
  });

  it("formats kilobytes correctly", () => {
    expect(formatFileSize(1024)).toBe("1 KB");
    expect(formatFileSize(1536)).toBe("1.5 KB");
  });

  it("formats megabytes correctly", () => {
    expect(formatFileSize(1048576)).toBe("1 MB");
    expect(formatFileSize(5242880)).toBe("5 MB");
  });

  it("formats gigabytes correctly", () => {
    expect(formatFileSize(1073741824)).toBe("1 GB");
  });
});

// ── buildQueryString ──────────────────────────────────────────────────────────

describe("buildQueryString", () => {
  it("builds a query string from an object", () => {
    const qs = buildQueryString({ page: 1, limit: 10 });
    expect(qs).toContain("page=1");
    expect(qs).toContain("limit=10");
  });

  it("omits empty string values", () => {
    const qs = buildQueryString({ page: 1, status: "", priority: "High" });
    expect(qs).not.toContain("status");
    expect(qs).toContain("priority=High");
  });

  it("omits null and undefined values", () => {
    const qs = buildQueryString({ search: null, category: undefined, page: 2 });
    expect(qs).toBe("page=2");
  });

  it("returns empty string for all-empty object", () => {
    expect(buildQueryString({ a: "", b: null })).toBe("");
  });
});

// ── getInitials ───────────────────────────────────────────────────────────────

describe("getInitials", () => {
  it("returns uppercase initials of first and last name", () => {
    expect(getInitials("Alice", "Smith")).toBe("AS");
    expect(getInitials("john", "doe")).toBe("JD");
  });

  it("handles empty strings gracefully", () => {
    expect(getInitials("", "")).toBe("");
    expect(getInitials("Alice", "")).toBe("A");
    expect(getInitials("", "Smith")).toBe("S");
  });

  it("handles single-character names", () => {
    expect(getInitials("A", "B")).toBe("AB");
  });
});
