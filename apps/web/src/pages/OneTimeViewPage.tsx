import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  FileText,
  Music,
  File,
  AlertCircle,
  Loader,
  Shield,
} from "lucide-react";

const formatBytes = (bytes: number) => {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

const getFileType = (mimeType: string) => {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  if (mimeType === "application/pdf") return "pdf";
  if (
    mimeType.includes("word") ||
    mimeType.includes("sheet") ||
    mimeType.includes("presentation")
  )
    return "office";
  return "other";
};

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

export default function OneTimeViewPage() {
  const { token } = useParams();

  const { data, isLoading, error } = useQuery({
    queryKey: ["one-time-view", token],
    queryFn: async () => {
      // Use plain fetch — no auth token attached
      const res = await fetch(`${API_URL}/permissions/view/${token}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Link unavailable");
      }
      return res.json() as Promise<{
        file: {
          id: string;
          name: string;
          mimeType: string;
          size: number;
          viewUrl: string;
        };
      }>;
    },
    enabled: !!token,
    retry: false,
    staleTime: Infinity,
  });

  const file = data?.file;
  const fileType = file ? getFileType(file.mimeType) : null;

  const renderPreview = () => {
    if (!file) return null;

    if (fileType === "image") {
      return (
        <img
          src={file.viewUrl}
          alt={file.name}
          className="max-w-full max-h-full object-contain rounded-xl"
        />
      );
    }
    if (fileType === "video") {
      return (
        <video
          src={file.viewUrl}
          controls
          className="max-w-full max-h-full rounded-xl"
          style={{ maxHeight: "70vh" }}
        />
      );
    }
    if (fileType === "audio") {
      return (
        <div className="flex flex-col items-center gap-4">
          <div className="w-20 h-20 bg-pink-50 rounded-2xl flex items-center justify-center">
            <Music size={36} className="text-pink-500" />
          </div>
          <p className="text-sm font-medium text-gray-700">{file.name}</p>
          <audio src={file.viewUrl} controls className="w-full max-w-md" />
        </div>
      );
    }
    if (fileType === "pdf") {
      return (
        <iframe
          src={`${file.viewUrl}#toolbar=1`}
          className="w-full border-0 rounded-xl"
          style={{ height: "75vh" }}
          title={file.name}
        />
      );
    }
    if (fileType === "office") {
      return (
        <iframe
          src={`https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(file.viewUrl)}`}
          className="w-full border-0 rounded-xl"
          style={{ height: "75vh" }}
          title={file.name}
        />
      );
    }
    return (
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="w-20 h-20 bg-gray-100 rounded-2xl flex items-center justify-center">
          <File size={36} className="text-gray-400" />
        </div>
        <p className="text-sm text-gray-500">
          This file type cannot be previewed
        </p>
        <a
          href={file.viewUrl}
          download={file.name}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium
                     rounded-lg hover:bg-blue-700 transition-colors"
        >
          Download file
        </a>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center">
              <span className="text-white text-xs font-bold">F</span>
            </div>
            <span className="font-semibold text-gray-900 text-sm">StoreIT</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            <Shield size={13} className="text-green-500" />
            Secure one-time view
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* Loading */}
        {isLoading && (
          <div className="flex flex-col items-center justify-center py-32">
            <Loader size={24} className="animate-spin text-blue-600 mb-3" />
            <p className="text-sm text-gray-500">Loading secure file...</p>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="flex flex-col items-center justify-center py-32 text-center">
            <div
              className="w-16 h-16 bg-red-100 rounded-full flex items-center
                            justify-center mb-4"
            >
              <AlertCircle size={28} className="text-red-500" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">
              Link unavailable
            </h2>
            <p className="text-sm text-gray-500 max-w-sm">
              This link has already been used, has expired, or is invalid.
              Please request a new link from the file owner.
            </p>
          </div>
        )}

        {/* File preview */}
        {file && (
          <div>
            <div
              className="bg-white border border-gray-200 rounded-xl px-4 py-3
                            flex items-center gap-3 mb-4"
            >
              <div
                className="w-8 h-8 bg-blue-50 rounded-lg flex items-center
                              justify-center shrink-0"
              >
                <FileText size={16} className="text-blue-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {file.name}
                </p>
                <p className="text-xs text-gray-400">
                  {formatBytes(file.size)} · {file.mimeType}
                </p>
              </div>
              <div
                className="flex items-center gap-1.5 text-xs bg-amber-50
                              text-amber-700 border border-amber-200 px-3 py-1.5
                              rounded-full shrink-0"
              >
                <Shield size={11} />
                One-time view only
              </div>
            </div>

            <div
              className="bg-white border border-gray-200 rounded-xl p-4
                            flex items-center justify-center min-h-96"
            >
              {renderPreview()}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
