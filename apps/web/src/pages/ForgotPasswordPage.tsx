import { useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/axios";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await api.post("/auth/forgot-password", { email });
      setSubmitted(true);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-8">
          <div className="text-center mb-6">
            <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center">
              <span className="text-white text-sm font-bold">F</span>
            </div>
            <h1 className="text-xl font-semibold text-gray-900">
              Forgot password?
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              {submitted
                ? "Check your inbox"
                : "Enter your email and we'll send a reset link"}
            </p>
          </div>

          {submitted ? (
            <div className="text-center space-y-4">
              <div className="w-14 h-14 bg-green-50 rounded-full flex items-center justify-center mx-auto">
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
              <p className="text-sm text-gray-600">
                If <strong>{email}</strong> is registered, you'll receive a
                reset link shortly.
              </p>
              <p className="text-xs text-gray-400">
                The link expires in 1 hour.
              </p>
              <Link
                to="/login"
                className="block text-sm text-primary-500 hover:underline mt-4"
              >
                Back to login
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
                  Email address
                </label>
                <input
                  type="email"
                  required
                  autoFocus
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  className="w-full border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2.5 text-sm
           bg-white dark:bg-gray-800 text-gray-900 dark:text-white
                          placeholder-gray-400 dark:placeholder-gray-500
                         focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
              {error && <p className="text-xs text-red-500">{error}</p>}
              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 bg-primary-600 text-white text-sm font-medium
                           rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors"
              >
                {loading ? "Sending…" : "Send reset link"}
              </button>
              <div className="text-center">
                <Link
                  to="/forgot-password"
                  className="text-xs text-gray-400 hover:text-primary-600 transition-colors"
                >
                  Forgot your password?
                </Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
