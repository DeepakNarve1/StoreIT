
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Download, AlertCircle, Loader, File as FileIcon, Eye } from "lucide-react";
import api from "../api/axios";
import { apiErrorMessage } from "../utils/apiError";

interface GuestData {
  guest: {
    id: string;
    label: string | null;
    email: string;
    capabilities: Record<string, boolean>;
    expiresAt: string;
  };
  file: {
    id: string;
    name: string;
    mimeType: string;
    size: number;
  } | null;
  viewUrl: string | null;
}

export default function GuestAccessPage() {
  const { token } = useParams<{ token: string }>();

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["guest-access", token],
    queryFn: async () => {
      const res = await api.get(`/guest/access/${token}`);
      return res.data as GuestData;
    },
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center">
        <Loader size={32} className="text-primary-500 animate-spin mb-4" />
        <p className="text-gray-500 font-medium">Loading secure access...</p>
      </div>
    );
  }

  if (isError || !data?.file) {
    const msg = error
      ? apiErrorMessage(error, "This link is invalid or has expired.")
      : "This link is invalid or has expired.";
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-8 text-center border border-gray-100">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <AlertCircle size={32} className="text-red-500" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h1>
          <p className="text-gray-500 mb-8">{msg}</p>
        </div>
      </div>
    );
  }

  const { file, guest, viewUrl } = data;
  const { capabilities } = guest;

  const handleDownload = () => {
    if (!viewUrl) return;
    const a = document.createElement("a");
    a.href = viewUrl;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md border border-gray-100 overflow-hidden">
        {/* Header */}
        <div className="bg-primary-600 px-6 py-8 text-center relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-2xl -mr-10 -mt-10" />
          <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4 backdrop-blur-sm">
            <FileIcon size={32} className="text-white" />
          </div>
          <h1 className="text-xl font-bold text-white mb-1 truncate">
            {file.name}
          </h1>
          <p className="text-primary-100 text-sm font-medium">
            {formatSize(file.size)}
          </p>
        </div>

        {/* Content */}
        <div className="p-6">
          <div className="bg-gray-50 rounded-xl p-4 mb-6 border border-gray-100">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
              Access Details
            </h3>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-gray-500">Shared with</span>
                <span className="text-sm font-medium text-gray-900 truncate max-w-[200px]">
                  {guest.email}
                </span>
              </div>
              {guest.label && (
                <div className="flex justify-between">
                  <span className="text-sm text-gray-500">Note</span>
                  <span className="text-sm font-medium text-gray-900 truncate max-w-[200px]">
                    {guest.label}
                  </span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-sm text-gray-500">Expires</span>
                <span className="text-sm font-medium text-gray-900">
                  {new Date(guest.expiresAt).toLocaleDateString()}
                </span>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            {capabilities.preview_files && viewUrl && (
              <a
                href={viewUrl}
                target="_blank"
                rel="noreferrer"
                className="w-full flex items-center justify-center gap-2 bg-white border-2 border-primary-500 text-primary-600 hover:bg-primary-50 font-semibold py-3 px-4 rounded-xl transition-colors"
              >
                <Eye size={18} />
                Preview File
              </a>
            )}

            {capabilities.download_files && viewUrl && (
              <button
                onClick={handleDownload}
                className="w-full flex items-center justify-center gap-2 bg-primary-600 hover:bg-primary-700 text-white font-semibold py-3 px-4 rounded-xl shadow-lg shadow-primary-500/30 transition-all"
              >
                <Download size={18} />
                Download File
              </button>
            )}

            {!capabilities.preview_files && !capabilities.download_files && (
              <div className="text-center p-4 bg-gray-50 rounded-xl">
                <p className="text-sm text-gray-500">
                  You only have permission to see this file exists.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
