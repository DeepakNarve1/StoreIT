import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  X,
  Clock,
  RotateCcw,
  Download,
  CheckCircle,
  Loader,
  History,
} from "lucide-react";
import api from "../../api/axios";

interface FileVersionsModalProps {
  file: { id: string; name: string; version: number };
  onClose: () => void;
}

const formatBytes = (bytes: number) => {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

export default function FileVersionsModal({
  file,
  onClose,
}: FileVersionsModalProps) {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["file-versions", file.id],
    queryFn: async () => {
      const res = await api.get(`/files/${file.id}/versions`);
      return res.data as {
        versions: any[];
        currentVersion: number;
      };
    },
  });

  const restore = useMutation({
    mutationFn: async (versionId: string) => {
      const res = await api.post(
        `/files/${file.id}/versions/${versionId}/restore`,
      );
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["file-versions", file.id] });
      queryClient.invalidateQueries({ queryKey: ["files"] });
    },
  });

  const versions = data?.versions ?? [];

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          className="bg-white rounded-2xl shadow-xl w-full max-w-lg
                        overflow-hidden"
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-5 py-4
                          border-b border-gray-200"
          >
            <div className="flex items-center gap-2">
              <History size={16} className="text-primary-500" />
              <div>
                <p className="text-sm font-semibold text-gray-900">
                  Version History
                </p>
                <p className="text-xs text-gray-400 truncate max-w-64">
                  {file.name}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 p-1 rounded-lg
                         hover:bg-gray-100 transition-colors"
            >
              <X size={16} />
            </button>
          </div>

          {/* Version list */}
          <div className="max-h-96 overflow-y-auto">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader size={20} className="animate-spin text-gray-400" />
              </div>
            ) : versions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12">
                <History size={24} className="text-gray-300 mb-2" />
                <p className="text-sm text-gray-500">No version history yet</p>
                <p className="text-xs text-gray-400 mt-1">
                  Upload the same file again to create a new version
                </p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {versions.map((ver) => (
                  <div
                    key={ver.id}
                    className="flex items-center gap-3 px-5 py-3
                               hover:bg-gray-50 transition-colors"
                  >
                    {/* Version badge */}
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center
                                    justify-center shrink-0 text-xs font-bold
                                    ${
                                      ver.isCurrent
                                        ? "bg-primary-600 text-white"
                                        : "bg-gray-100 text-gray-600"
                                    }`}
                    >
                      v{ver.version}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-800">
                          Version {ver.version}
                        </span>
                        {ver.isCurrent && (
                          <span
                            className="flex items-center gap-1 text-xs
                                           bg-primary-50 text-primary-500 px-2 py-0.5
                                           rounded-full font-medium"
                          >
                            <CheckCircle size={10} />
                            Current
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-gray-400 flex items-center gap-1">
                          <Clock size={10} />
                          {new Date(ver.createdAt).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                        <span className="text-xs text-gray-400">
                          · {formatBytes(ver.size)}
                        </span>
                        {ver.uploadedBy && (
                          <span className="text-xs text-gray-400">
                            · {ver.uploadedBy.name}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 shrink-0">
                      {!ver.isCurrent && (
                        <button
                          onClick={() => {
                            if (confirm(`Restore to version ${ver.version}?`)) {
                              restore.mutate(ver.id);
                            }
                          }}
                          disabled={restore.isPending}
                          className="flex items-center gap-1 px-2 py-1.5 text-xs
                                     font-medium text-primary-500 hover:bg-primary-50
                                     rounded-lg transition-colors disabled:opacity-50"
                          title="Restore this version"
                        >
                          <RotateCcw size={12} />
                          Restore
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-5 py-3 border-t border-gray-100 bg-gray-50">
            <p className="text-xs text-gray-400 text-center">
              Upload the same filename to create a new version automatically
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
