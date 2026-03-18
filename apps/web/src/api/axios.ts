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
        const refresh = await axios.post(
          `${import.meta.env.VITE_API_URL || "http://localhost:5000/api"}/auth/refresh`,
          {},
          { withCredentials: true },
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
    return Promise.reject(error);
  },
);

export default api;
