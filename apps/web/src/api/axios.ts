import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:5000/api",
  withCredentials: true,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("access_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    if (
      error.response?.status === 401 &&
      error.response?.data?.error === "TOKEN_EXPIRED" &&
      !original._retry
    ) {
      original._retry = true;
      try {
        // SEC FIX #6: include X-Requested-With header so the backend
        // CSRF check on /auth/refresh passes. Browsers cannot set this
        // header on cross-origin requests, blocking CSRF attacks.
        const refresh = await axios.post(
          `${import.meta.env.VITE_API_URL || "http://localhost:5000/api"}/auth/refresh`,
          {},
          {
            withCredentials: true,
            headers: { "X-Requested-With": "XMLHttpRequest" },
          },
        );
        const newToken = refresh.data.accessToken;
        localStorage.setItem("access_token", newToken);
        original.headers.Authorization = `Bearer ${newToken}`;
        return api(original);
      } catch {
        localStorage.removeItem("access_token");
        window.location.href = "/login";
      }
    }
    // Handle account disabled or tenant suspended
    if (
      error.response?.status === 401 &&
      error.response?.data?.error === "ACCOUNT_DISABLED"
    ) {
      localStorage.removeItem("access_token");
      window.location.href = "/login?reason=disabled";
      return Promise.reject(error);
    }
    if (
      error.response?.status === 403 &&
      error.response?.data?.error === "TENANT_SUSPENDED"
    ) {
      localStorage.removeItem("access_token");
      window.location.href = "/login?reason=suspended";
      return Promise.reject(error);
    }
    return Promise.reject(error);
  },
);

export default api;
