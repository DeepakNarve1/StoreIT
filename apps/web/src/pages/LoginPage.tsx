import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuthStore } from "../store/authStore";
import api from "../api/axios";

export default function LoginPage() {
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await api.post("/auth/login", { email, password });
      setAuth(res.data.user, res.data.accessToken);
      navigate("/");
    } catch (err: any) {
      setError(err.response?.data?.error || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center ">
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 p-8 rounded-xl w-full max-w-md shadow-sm">
        {/* Logo */}
        <div className="flex items-center gap-2 mb-6">
          <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center">
            <span className="text-white text-sm font-bold">F</span>
          </div>
          <span className="text-lg font-semibold text-gray-900 dark:text-white">StoreIT</span>
        </div>

        <h1 className="text-xl font-semibold text-gray-900 dark:text-white mb-1">Sign in</h1>
        <p className="text-gray-500 dark:text-gray-400 text-sm mb-6">
          Enter your credentials to access your workspace
        </p>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg mb-4">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Email address
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              required
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg text-sm
                         placeholder-gray-400 dark:placeholder-gray-500
                         focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg text-sm
                         placeholder-gray-400 dark:placeholder-gray-500
                         focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>

          <div className="text-center mt-3">
            <Link
              to="/forgot-password"
              className="text-xs text-gray-400 hover:text-blue-600 transition-colors"
            >
              Forgot your password?
            </Link>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary-600 hover:bg-primary-700 disabled:opacity-50
                       text-white font-medium py-2 px-4 rounded-lg text-sm transition-colors"
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>

        <p className="text-xs text-gray-400 text-center mt-6">
          No account? Contact your admin for an invite.
        </p>
      </div>
    </div>
  );
}
