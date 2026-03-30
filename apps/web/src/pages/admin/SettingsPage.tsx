import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { User, Lock, Building2, CheckCircle } from "lucide-react";
import AppShell from "../../components/layout/AppShell";
import api from "../../api/axios";
import { useAuthStore } from "../../store/authStore";
import { useToast } from "../../components/ui/toastStore";

type ProfileUser = {
  id: string;
  name: string;
  email: string;
  role?: string;
  tenant?: { name: string; plan: string } | null;
};

function ProfileTab({ profile }: { profile: ProfileUser }) {
  const queryClient = useQueryClient();
  const { user, setAuth, token } = useAuthStore();
  const [name, setName] = useState(profile.name);

  const updateProfile = useMutation({
    mutationFn: async () => api.patch("/users/me/profile", { name }),
    onSuccess: (res) => {
      const updated = res.data.user as { name: string };
      if (token) setAuth({ ...user!, name: updated.name }, token);
      queryClient.invalidateQueries({ queryKey: ["my-profile"] });
      useToast.getState().add("Profile updated");
    },
    onError: () => useToast.getState().add("Failed to update profile", "error"),
  });

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 p-6 space-y-5 rounded-xl">
      <div className="flex items-center gap-4">
        <div className="w-14 h-14 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center text-blue-600 dark:text-blue-400 font-semibold text-xl">
          {name.charAt(0).toUpperCase()}
        </div>
        <div>
          <p className="font-medium text-gray-900 dark:text-white">{name}</p>
          <p className="text-sm text-gray-400 dark:text-gray-500">
            {profile.email}
          </p>
        </div>
      </div>

      <div className="border-t border-gray-100 dark:border-gray-800 pt-4 space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
            Full name
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full border border-gray-300 dark:border-gray-800 bg-white dark:bg-black/20 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 dark:text-white"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
            Email address
          </label>
          <input
            value={profile.email}
            disabled
            className="w-full border border-gray-200 dark:border-gray-800 rounded-lg px-3 py-2 text-sm bg-gray-50 dark:bg-white/5 text-gray-400 dark:text-gray-600 cursor-not-allowed"
          />
          <p className="text-xs text-gray-400 dark:text-gray-600 mt-1">
            Email cannot be changed. Contact your admin.
          </p>
        </div>

        <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-white/5 rounded-lg border border-gray-100 dark:border-gray-800">
          <Building2 size={15} className="text-gray-400 dark:text-gray-600" />
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-500">
              Organisation
            </p>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {profile.tenant?.name}
            </p>
          </div>
          <span className="ml-auto text-xs px-2 py-0.5 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-full font-medium capitalize">
            {profile.tenant?.plan}
          </span>
        </div>

        <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-white/5 rounded-lg border border-gray-100 dark:border-gray-800">
          <CheckCircle size={15} className="text-gray-400 dark:text-gray-600" />
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-500">Your role</p>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300 capitalize">
              {profile.role?.replace("_", " ").toLowerCase()}
            </p>
          </div>
        </div>
      </div>

      <div className="flex justify-end pt-2">
        <button
          onClick={() => updateProfile.mutate()}
          disabled={updateProfile.isPending || name === profile.name}
          className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium"
        >
          {updateProfile.isPending ? "Saving…" : "Save changes"}
        </button>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const [tab, setTab] = useState<"profile" | "password">("profile");

  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");

  const { data: profileData } = useQuery({
    queryKey: ["my-profile"],
    queryFn: async () => {
      const res = await api.get("/users/me/profile");
      return res.data as { user: ProfileUser };
    },
  });

  const updatePassword = useMutation({
    mutationFn: async () =>
      api.patch("/users/me/password", {
        currentPassword: currentPw,
        newPassword: newPw,
      }),
    onSuccess: () => {
      setCurrentPw("");
      setNewPw("");
      setConfirmPw("");
      useToast.getState().add("Password updated successfully");
    },
    onError: (err: unknown) => {
      const msg = axios.isAxiosError(err)
        ? String(
            (err.response?.data as { error?: string } | undefined)?.error ?? "",
          ) || "Failed to update password"
        : "Failed to update password";
      useToast.getState().add(msg, "error");
    },
  });

  const profile = profileData?.user;
  const pwMismatch = newPw !== confirmPw && confirmPw.length > 0;

  return (
    <AppShell>
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-9 h-9 bg-blue-50 dark:bg-blue-900/40 rounded-xl flex items-center justify-center">
            <User size={18} className="text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-gray-900 dark:text-white">
              Settings
            </h1>
            <p className="text-xs text-gray-400 dark:text-gray-500">
              Manage your account
            </p>
          </div>
        </div>

        <div className="flex gap-1 mb-6 border-b border-gray-200 dark:border-gray-800">
          {(["profile", "password"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-medium capitalize border-b-2 transition-colors -mb-px ${
                tab === t
                  ? "border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400"
                  : "border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              }`}
            >
              {t === "profile" ? "Profile" : "Password"}
            </button>
          ))}
        </div>

        {tab === "profile" && profile && (
          <ProfileTab
            key={`${profile.id}-${profile.name}-${profile.email}`}
            profile={profile}
          />
        )}

        {tab === "profile" && !profile && (
          <div className="text-sm text-gray-500 dark:text-gray-400">
            Loading profile…
          </div>
        )}

        {tab === "password" && (
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 p-6 space-y-4 rounded-xl">
            <div className="flex items-center gap-2 mb-2">
              <Lock size={16} className="text-gray-400 dark:text-gray-500" />
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Change password
              </p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
                Current password
              </label>
              <input
                type="password"
                value={currentPw}
                onChange={(e) => setCurrentPw(e.target.value)}
                className="w-full border border-gray-300 dark:border-gray-800 bg-white dark:bg-black/20 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
                New password
              </label>
              <input
                type="password"
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
                className="w-full border border-gray-300 dark:border-gray-800 bg-white dark:bg-black/20 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 dark:text-white"
              />
              <p className="text-xs text-gray-400 dark:text-gray-600 mt-1">
                Minimum 8 characters
              </p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
                Confirm new password
              </label>
              <input
                type="password"
                value={confirmPw}
                onChange={(e) => setConfirmPw(e.target.value)}
                className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 dark:text-white bg-white dark:bg-black/20 ${
                  pwMismatch
                    ? "border-red-300 dark:border-red-800"
                    : "border-gray-300 dark:border-gray-800"
                }`}
              />
              {pwMismatch && (
                <p className="text-xs text-red-500 dark:text-red-400 mt-1">
                  Passwords do not match
                </p>
              )}
            </div>
            <div className="flex justify-end pt-2">
              <button
                onClick={() => updatePassword.mutate()}
                disabled={
                  updatePassword.isPending ||
                  !currentPw ||
                  !newPw ||
                  pwMismatch ||
                  newPw.length < 8
                }
                className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium"
              >
                {updatePassword.isPending ? "Updating…" : "Update password"}
              </button>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
