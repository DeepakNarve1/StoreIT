import { useEffect } from "react";
import {
  X,
  Download,
  FileText,
  Image,
  Film,
  Music,
  File,
  ExternalLink,
} from "lucide-react";

interface FileItem {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  createdAt: string;
  storageKey?: string;
  viewUrl?: string | null;
}

interface FilePreviewModalProps {
  file: FileItem | null;
  onClose: () => void;
}

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
  if (mimeType.includes("word") || mimeType.includes("document"))
    return "office";
  if (mimeType.includes("sheet") || mimeType.includes("excel")) return "office";
  if (mimeType.includes("presentation") || mimeType.includes("powerpoint"))
    return "office";
  if (mimeType.startsWith("text/")) return "text";
  return "other";
};

const getOfficeViewerUrl = (fileUrl: string) => {
  return `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(fileUrl)}`;
};

const getFileIcon = (mimeType: string) => {
  const type = getFileType(mimeType);
  switch (type) {
    case "image":
      return { icon: Image, color: "text-green-500", bg: "bg-green-50" };
    case "video":
      return { icon: Film, color: "text-purple-500", bg: "bg-purple-50" };
    case "audio":
      return { icon: Music, color: "text-pink-500", bg: "bg-pink-50" };
    case "pdf":
      return { icon: FileText, color: "text-red-500", bg: "bg-red-50" };
    case "office":
      return { icon: FileText, color: "text-blue-500", bg: "bg-blue-50" };
    case "text":
      return { icon: FileText, color: "text-gray-500", bg: "bg-gray-50" };
    default:
      return { icon: File, color: "text-gray-500", bg: "bg-gray-50" };
  }
};

export default function FilePreviewModal({
  file,
  onClose,
}: FilePreviewModalProps) {
  // Close on Escape key
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  if (!file) return null;

  const fileType = getFileType(file.mimeType);
  const { icon: Icon, color, bg } = getFileIcon(file.mimeType);
  const viewUrl = file.viewUrl;

  const renderPreview = () => {
    // No URL yet (S3 not connected) — show placeholder
    if (!viewUrl) {
      return (
        <div className="flex flex-col items-center justify-center h-full py-20 text-center">
          <div
            className={`w-20 h-20 ${bg} rounded-2xl flex items-center justify-center mb-4`}
          >
            <Icon size={36} className={color} />
          </div>
          <p className="text-sm font-medium text-gray-700 mb-1">{file.name}</p>
          <p className="text-xs text-gray-400 mb-6">{formatBytes(file.size)}</p>
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 max-w-sm">
            <p className="text-xs text-amber-700 font-medium mb-1">
              Preview not available yet
            </p>
            <p className="text-xs text-amber-600">
              File preview will work once S3/R2 storage is connected. The file
              metadata has been saved successfully.
            </p>
          </div>
        </div>
      );
    }

    // IMAGE
    if (fileType === "image") {
      return (
        <div className="flex items-center justify-center h-full p-4">
          <img
            src={viewUrl}
            alt={file.name}
            className="max-w-full max-h-full object-contain rounded-lg"
          />
        </div>
      );
    }

    // VIDEO
    if (fileType === "video") {
      return (
        <div className="flex items-center justify-center h-full p-4">
          <video
            src={viewUrl}
            controls
            className="max-w-full max-h-full rounded-lg"
            style={{ maxHeight: "70vh" }}
          >
            Your browser does not support video playback.
          </video>
        </div>
      );
    }

    // AUDIO
    if (fileType === "audio") {
      return (
        <div className="flex flex-col items-center justify-center h-full p-8 gap-6">
          <div
            className={`w-24 h-24 ${bg} rounded-2xl flex items-center justify-center`}
          >
            <Icon size={40} className={color} />
          </div>
          <p className="text-sm font-medium text-gray-700">{file.name}</p>
          <audio src={viewUrl} controls className="w-full max-w-md">
            Your browser does not support audio playback.
          </audio>
        </div>
      );
    }

    // PDF — browser built-in viewer
    if (fileType === "pdf") {
      return (
        <iframe
          src={`${viewUrl}#toolbar=1&navpanes=1`}
          className="w-full h-full border-0 rounded-b-xl"
          title={file.name}
        />
      );
    }

    // OFFICE DOCS — Microsoft Office Online viewer
    if (fileType === "office") {
      return (
        <div className="flex flex-col h-full">
          <iframe
            src={getOfficeViewerUrl(viewUrl)}
            className="w-full flex-1 border-0"
            title={file.name}
          />
          <div className="p-2 bg-gray-50 border-t border-gray-200 text-center">
            <p className="text-xs text-gray-400">
              Powered by Microsoft Office Online
            </p>
          </div>
        </div>
      );
    }

    // TEXT files
    if (fileType === "text") {
      return (
        <iframe
          src={viewUrl}
          className="w-full h-full border-0 rounded-b-xl bg-white"
          title={file.name}
        />
      );
    }

    // FALLBACK — can't preview, offer download
    return (
      <div className="flex flex-col items-center justify-center h-full py-20 text-center">
        <div
          className={`w-20 h-20 ${bg} rounded-2xl flex items-center justify-center mb-4`}
        >
          <Icon size={36} className={color} />
        </div>
        <p className="text-sm font-medium text-gray-700 mb-1">{file.name}</p>
        <p className="text-xs text-gray-400 mb-6">{formatBytes(file.size)}</p>
        <p className="text-xs text-gray-500 mb-4">
          This file type cannot be previewed in the browser.
        </p>
        <a
          href={viewUrl}
          download={file.name}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white
                     text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Download size={15} />
          Download file
        </a>
      </div>
    );
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div
        className="fixed inset-4 md:inset-8 lg:inset-12 z-50 flex flex-col
                      bg-white rounded-2xl shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div
          className="flex items-center gap-3 px-4 py-3 border-b border-gray-200
                        bg-white shrink-0"
        >
          {/* File icon */}
          <div
            className={`w-8 h-8 ${bg} rounded-lg flex items-center justify-center shrink-0`}
          >
            <Icon size={16} className={color} />
          </div>

          {/* File info */}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">
              {file.name}
            </p>
            <p className="text-xs text-gray-400">
              {formatBytes(file.size)} · {file.mimeType} ·{" "}
              {new Date(file.createdAt).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </p>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1.5 shrink-0">
            {viewUrl && (
              <>
                <a
                  href={viewUrl}
                  download={file.name}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium
                             text-gray-700 border border-gray-300 rounded-lg
                             hover:bg-gray-50 transition-colors"
                >
                  <Download size={13} />
                  Download
                </a>
                <a
                  href={viewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium
                             text-gray-700 border border-gray-300 rounded-lg
                             hover:bg-gray-50 transition-colors"
                >
                  <ExternalLink size={13} />
                  Open
                </a>
              </>
            )}
            <button
              onClick={onClose}
              className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100
                         rounded-lg transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Preview content */}
        <div className="flex-1 overflow-auto bg-gray-50">{renderPreview()}</div>
      </div>
    </>
  );
}
