import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { CheckCircle, Loader, AlertCircle } from "lucide-react";
import api from "../api/axios";

export default function AcceptInvitePage() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  // Validate token on load
  const {
    data: inviteData,
    isLoading: validating,
    error: tokenError,
  } = useQuery({
    queryKey: ["invite", token],
    queryFn: async () => {
      const res = await api.get(`/auth/invite/${token}`);
      return res.data as {
        email: string;
        role: string;
        tenantName: string;
      };
    },
    enabled: !!token,
    retry: false,
  });

  // Accept invite mutation
  const acceptInvite = useMutation({
    mutationFn: async () => {
      const res = await api.post("/auth/invite/accept", {
        token,
        name: name.trim(),
        password,
      });
      return res.data;
    },
    onSuccess: () => {
      setSuccess(true);
      setTimeout(() => navigate("/login"), 3000);
    },
    onError: (err: any) => {
      setError(err.response?.data?.error || "Failed to create account");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    acceptInvite.mutate();
  };

  // ── Loading state ─────────────────────────────────────────────────────────
  if (validating) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Loader
            size={24}
            className="animate-spin text-blue-600 mx-auto mb-3"
          />
          <p className="text-sm text-gray-500">Validating invite link…</p>
        </div>
      </div>
    );
  }

  // ── Invalid token ─────────────────────────────────────────────────────────
  if (tokenError || !inviteData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div
          className="bg-white p-8 rounded-xl border border-gray-200 shadow-sm
                        w-full max-w-md text-center"
        >
          <div
            className="w-12 h-12 bg-red-100 rounded-full flex items-center
                          justify-center mx-auto mb-4"
          >
            <AlertCircle size={22} className="text-red-500" />
          </div>
          <h1 className="text-lg font-semibold text-gray-900 mb-2">
            Invalid or expired invite
          </h1>
          <p className="text-sm text-gray-500 mb-6">
            This invite link is invalid, has already been used, or has expired.
            Please ask your admin to send a new invite.
          </p>
          <button
            onClick={() => navigate("/login")}
            className="text-sm text-blue-600 hover:text-blue-700 font-medium"
          >
            Go to login →
          </button>
        </div>
      </div>
    );
  }

  // ── Success state ─────────────────────────────────────────────────────────
  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div
          className="bg-white p-8 rounded-xl border border-gray-200 shadow-sm
                        w-full max-w-md text-center"
        >
          <div
            className="w-12 h-12 bg-green-100 rounded-full flex items-center
                          justify-center mx-auto mb-4"
          >
            <CheckCircle size={22} className="text-green-500" />
          </div>
          <h1 className="text-lg font-semibold text-gray-900 mb-2">
            Account created!
          </h1>
          <p className="text-sm text-gray-500">Redirecting you to login…</p>
        </div>
      </div>
    );
  }

  // ── Main form ─────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white p-8 rounded-xl border border-gray-200 shadow-sm w-full max-w-md">
        {/* Logo */}
        <div className="flex items-center gap-2 mb-6">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <span className="text-white text-sm font-bold">S</span>
          </div>
          <span className="text-lg font-semibold text-gray-900">StoreIT</span>
        </div>

        {/* Invite info */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
          <p className="text-sm font-medium text-blue-900">
            You've been invited to join
          </p>
          <p className="text-lg font-semibold text-blue-800 mt-0.5">
            {inviteData.tenantName}
          </p>
          <div className="flex items-center gap-3 mt-2">
            <span className="text-xs text-blue-700">{inviteData.email}</span>
            <span className="text-xs bg-blue-200 text-blue-800 px-2 py-0.5 rounded-full">
              {inviteData.role.replace("_", " ")}
            </span>
          </div>
        </div>

        <h1 className="text-lg font-semibold text-gray-900 mb-1">
          Create your account
        </h1>
        <p className="text-sm text-gray-500 mb-6">
          Set your name and password to get started
        </p>

        {error && (
          <div
            className="bg-red-50 border border-red-200 text-red-700 text-sm
                          px-4 py-3 rounded-lg mb-4"
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Your name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="John Smith"
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm
                         focus:outline-none focus:ring-2 focus:ring-blue-500
                         focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Min. 8 characters"
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm
                         focus:outline-none focus:ring-2 focus:ring-blue-500
                         focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Confirm password
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter password"
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm
                         focus:outline-none focus:ring-2 focus:ring-blue-500
                         focus:border-transparent"
            />
          </div>

          <button
            type="submit"
            disabled={acceptInvite.isPending || !name.trim()}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50
                       text-white font-medium py-2 px-4 rounded-lg text-sm
                       transition-colors"
          >
            {acceptInvite.isPending ? "Creating account…" : "Create account"}
          </button>
        </form>
      </div>
    </div>
  );
}
