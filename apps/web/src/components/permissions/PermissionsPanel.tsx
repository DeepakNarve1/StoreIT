import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Shield,
  Users,
  User,
  Clock,
  Trash2,
  Plus,
  Loader,
  Copy,
  Check,
  Link,
} from "lucide-react";
import api from "../../api/axios";
import clsx from "clsx";

interface PermissionsPanelProps {
  resourceId: string;
  resourceType: "file" | "folder";
  resourceName: string;
  onClose: () => void;
}

const ACTION_LABELS: Record<string, string> = {
  read: "View only",
  write: "Can edit",
  delete: "Can delete",
  admin: "Full access",
};

const ACTION_COLORS: Record<string, string> = {
  read: "bg-blue-50 text-blue-700",
  write: "bg-green-50 text-green-700",
  delete: "bg-red-50 text-red-700",
  admin: "bg-purple-50 text-purple-700",
};

export default function PermissionsPanel({
  resourceId,
  resourceType,
  resourceName,
  onClose,
}: PermissionsPanelProps) {
  const queryClient = useQueryClient();
  const [showAddForm, setShowAddForm] = useState(false);
  const [grantedTo, setGrantedTo] = useState<"all" | "user" | "department">(
    "all",
  );
  const [action, setAction] = useState("read");
  const [userId, setUserId] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [copiedLink, setCopiedLink] = useState(false);
  const [generatedLink, setGeneratedLink] = useState("");
  const [expiresInHours, setExpiresInHours] = useState(24);

  // Fetch existing permissions
  const { data, isLoading } = useQuery({
    queryKey: ["permissions", resourceType, resourceId],
    queryFn: async () => {
      const res = await api.get(`/permissions/${resourceType}/${resourceId}`);
      return res.data as { permissions: any[] };
    },
  });

  // Fetch users for user selector
  const { data: usersData } = useQuery({
    queryKey: ["users"],
    queryFn: async () => {
      const res = await api.get("/users");
      return res.data as { users: any[] };
    },
  });

  // Grant permission
  const grantPermission = useMutation({
    mutationFn: async () => {
      const res = await api.post("/permissions", {
        resourceType,
        resourceId,
        grantedTo,
        userId: grantedTo === "user" && userId ? userId : null,
        action,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
      });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["permissions", resourceType, resourceId],
      });
      setShowAddForm(false);
      setGrantedTo("all");
      setAction("read");
      setUserId("");
      setExpiresAt("");
    },
    onError: (err: any) => {
      console.error("Permission error:", err.response?.data);
      alert(err.response?.data?.error || "Failed to grant permission");
    },
  });

  // Revoke permission
  const revokePermission = useMutation({
    mutationFn: async (permissionId: string) => {
      await api.delete(`/permissions/${permissionId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["permissions", resourceType, resourceId],
      });
    },
  });

  // Generate one-time link (files only)
  const generateLink = useMutation({
    mutationFn: async () => {
      const res = await api.post("/permissions/one-time-link", {
        fileId: resourceId,
        expiresInHours,
      });
      return res.data as { link: string; expiresAt: string };
    },
    onSuccess: (data) => {
      setGeneratedLink(data.link);
    },
  });

  const copyLink = () => {
    navigator.clipboard.writeText(generatedLink);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const permissions = data?.permissions ?? [];
  const users = usersData?.users ?? [];

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />

      {/* Panel */}
      <div
        className="fixed right-0 top-0 h-full w-96 bg-white shadow-2xl z-50
                        flex flex-col border-l border-gray-200"
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4
                          border-b border-gray-200 shrink-0"
        >
          <div className="flex items-center gap-2">
            <Shield size={16} className="text-blue-500" />
            <div>
              <p className="text-sm font-semibold text-gray-900">Permissions</p>
              <p className="text-xs text-gray-400 truncate max-w-48">
                {resourceName}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-1 rounded-lg
                        hover:bg-gray-100 transition-colors"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {/* Current permissions */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                Access ({permissions.length})
              </h3>
              <button
                onClick={() => setShowAddForm(true)}
                className="flex items-center gap-1 text-xs text-blue-600
                            hover:text-blue-700 font-medium"
              >
                <Plus size={12} />
                Add
              </button>
            </div>

            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader size={16} className="animate-spin text-gray-400" />
              </div>
            ) : permissions.length === 0 ? (
              <div className="text-center py-8 bg-gray-50 rounded-xl">
                <Shield size={24} className="text-gray-300 mx-auto mb-2" />
                <p className="text-xs font-medium text-gray-500">
                  No permissions set
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  Only admins can access this {resourceType}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {permissions.map((perm) => (
                  <div
                    key={perm.id}
                    className="flex items-center gap-3 p-3 bg-gray-50
                                rounded-xl border border-gray-100"
                  >
                    {/* Icon */}
                    <div
                      className="w-8 h-8 bg-white rounded-lg border border-gray-200
                                      flex items-center justify-center shrink-0"
                    >
                      {perm.grantedTo === "all" ? (
                        <Users size={14} className="text-gray-500" />
                      ) : (
                        <User size={14} className="text-gray-500" />
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-gray-800">
                        {perm.grantedTo === "all"
                          ? "All users"
                          : perm.user?.name || "Unknown user"}
                      </p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span
                          className={`text-xs px-1.5 py-0.5 rounded-full font-medium
                                          ${ACTION_COLORS[perm.action]}`}
                        >
                          {ACTION_LABELS[perm.action]}
                        </span>
                        {perm.expiresAt && (
                          <span className="text-xs text-gray-400 flex items-center gap-0.5">
                            <Clock size={10} />
                            {new Date(perm.expiresAt).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Revoke */}
                    <button
                      onClick={() => revokePermission.mutate(perm.id)}
                      className="text-gray-400 hover:text-red-500 transition-colors p-1"
                      title="Revoke permission"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Add permission form */}
          {showAddForm && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
              <h3 className="text-xs font-semibold text-gray-900 mb-3">
                Grant Access
              </h3>

              {/* Grant to */}
              <div className="mb-3">
                <label className="text-xs font-medium text-gray-600 mb-1 block">
                  Grant to
                </label>
                <div className="flex gap-1.5">
                  {(["all", "user"] as const).map((type) => (
                    <button
                      key={type}
                      onClick={() => setGrantedTo(type)}
                      className={clsx(
                        "flex-1 py-1.5 text-xs font-medium rounded-lg transition-colors",
                        grantedTo === type
                          ? "bg-blue-600 text-white"
                          : "bg-white text-gray-600 border border-gray-200",
                      )}
                    >
                      {type === "all" ? "All Users" : "Specific User"}
                    </button>
                  ))}
                </div>
              </div>

              {/* User selector */}
              {grantedTo === "user" && (
                <div className="mb-3">
                  <label className="text-xs font-medium text-gray-600 mb-1 block">
                    Select user
                  </label>
                  <select
                    value={userId}
                    onChange={(e) => setUserId(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-gray-200
                                rounded-lg text-xs focus:outline-none focus:ring-2
                                focus:ring-blue-400"
                  >
                    <option value="">Choose a user...</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name} ({u.email})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Permission level */}
              <div className="mb-3">
                <label className="text-xs font-medium text-gray-600 mb-1 block">
                  Permission level
                </label>
                <select
                  value={action}
                  onChange={(e) => setAction(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-gray-200
                              rounded-lg text-xs focus:outline-none focus:ring-2
                              focus:ring-blue-400"
                >
                  <option value="read">View only</option>
                  <option value="write">Can edit</option>
                  <option value="delete">Can delete</option>
                  <option value="admin">Full access</option>
                </select>
              </div>

              {/* Expiry */}
              <div className="mb-4">
                <label className="text-xs font-medium text-gray-600 mb-1 block">
                  Expires (optional)
                </label>
                <input
                  type="datetime-local"
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-gray-200
                              rounded-lg text-xs focus:outline-none focus:ring-2
                              focus:ring-blue-400"
                />
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                <button
                  onClick={() => grantPermission.mutate()}
                  disabled={
                    grantPermission.isPending ||
                    (grantedTo === "user" && !userId)
                  }
                  className="flex-1 py-2 bg-blue-600 hover:bg-blue-700
                              disabled:opacity-50 text-white text-xs font-medium
                              rounded-lg transition-colors"
                >
                  {grantPermission.isPending ? "Granting..." : "Grant Access"}
                </button>
                <button
                  onClick={() => setShowAddForm(false)}
                  className="px-3 py-2 text-gray-600 hover:text-gray-800
                              text-xs transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* One-time link (files only) */}
          {resourceType === "file" && (
            <div>
              <h3
                className="text-xs font-medium text-gray-400 uppercase
                              tracking-wider mb-3"
              >
                One-Time View Link
              </h3>
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                <p className="text-xs text-gray-600 mb-3">
                  Generate a secure link that can only be viewed once. Perfect
                  for sharing with external users.
                </p>

                <div className="flex items-center gap-2 mb-3">
                  <label className="text-xs font-medium text-gray-600 shrink-0">
                    Expires in
                  </label>
                  <select
                    value={expiresInHours}
                    onChange={(e) => setExpiresInHours(Number(e.target.value))}
                    className="flex-1 px-2 py-1.5 bg-white border border-gray-200
                                rounded-lg text-xs focus:outline-none"
                  >
                    <option value={1}>1 hour</option>
                    <option value={6}>6 hours</option>
                    <option value={24}>24 hours</option>
                    <option value={72}>3 days</option>
                    <option value={168}>7 days</option>
                  </select>
                </div>

                {!generatedLink ? (
                  <button
                    onClick={() => generateLink.mutate()}
                    disabled={generateLink.isPending}
                    className="w-full flex items-center justify-center gap-2
                                py-2 bg-gray-800 hover:bg-gray-900 text-white
                                text-xs font-medium rounded-lg transition-colors
                                disabled:opacity-50"
                  >
                    {generateLink.isPending ? (
                      <Loader size={12} className="animate-spin" />
                    ) : (
                      <Link size={12} />
                    )}
                    Generate Link
                  </button>
                ) : (
                  <div>
                    <div
                      className="flex items-center gap-2 bg-white border
                                      border-gray-200 rounded-lg px-3 py-2 mb-2"
                    >
                      <p className="text-xs text-gray-600 truncate flex-1">
                        {generatedLink}
                      </p>
                      <button
                        onClick={copyLink}
                        className="shrink-0 text-gray-400 hover:text-gray-600"
                      >
                        {copiedLink ? (
                          <Check size={13} className="text-green-500" />
                        ) : (
                          <Copy size={13} />
                        )}
                      </button>
                    </div>
                    <p className="text-xs text-amber-600 text-center">
                      ⚠️ This link works only once
                    </p>
                    <button
                      onClick={() => setGeneratedLink("")}
                      className="w-full mt-2 text-xs text-gray-500
                                  hover:text-gray-700 transition-colors"
                    >
                      Generate another
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
