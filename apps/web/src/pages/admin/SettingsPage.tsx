import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { User, Lock, Building2, CheckCircle } from "lucide-react";
import AppShell from "../../components/layout/AppShell";
import api from "../../api/axios";
import { useAuthStore } from "../../store/authStore";
import { useToast } from "../../components/ui/Toast";

export default function SettingsPage() {
  const { user, setAuth, token } = useAuthStore();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"profile" | "password">("profile");

  const [name, setName] = useState(user?.name ?? "");
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");

  const { data: profileData } = useQuery({
    queryKey: ["my-profile"],
    queryFn: async () => {
      const res = await api.get("/users/me/profile");
      return res.data as { user: any };
    },
  });

  useEffect(() => {
    if (profileData?.user?.name) setName(profileData.user.name);
  }, [profileData]);

  const updateProfile = useMutation({
    mutationFn: async () => api.patch("/users/me/profile", { name }),
    onSuccess: (res) => {
      const updated = res.data.user;
      if (token) setAuth({ ...user!, name: updated.name }, token);
      queryClient.invalidateQueries({ queryKey: ["my-profile"] });
      useToast.getState().add("Profile updated");
    },
    onError: () => useToast.getState().add("Failed to update profile", "error"),
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
    onError: (err: any) =>
      useToast
        .getState()
        .add(err.response?.data?.error ?? "Failed to update password", "error"),
  });

  const profile = profileData?.user;
  const pwMismatch = newPw !== confirmPw && confirmPw.length > 0;

  return (
    <AppShell>
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-9 h-9 bg-blue-50 rounded-xl flex items-center justify-center">
            <User size={18} className="text-blue-600" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Settings</h1>
            <p className="text-xs text-gray-400">Manage your account</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 border-b border-gray-200">
          {(["profile", "password"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-medium capitalize border-b-2 transition-colors -mb-px ${
                tab === t
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {t === "profile" ? "Profile" : "Password"}
            </button>
          ))}
        </div>

        {tab === "profile" && (
          <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-5">
            {/* Avatar */}
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-semibold text-xl">
                {name.charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="font-medium text-gray-900">{name}</p>
                <p className="text-sm text-gray-400">{profile?.email}</p>
              </div>
            </div>

            <div className="border-t border-gray-100 pt-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">
                  Full name
                </label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">
                  Email address
                </label>
                <input
                  value={profile?.email ?? ""}
                  disabled
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-400 cursor-not-allowed"
                />
                <p className="text-xs text-gray-400 mt-1">
                  Email cannot be changed. Contact your admin.
                </p>
              </div>

              {/* Org info */}
              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                <Building2 size={15} className="text-gray-400" />
                <div>
                  <p className="text-xs text-gray-500">Organisation</p>
                  <p className="text-sm font-medium text-gray-700">
                    {profile?.tenant?.name}
                  </p>
                </div>
                <span className="ml-auto text-xs px-2 py-0.5 bg-blue-50 text-blue-600 rounded-full font-medium capitalize">
                  {profile?.tenant?.plan}
                </span>
              </div>

              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                <CheckCircle size={15} className="text-gray-400" />
                <div>
                  <p className="text-xs text-gray-500">Your role</p>
                  <p className="text-sm font-medium text-gray-700 capitalize">
                    {profile?.role?.replace("_", " ").toLowerCase()}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => updateProfile.mutate()}
                disabled={updateProfile.isPending || name === profile?.name}
                className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium"
              >
                {updateProfile.isPending ? "Saving…" : "Save changes"}
              </button>
            </div>
          </div>
        )}

        {tab === "password" && (
          <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <Lock size={16} className="text-gray-400" />
              <p className="text-sm font-medium text-gray-700">
                Change password
              </p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">
                Current password
              </label>
              <input
                type="password"
                value={currentPw}
                onChange={(e) => setCurrentPw(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">
                New password
              </label>
              <input
                type="password"
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
              <p className="text-xs text-gray-400 mt-1">Minimum 8 characters</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">
                Confirm new password
              </label>
              <input
                type="password"
                value={confirmPw}
                onChange={(e) => setConfirmPw(e.target.value)}
                className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 ${
                  pwMismatch ? "border-red-300" : "border-gray-300"
                }`}
              />
              {pwMismatch && (
                <p className="text-xs text-red-500 mt-1">
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
