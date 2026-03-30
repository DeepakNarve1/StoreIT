import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { CheckCircle, Loader, AlertCircle, Mail } from "lucide-react";
import api from "../api/axios";
import { apiErrorMessage } from "../utils/apiError";

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
        roleProfile?: { id: string; name: string; baseRole: string } | null;
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
    onError: (err: unknown) => {
      setError(apiErrorMessage(err, "Failed to create account"));
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
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <div className="text-center">
          <Loader
            size={28}
            className="animate-spin text-primary-600 dark:text-primary-500 mx-auto mb-4"
          />
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
            Validating invite link…
          </p>
        </div>
      </div>
    );
  }

  // ── Invalid token ─────────────────────────────────────────────────────────
  if (tokenError || !inviteData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 p-4">
        <div
          className="bg-white dark:bg-gray-900 p-8 rounded-2xl border border-gray-200 
                        dark:border-gray-800 shadow-xl w-full max-w-md text-center"
        >
          <div
            className="w-14 h-14 bg-red-50 dark:bg-red-900/20 rounded-2xl flex items-center
                          justify-center mx-auto mb-5"
          >
            <AlertCircle size={24} className="text-red-500 dark:text-red-400" />
          </div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
            Invalid invite
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-8 leading-relaxed">
            This invite link is invalid, has already been used, or has expired.
            Please ask your admin to send a new invite to your inbox.
          </p>
          <button
            onClick={() => navigate("/login")}
            className="w-full py-2.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 
                       dark:hover:bg-gray-700 text-gray-900 dark:text-white 
                       text-sm font-semibold rounded-xl transition-all"
          >
            Back to login
          </button>
        </div>
      </div>
    );
  }

  // ── Success state ─────────────────────────────────────────────────────────
  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 p-4">
        <div
          className="bg-white dark:bg-gray-900 p-8 rounded-2xl border border-gray-200 
                        dark:border-gray-800 shadow-xl w-full max-w-md text-center"
        >
          <div
            className="w-14 h-14 bg-green-50 dark:bg-green-900/20 rounded-2xl flex items-center
                          justify-center mx-auto mb-5"
          >
            <CheckCircle
              size={24}
              className="text-green-500 dark:text-green-400"
            />
          </div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
            Welcome to StoreIT!
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Account created successfully. Redirecting you to login…
          </p>
        </div>
      </div>
    );
  }

  // ── Main form ─────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 p-4">
      <div
        className="bg-white dark:bg-gray-900 p-8 rounded-2xl border border-gray-200 
                      dark:border-gray-800 shadow-xl w-full max-w-md relative overflow-hidden"
      >
        {/* Subtle top gradient bar */}
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-linear-to-r from-primary-500 to-primary-700" />

        {/* Logo */}
        <div className="flex items-center gap-2 mb-8">
          <div className="w-9 h-9 bg-primary-600 rounded-xl flex items-center justify-center shadow-lg shadow-primary-500/20">
            <span className="text-white text-base font-bold">S</span>
          </div>
          <span className="text-xl font-bold text-gray-900 dark:text-white tracking-tight">
            StoreIT
          </span>
        </div>

        {/* Invite info card */}
        <div className="bg-primary-50 dark:bg-primary-900/10 border border-primary-100 dark:border-primary-800/20 rounded-2xl p-5 mb-8">
          <div className="flex justify-between items-start mb-2">
            <p className="text-xs font-bold text-primary-600 dark:text-primary-400 uppercase tracking-wider">
              Organization Invite
            </p>
            <span className="text-[10px] font-bold bg-primary-100 dark:bg-primary-800 text-primary-700 dark:text-primary-200 px-2 py-0.5 rounded-full">
              {(inviteData.roleProfile?.name || inviteData.role).replace("_", " ")}
            </span>
          </div>
          <p className="text-lg font-bold text-white-900 dark:text-primary-400 leading-tight">
            {inviteData.tenantName}
          </p>
          <div className="flex items-center gap-2 mt-1">
            <Mail
              size={12}
              className="text-primary-400 dark:text-primary-500"
            />
            <span className="text-xs text-gray-500 dark:text-gray-500 font-medium">
              {inviteData.email}
            </span>
          </div>
        </div>

        <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-1.5">
          Complete your profile
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-8">
          Set your details to access the secure workspace.
        </p>

        {error && (
          <div
            className="bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/30 
                          text-red-700 dark:text-red-400 text-sm px-4 py-3 rounded-xl mb-6 flex items-start gap-2 animate-in fade-in slide-in-from-top-1"
          >
            <AlertCircle size={16} className="shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-xs font-bold text-gray-600 dark:text-gray-400 uppercase tracking-widest mb-1.5 ml-1">
              Full Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="John Smith"
              required
              className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 
                         dark:border-gray-700 rounded-xl text-sm text-gray-900 dark:text-white
                         focus:outline-none focus:ring-2 focus:ring-primary-500 focus:bg-white 
                         dark:focus:bg-gray-800 transition-all placeholder-gray-400 dark:placeholder-gray-500"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-600 dark:text-gray-400 uppercase tracking-widest mb-1.5 ml-1">
              Secret Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 
                         dark:border-gray-700 rounded-xl text-sm text-gray-900 dark:text-white
                         focus:outline-none focus:ring-2 focus:ring-primary-500 focus:bg-white 
                         dark:focus:bg-gray-800 transition-all placeholder-gray-400 dark:placeholder-gray-500"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-600 dark:text-gray-400 uppercase tracking-widest mb-1.5 ml-1">
              Verify Password
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
              required
              className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 
                         dark:border-gray-700 rounded-xl text-sm text-gray-900 dark:text-white
                         focus:outline-none focus:ring-2 focus:ring-primary-500 focus:bg-white 
                         dark:focus:bg-gray-800 transition-all placeholder-gray-400 dark:placeholder-gray-500"
            />
          </div>

          <button
            type="submit"
            disabled={acceptInvite.isPending || !name.trim()}
            className="w-full bg-primary-600 hover:bg-primary-700 disabled:opacity-50
                       text-white font-bold py-3 px-4 rounded-xl text-sm shadow-lg shadow-primary-500/25
                       transition-all active:scale-[0.98] mt-2 flex items-center justify-center gap-2"
          >
            {acceptInvite.isPending ? (
              <>
                <Loader size={16} className="animate-spin" />
                Setting up account…
              </>
            ) : (
              "Create My Account →"
            )}
          </button>
        </form>

        <p className="text-[11px] text-center text-gray-400 dark:text-gray-500 mt-8">
          By creating an account, you agree to your organization's data policies
          on StoreIT.
        </p>
      </div>
    </div>
  );
}
