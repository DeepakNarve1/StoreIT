import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Link2,
  Trash2,
  Loader,
  CheckCircle,
  Clock,
  AlertTriangle,
} from "lucide-react";
import AppShell from "../../components/layout/AppShell";
import api from "../../api/axios";

interface SharedLink {
  id: string;
  token: string;
  isUsed: boolean;
  expiresAt: string;
  createdAt: string;
  file: { id: string; name: string; mimeType: string };
}

function linkStatus(link: SharedLink): "used" | "expired" | "active" {
  if (link.isUsed) return "used";
  if (new Date(link.expiresAt) < new Date()) return "expired";
  return "active";
}

const statusBadge = {
  active: "bg-green-100 text-green-700",
  used: "bg-gray-100 text-gray-500",
  expired: "bg-red-100 text-red-600",
};

const statusIcon = {
  active: <CheckCircle size={12} />,
  used: <CheckCircle size={12} />,
  expired: <AlertTriangle size={12} />,
};

export default function SharedLinksPage() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["one-time-links"],
    queryFn: async () => {
      const res = await api.get("/files/one-time-links");
      return res.data as { links: SharedLink[] };
    },
  });

  const revoke = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/files/one-time-links/${id}`);
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["one-time-links"] }),
  });

  const links = data?.links ?? [];
  const activeCount = links.filter((l) => linkStatus(l) === "active").length;

  return (
    <AppShell>
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-9 h-9 bg-purple-50 rounded-xl flex items-center justify-center">
            <Link2 size={18} className="text-purple-600" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-gray-900">
              Shared links
            </h1>
            <p className="text-xs text-gray-400">
              {activeCount} active link{activeCount !== 1 ? "s" : ""}
            </p>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader size={20} className="animate-spin text-gray-400" />
            </div>
          ) : links.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Link2 size={24} className="text-gray-300 mb-3" />
              <p className="text-sm font-medium text-gray-500">
                No shared links yet
              </p>
              <p className="text-xs text-gray-400 mt-1">
                One-time links appear here when files are shared
              </p>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">
                    File
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">
                    Status
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">
                    Created
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">
                    Expires
                  </th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {links.map((link) => {
                  const status = linkStatus(link);
                  return (
                    <tr
                      key={link.id}
                      className="border-b border-gray-100 last:border-b-0 hover:bg-gray-50"
                    >
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium text-gray-900 truncate max-w-xs">
                          {link.file.name}
                        </p>
                        <p className="text-xs text-gray-400 font-mono mt-0.5 truncate max-w-xs">
                          {link.token}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full ${statusBadge[status]}`}
                        >
                          {statusIcon[status]}
                          {status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-400">
                        {new Date(link.createdAt).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`text-sm ${new Date(link.expiresAt) < new Date() ? "text-red-400" : "text-gray-400"}`}
                        >
                          {new Date(link.expiresAt).toLocaleDateString(
                            "en-US",
                            {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            },
                          )}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {status === "active" && (
                          <button
                            onClick={() => revoke.mutate(link.id)}
                            disabled={revoke.isPending}
                            className="text-gray-400 hover:text-red-500 transition-colors disabled:opacity-50"
                            title="Revoke link"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </AppShell>
  );
}
