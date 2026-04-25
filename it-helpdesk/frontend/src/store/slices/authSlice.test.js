/**
 * Auth Slice Unit Tests
 *
 * Tests the Redux auth slice reducers and selectors.
 * Async thunks are tested by dispatching them against a real store
 * with mocked API services.
 */

import { configureStore } from "@reduxjs/toolkit";
import authReducer, {
  clearError,
  loginUser,
  registerUser,
  logoutUser,
  selectUser,
  selectIsAuthenticated,
  selectAuthError,
  selectUserRole,
} from "../../store/slices/authSlice";

// Mock the API service module so we don't make real HTTP calls
jest.mock("../../services/api", () => ({
  authApi: {
    login: jest.fn(),
    register: jest.fn(),
    logout: jest.fn(),
    getMe: jest.fn(),
  },
}));

import { authApi } from "../../services/api";

// ── Store factory ─────────────────────────────────────────────────────────────
// Creates a fresh store for each test so state doesn't bleed between tests
const makeStore = (preloadedState = {}) =>
  configureStore({
    reducer: { auth: authReducer },
    preloadedState,
  });

// ── Mock localStorage ─────────────────────────────────────────────────────────
const localStorageMock = (() => {
  let store = {};
  return {
    getItem: jest.fn((key) => store[key] ?? null),
    setItem: jest.fn((key, value) => { store[key] = value; }),
    removeItem: jest.fn((key) => { delete store[key]; }),
    clear: jest.fn(() => { store = {}; }),
  };
})();
Object.defineProperty(window, "localStorage", { value: localStorageMock });

// ─────────────────────────────────────────────────────────────────────────────
// INITIAL STATE
// ─────────────────────────────────────────────────────────────────────────────

describe("authSlice initial state", () => {
  it("has correct initial values", () => {
    const store = makeStore();
    const state = store.getState().auth;

    expect(state.user).toBeNull();
    expect(state.token).toBeNull();
    expect(state.isAuthenticated).toBe(false);
    expect(state.isLoading).toBe(true); // true until bootstrapAuth resolves
    expect(state.error).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// REDUCERS
// ─────────────────────────────────────────────────────────────────────────────

describe("clearError reducer", () => {
  it("clears the error field", () => {
    const store = makeStore({ auth: { user: null, token: null, isAuthenticated: false, isLoading: false, error: "Some error" } });
    store.dispatch(clearError());
    expect(store.getState().auth.error).toBeNull();
  });

  it("is a no-op when error is already null", () => {
    const store = makeStore({ auth: { user: null, token: null, isAuthenticated: false, isLoading: false, error: null } });
    store.dispatch(clearError());
    expect(store.getState().auth.error).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// loginUser THUNK
// ─────────────────────────────────────────────────────────────────────────────

describe("loginUser thunk", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorageMock.clear();
  });

  const mockUser = { _id: "u1", email: "test@test.com", role: "requester", firstName: "Test", lastName: "User" };
  const mockToken = "mock.jwt.token";

  it("sets isAuthenticated and user on success", async () => {
    authApi.login.mockResolvedValue({ user: mockUser, token: mockToken });
    const store = makeStore();

    await store.dispatch(loginUser({ email: "test@test.com", password: "pass" }));

    const state = store.getState().auth;
    expect(state.isAuthenticated).toBe(true);
    expect(state.user).toEqual(mockUser);
    expect(state.token).toBe(mockToken);
    expect(state.error).toBeNull();
    expect(state.isLoading).toBe(false);
  });

  it("persists token to localStorage on success", async () => {
    authApi.login.mockResolvedValue({ user: mockUser, token: mockToken });
    const store = makeStore();

    await store.dispatch(loginUser({ email: "test@test.com", password: "pass" }));

    expect(localStorageMock.setItem).toHaveBeenCalledWith("helpdesk_token", mockToken);
  });

  it("sets error and keeps unauthenticated on failure", async () => {
    authApi.login.mockRejectedValue({ message: "Invalid email or password." });
    const store = makeStore();

    await store.dispatch(loginUser({ email: "x@x.com", password: "wrong" }));

    const state = store.getState().auth;
    expect(state.isAuthenticated).toBe(false);
    expect(state.user).toBeNull();
    expect(state.error).toBe("Invalid email or password.");
    expect(state.isLoading).toBe(false);
  });

  it("sets isLoading=true while pending", () => {
    // Create a promise that never resolves to capture the pending state
    authApi.login.mockReturnValue(new Promise(() => {}));
    const store = makeStore();

    store.dispatch(loginUser({ email: "x@x.com", password: "pass" }));

    // Check state synchronously — the thunk is still pending
    expect(store.getState().auth.isLoading).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// registerUser THUNK
// ─────────────────────────────────────────────────────────────────────────────

describe("registerUser thunk", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorageMock.clear();
  });

  it("sets isAuthenticated on successful registration", async () => {
    const mockUser = { _id: "u2", email: "new@test.com", role: "requester" };
    authApi.register.mockResolvedValue({ user: mockUser, token: "new.token" });
    const store = makeStore();

    await store.dispatch(registerUser({ firstName: "New", lastName: "User", email: "new@test.com", password: "pass" }));

    expect(store.getState().auth.isAuthenticated).toBe(true);
    expect(store.getState().auth.user).toEqual(mockUser);
  });

  it("stores token in localStorage on success", async () => {
    authApi.register.mockResolvedValue({ user: { _id: "u2" }, token: "reg.token" });
    const store = makeStore();

    await store.dispatch(registerUser({ firstName: "A", lastName: "B", email: "a@b.com", password: "p" }));

    expect(localStorageMock.setItem).toHaveBeenCalledWith("helpdesk_token", "reg.token");
  });

  it("sets error on registration failure", async () => {
    authApi.register.mockRejectedValue({ message: "Email already exists." });
    const store = makeStore();

    await store.dispatch(registerUser({ email: "dup@test.com", password: "pass" }));

    expect(store.getState().auth.error).toBe("Email already exists.");
    expect(store.getState().auth.isAuthenticated).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// logoutUser THUNK
// ─────────────────────────────────────────────────────────────────────────────

describe("logoutUser thunk", () => {
  beforeEach(() => jest.clearAllMocks());

  it("clears auth state on logout", async () => {
    authApi.logout.mockResolvedValue();
    const store = makeStore({
      auth: {
        user: { _id: "u1", email: "t@t.com", role: "requester" },
        token: "some.token",
        isAuthenticated: true,
        isLoading: false,
        error: null,
      },
    });

    await store.dispatch(logoutUser());

    const state = store.getState().auth;
    expect(state.isAuthenticated).toBe(false);
    expect(state.user).toBeNull();
    expect(state.token).toBeNull();
  });

  it("removes token from localStorage", async () => {
    authApi.logout.mockResolvedValue();
    const store = makeStore();

    await store.dispatch(logoutUser());

    expect(localStorageMock.removeItem).toHaveBeenCalledWith("helpdesk_token");
    expect(localStorageMock.removeItem).toHaveBeenCalledWith("helpdesk_user");
  });

  it("still clears state even if logout API call fails", async () => {
    // logout should always clear local state regardless of server response
    authApi.logout.mockRejectedValue(new Error("Network error"));
    const store = makeStore({
      auth: {
        user: { _id: "u1" },
        token: "t",
        isAuthenticated: true,
        isLoading: false,
        error: null,
      },
    });

    await store.dispatch(logoutUser());

    expect(store.getState().auth.isAuthenticated).toBe(false);
    expect(store.getState().auth.user).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SELECTORS
// ─────────────────────────────────────────────────────────────────────────────

describe("auth selectors", () => {
  const mockState = {
    auth: {
      user: { _id: "u1", email: "a@b.com", role: "agent", firstName: "Bob" },
      token: "tok",
      isAuthenticated: true,
      isLoading: false,
      error: "some error",
    },
  };

  it("selectUser returns user object", () => {
    expect(selectUser(mockState)).toEqual(mockState.auth.user);
  });

  it("selectIsAuthenticated returns boolean", () => {
    expect(selectIsAuthenticated(mockState)).toBe(true);
    expect(selectIsAuthenticated({ auth: { ...mockState.auth, isAuthenticated: false } })).toBe(false);
  });

  it("selectAuthError returns error string", () => {
    expect(selectAuthError(mockState)).toBe("some error");
  });

  it("selectUserRole returns role string", () => {
    expect(selectUserRole(mockState)).toBe("agent");
  });

  it("selectUserRole returns undefined when user is null", () => {
    const noUser = { auth: { ...mockState.auth, user: null } };
    expect(selectUserRole(noUser)).toBeUndefined();
  });
});
