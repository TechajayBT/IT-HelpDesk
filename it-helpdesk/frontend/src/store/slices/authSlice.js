/**
 * Auth Redux Slice
 *
 * Manages the global authentication state:
 * - user: the current logged-in user object (or null)
 * - token: the JWT string (or null)
 * - isAuthenticated: derived boolean
 * - isLoading: true while checking a stored token on app startup
 *
 * Why Redux for auth instead of just localStorage?
 * - All components can subscribe to auth changes without prop drilling
 * - Dispatching logout() from any component instantly clears state everywhere
 * - Middleware (route guards) can read auth state synchronously
 *
 * Token storage:
 * - Stored in localStorage for persistence across page refreshes
 * - Read back on app startup (bootstrapAuth thunk below)
 * - Cleared on logout or 401 response (in apiClient interceptor)
 */

import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import { authApi } from "../../services/api";

// ── localStorage keys ─────────────────────────────────────────────────────────
// Using namespaced keys to avoid collisions with other apps on the same domain
const TOKEN_KEY = "helpdesk_token";
const USER_KEY = "helpdesk_user";

// ── Async thunks ──────────────────────────────────────────────────────────────

/**
 * bootstrapAuth
 *
 * Called once when the app mounts. Checks localStorage for a stored token and
 * validates it against the server's /api/auth/me endpoint.
 *
 * If the token is expired, the API returns 401, the interceptor clears storage,
 * and this thunk rejects — the user lands on the login page.
 */
export const bootstrapAuth = createAsyncThunk(
  "auth/bootstrap",
  async (_, { rejectWithValue }) => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      return rejectWithValue("No token found");
    }
    try {
      const user = await authApi.getMe();
      return { user, token };
    } catch (error) {
      // Token is invalid or expired — clear it
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      return rejectWithValue(error.message);
    }
  }
);

/**
 * loginUser
 *
 * Authenticates, stores token/user in localStorage, and updates Redux state.
 */
export const loginUser = createAsyncThunk(
  "auth/login",
  async ({ email, password }, { rejectWithValue }) => {
    try {
      const { user, token } = await authApi.login(email, password);
      // Persist to localStorage for next page load
      localStorage.setItem(TOKEN_KEY, token);
      localStorage.setItem(USER_KEY, JSON.stringify(user));
      return { user, token };
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

/**
 * registerUser
 *
 * Registers and auto-logs in (backend returns token on successful registration).
 */
export const registerUser = createAsyncThunk(
  "auth/register",
  async (payload, { rejectWithValue }) => {
    try {
      const { user, token } = await authApi.register(payload);
      localStorage.setItem(TOKEN_KEY, token);
      localStorage.setItem(USER_KEY, JSON.stringify(user));
      return { user, token };
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

/**
 * logoutUser
 *
 * Calls logout endpoint, clears localStorage, resets state.
 */
export const logoutUser = createAsyncThunk("auth/logout", async () => {
  try {
    await authApi.logout(); // Best-effort server-side logout
  } catch {
    // Ignore errors on logout — we clear local state regardless
  } finally {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }
});

// ── Slice ─────────────────────────────────────────────────────────────────────

const authSlice = createSlice({
  name: "auth",
  initialState: {
    user: null,
    token: null,
    isAuthenticated: false,
    isLoading: true, // true until bootstrapAuth resolves
    error: null,
  },
  reducers: {
    /**
     * clearError — Reset the error field.
     * Call this when the user starts typing to dismiss the error banner.
     */
    clearError: (state) => {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    // ── bootstrapAuth ─────────────────────────────────────────────────────
    builder
      .addCase(bootstrapAuth.pending, (state) => {
        state.isLoading = true;
      })
      .addCase(bootstrapAuth.fulfilled, (state, action) => {
        state.isLoading = false;
        state.isAuthenticated = true;
        state.user = action.payload.user;
        state.token = action.payload.token;
      })
      .addCase(bootstrapAuth.rejected, (state) => {
        state.isLoading = false;
        state.isAuthenticated = false;
        state.user = null;
        state.token = null;
      });

    // ── loginUser ─────────────────────────────────────────────────────────
    builder
      .addCase(loginUser.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(loginUser.fulfilled, (state, action) => {
        state.isLoading = false;
        state.isAuthenticated = true;
        state.user = action.payload.user;
        state.token = action.payload.token;
        state.error = null;
      })
      .addCase(loginUser.rejected, (state, action) => {
        state.isLoading = false;
        state.isAuthenticated = false;
        state.error = action.payload; // Error message string
      });

    // ── registerUser ──────────────────────────────────────────────────────
    builder
      .addCase(registerUser.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(registerUser.fulfilled, (state, action) => {
        state.isLoading = false;
        state.isAuthenticated = true;
        state.user = action.payload.user;
        state.token = action.payload.token;
        state.error = null;
      })
      .addCase(registerUser.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload;
      });

    // ── logoutUser ────────────────────────────────────────────────────────
    builder.addCase(logoutUser.fulfilled, (state) => {
      state.isAuthenticated = false;
      state.user = null;
      state.token = null;
      state.isLoading = false;
      state.error = null;
    });
  },
});

export const { clearError } = authSlice.actions;

// ── Selectors ─────────────────────────────────────────────────────────────────
// Co-locate selectors with the slice so components don't hardcode state paths
export const selectUser = (state) => state.auth.user;
export const selectIsAuthenticated = (state) => state.auth.isAuthenticated;
export const selectAuthLoading = (state) => state.auth.isLoading;
export const selectAuthError = (state) => state.auth.error;
export const selectUserRole = (state) => state.auth.user?.role;

export default authSlice.reducer;
