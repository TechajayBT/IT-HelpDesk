/**
 * Jest Setup for Frontend Tests
 *
 * Runs before every test file.
 * - Imports jest-dom matchers (toBeInTheDocument, toHaveClass, etc.)
 * - Mocks window.matchMedia (not available in jsdom)
 * - Mocks IntersectionObserver (used by infinite scroll components)
 * - Adds custom matchers
 */

import "@testing-library/jest-dom";

// ── window.matchMedia mock ────────────────────────────────────────────────────
// jsdom doesn't implement matchMedia; components using responsive hooks need this.
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: jest.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

// ── IntersectionObserver mock ─────────────────────────────────────────────────
// Required for infinite scroll and lazy loading components.
const mockIntersectionObserver = jest.fn().mockImplementation(() => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn(),
}));
window.IntersectionObserver = mockIntersectionObserver;

// ── Suppress console.error for known React warnings in tests ──────────────────
// Comment this out when debugging unexpected errors
const originalError = console.error;
beforeAll(() => {
  console.error = (...args) => {
    // Filter out React act() warnings which are expected in async tests
    if (
      typeof args[0] === "string" &&
      (args[0].includes("act(") || args[0].includes("not wrapped in act"))
    ) {
      return;
    }
    originalError.call(console, ...args);
  };
});

afterAll(() => {
  console.error = originalError;
});
