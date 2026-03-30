import { useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import api from "../api/axios";
import { apiErrorMessage } from "../utils/apiError";

export default function ResetPasswordPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const mismatch = confirm.length > 0 && password !== confirm;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mismatch || password.length < 8) return;
    setLoading(true);
    setError("");
    try {
      await api.post("/auth/reset-password", { token, password });
      setDone(true);
      setTimeout(() => navigate("/login"), 3000);
    } catch (err: unknown) {
      setError(
        apiErrorMessage(
          err,
          "This link is invalid or has expired.",
        ),
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-8">
          <div className="text-center mb-6">
            <div className="w-12 h-12 bg-primary-600 rounded-xl flex items-center justify-center mx-auto mb-4">
              <span className="text-white font-bold text-lg">S</span>
            </div>
            <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
              Set new password
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Choose a strong password for your account
            </p>
          </div>

          {done ? (
            <div className="text-center space-y-3">
              <div className="w-14 h-14 bg-green-50 dark:bg-green-950 rounded-full flex items-center justify-center mx-auto">
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#16a34a"
                  strokeWidth="2"
                >
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-300 font-medium">
                Password updated!
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500">
                Redirecting to login…
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
                  New password
                </label>
                <input
                  type="password"
                  required
                  autoFocus
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimum 8 characters"
                  className="w-full border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2.5 text-sm
                             bg-white dark:bg-gray-800 text-gray-900 dark:text-white
                             placeholder:text-gray-400 dark:placeholder:text-gray-500
                             focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
                  Confirm password
                </label>
                <input
                  type="password"
                  required
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className={`w-full border rounded-lg px-3 py-2.5 text-sm
                              bg-white dark:bg-gray-800 text-gray-900 dark:text-white
                              placeholder:text-gray-400 dark:placeholder:text-gray-500
                              focus:outline-none focus:ring-2 focus:ring-primary-500
                              ${
                                mismatch
                                  ? "border-red-300 dark:border-red-700"
                                  : "border-gray-300 dark:border-gray-700"
                              }`}
                />
                {mismatch && (
                  <p className="text-xs text-red-500 mt-1">
                    Passwords do not match
                  </p>
                )}
              </div>
              {error && (
                <div className="p-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg">
                  <p className="text-xs text-red-600 dark:text-red-400">
                    {error}
                  </p>
                </div>
              )}
              <button
                type="submit"
                disabled={loading || mismatch || password.length < 8}
                className="w-full py-2.5 bg-primary-600 text-white text-sm font-medium
                           rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors"
              >
                {loading ? "Updating…" : "Update password"}
              </button>
              <div className="text-center">
                <Link
                  to="/login"
                  className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  Back to login
                </Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
