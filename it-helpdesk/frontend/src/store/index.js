/**
 * Redux Store Configuration
 *
 * Using Redux Toolkit (RTK) which provides:
 * - configureStore: sets up Redux DevTools and thunk middleware automatically
 * - createSlice: combines actions + reducers in one file (see slices/)
 *
 * The store manages:
 * - auth: user session state (user object, token, loading/error)
 *
 * Server state (tickets lists, ticket details) is managed by React Query
 * because it handles caching, refetching, and background updates better
 * than Redux for async server data.
 */

import { configureStore } from "@reduxjs/toolkit";
import authReducer from "./slices/authSlice";

const store = configureStore({
  reducer: {
    auth: authReducer,
    // Future slices can be added here (e.g., uiSlice for sidebar state)
  },
  // RTK enables Redux DevTools in development automatically
  devTools: process.env.NODE_ENV !== "production",
});

export default store;
