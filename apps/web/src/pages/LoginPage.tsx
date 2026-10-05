import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuthStore } from "../store/authStore";
import api from "../api/axios";
import { apiErrorMessage } from "../utils/apiError";
import { HardDrive, ShieldCheck, Sparkles, Check, Copy } from "lucide-react";

interface QuickCredential {
  role: string;
  badge?: string;
  email: string;
  pass: string;
  note?: string;
  highlight?: boolean;
}

const DEMO_ACCOUNTS: QuickCredential[] = [
  {
    role: "Test Admin",
    badge: "1 GB Quota",
    email: "testadmin@storeit.com",
    pass: "Admin@123",
    note: "Admin with 1 GB storage limit for testing & evaluation",
    highlight: true,
  },
  {
    role: "Org Admin (Pro)",
    email: "admin@acme.com",
    pass: "Admin@123",
    note: "Full organization admin access",
  },
  {
    role: "Super Admin",
    email: "super@platform.com",
    pass: "Super@123",
    note: "Platform-level administration",
  },
  {
    role: "Editor",
    email: "editor@acme.com",
    pass: "Editor@123",
    note: "Upload & edit permissions",
  },
  {
    role: "Viewer",
    email: "viewer@acme.com",
    pass: "Viewer@123",
    note: "Read-only access",
  },
];

export default function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [copiedEmail, setCopiedEmail] = useState<string | null>(null);

  const reason = searchParams.get("reason");
  const reasonMessage =
    reason === "disabled"
      ? "Your account has been deactivated. Contact your administrator."
      : reason === "suspended"
        ? "Your organisation account has been suspended. Contact support."
        : null;

  const handleLogin = async (e?: React.FormEvent, customEmail?: string, customPass?: string) => {
    if (e) e.preventDefault();
    const loginEmail = customEmail ?? email;
    const loginPassword = customPass ?? password;

    setLoading(true);
    setError("");
    try {
      const res = await api.post("/auth/login", { email: loginEmail, password: loginPassword });
      setAuth(res.data.user, res.data.accessToken);
      navigate("/");
    } catch (err: unknown) {
      setError(apiErrorMessage(err, "Login failed"));
    } finally {
      setLoading(false);
    }
  };

  const handleQuickFill = (cred: QuickCredential, autoSubmit = false) => {
    setEmail(cred.email);
    setPassword(cred.pass);
    setError("");
    if (autoSubmit) {
      handleLogin(undefined, cred.email, cred.pass);
    }
  };

  const handleCopy = (e: React.MouseEvent, text: string) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text);
    setCopiedEmail(text);
    setTimeout(() => setCopiedEmail(null), 1800);
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
        {/* Left Side: Login Form */}
        <div className="md:col-span-7 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 p-8 rounded-2xl shadow-sm">
          {/* Logo */}
          <div className="flex items-center gap-2 mb-6">
            <div className="w-9 h-9 bg-primary-600 rounded-xl flex items-center justify-center shadow-md shadow-primary-500/20">
              <span className="text-white text-base font-bold">S</span>
            </div>
            <span className="text-xl font-bold text-gray-900 dark:text-white">StoreIT</span>
          </div>

          <h1 className="text-xl font-semibold text-gray-900 dark:text-white mb-1">Sign in</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mb-6">
            Enter your credentials or pick a demo account on the right
          </p>

          {reasonMessage && (
            <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 text-sm px-4 py-3 rounded-lg mb-4">
              {reasonMessage}
            </div>
          )}

          {error && (
            <div className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm px-4 py-3 rounded-lg mb-4">
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

            <div className="text-right">
              <Link
                to="/forgot-password"
                className="text-xs text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
              >
                Forgot your password?
              </Link>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-primary-600 hover:bg-primary-700 disabled:opacity-50
                         text-white font-medium py-2.5 px-4 rounded-lg text-sm transition-colors shadow-sm shadow-primary-600/30"
            >
              {loading ? "Signing in..." : "Sign in"}
            </button>
          </form>

          <p className="text-xs text-gray-400 dark:text-gray-500 text-center mt-6">
            No account? Contact your admin for an invite.
          </p>
        </div>

        {/* Right Side: Demo & Interviewer Credentials */}
        <div className="md:col-span-5 flex flex-col gap-3">
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 p-5 rounded-2xl shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="w-4 h-4 text-amber-500" />
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
                Demo & Evaluation Access
              </h2>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
              Click any role to auto-fill credentials or sign in instantly.
            </p>

            <div className="space-y-2.5">
              {DEMO_ACCOUNTS.map((cred) => {
                const isSelected = email === cred.email;
                return (
                  <div
                    key={cred.email}
                    onClick={() => handleQuickFill(cred)}
                    className={`p-3 rounded-xl border transition-all cursor-pointer text-left ${
                      cred.highlight
                        ? "bg-gradient-to-r from-primary-50/80 to-pink-50/40 dark:from-primary-950/40 dark:to-pink-950/20 border-primary-300 dark:border-primary-700/60 shadow-xs"
                        : isSelected
                          ? "bg-gray-100 dark:bg-gray-800 border-primary-500"
                          : "bg-gray-50 dark:bg-gray-800/60 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {cred.highlight ? (
                          <HardDrive className="w-3.5 h-3.5 text-primary-600 dark:text-primary-400 shrink-0" />
                        ) : (
                          <ShieldCheck className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                        )}
                        <span className="text-xs font-semibold text-gray-900 dark:text-white truncate">
                          {cred.role}
                        </span>
                      </div>
                      {cred.badge && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-primary-100 dark:bg-primary-900/60 text-primary-700 dark:text-primary-300 shrink-0">
                          {cred.badge}
                        </span>
                      )}
                    </div>

                    <div className="text-[11px] font-mono text-gray-600 dark:text-gray-300 flex items-center justify-between">
                      <span className="truncate">{cred.email}</span>
                      <button
                        type="button"
                        onClick={(e) => handleCopy(e, cred.email)}
                        className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded"
                        title="Copy email"
                      >
                        {copiedEmail === cred.email ? (
                          <Check className="w-3 h-3 text-green-500" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </button>
                    </div>

                    <div className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5 flex items-center justify-between">
                      <span>Pass: <code className="font-mono">{cred.pass}</code></span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleQuickFill(cred, true);
                        }}
                        className="text-[10px] text-primary-600 dark:text-primary-400 font-semibold hover:underline"
                      >
                        Auto Login →
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

