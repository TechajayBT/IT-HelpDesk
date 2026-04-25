/**
 * Axios API Client
 *
 * Centralized HTTP client configuration. All API calls go through this instance.
 *
 * Features:
 * 1. Base URL from environment (REACT_APP_API_URL)
 * 2. Request interceptor: automatically attaches JWT Authorization header
 * 3. Response interceptor: normalizes errors and handles 401 (expired session)
 *
 * Why a single instance?
 * - One place to update the base URL, headers, or timeout
 * - Interceptors apply to every request/response without repeating code
 * - Easy to mock in tests
 */

import axios from "axios";

// Create a dedicated axios instance — does NOT use the global axios defaults
// so multiple instances with different configs can coexist
const apiClient = axios.create({
  baseURL: process.env.REACT_APP_API_URL || "http://localhost:5000/api",
  timeout: 30_000, // 30 second timeout — generous for file uploads
  headers: {
    "Content-Type": "application/json",
  },
});

// ── Request Interceptor ───────────────────────────────────────────────────────
// Runs before every request is sent.
// Reads the JWT from localStorage and adds it to the Authorization header.
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("helpdesk_token");

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
  },
  (error) => {
    // Request setup failed (e.g., network error before the request was sent)
    console.error("[API] Request setup error:", error);
    return Promise.reject(error);
  }
);

// ── Response Interceptor ──────────────────────────────────────────────────────
// Runs after every response is received (or fails).
// 2xx responses pass through unchanged.
// Non-2xx responses are normalized into a consistent error shape.
apiClient.interceptors.response.use(
  (response) => response, // Success — pass through unchanged

  (error) => {
    const status = error.response?.status;
    const errorData = error.response?.data?.error;

    // ── 401 Unauthorized: token expired or invalid ──────────────────────
    // Clear stored credentials and redirect to login so the user can re-authenticate.
    // This handles the case where the JWT expired while the user had the app open.
    if (status === 401) {
      console.warn("[API] 401 received — clearing session and redirecting to login");
      localStorage.removeItem("helpdesk_token");
      localStorage.removeItem("helpdesk_user");

      // Only redirect if not already on the login/register page to avoid loops
      if (!window.location.pathname.includes("/login") && !window.location.pathname.includes("/register")) {
        window.location.href = "/login?session=expired";
      }
    }

    // ── Normalize the error ────────────────────────────────────────────
    // The backend always returns { success: false, error: { code, message, details } }
    // We extract that shape here so every .catch() handler receives a consistent object.
    const normalizedError = {
      status,
      code: errorData?.code || "UNKNOWN_ERROR",
      message: errorData?.message || error.message || "An unexpected error occurred",
      details: errorData?.details || [],
    };

    // Log API errors in development for easier debugging
    if (process.env.NODE_ENV === "development") {
      console.error("[API] Error:", {
        url: error.config?.url,
        method: error.config?.method?.toUpperCase(),
        status,
        ...normalizedError,
      });
    }

    return Promise.reject(normalizedError);
  }
);

export default apiClient;
