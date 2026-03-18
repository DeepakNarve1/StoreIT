import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { Upload, X, CheckCircle, AlertCircle, Loader } from "lucide-react";
import clsx from "clsx";
import api from "../../api/axios";

interface UploadFile {
  id: string;
  file: File;
  status: "pending" | "uploading" | "done" | "error";
  progress: number;
  error?: string;
}

interface UploadZoneProps {
  folderId?: string;
  onUploadComplete: () => void;
}

export default function UploadZone({
  folderId,
  onUploadComplete,
}: UploadZoneProps) {
  const [uploads, setUploads] = useState<UploadFile[]>([]);
  const [isDragActive, setIsDragActive] = useState(false);

  const updateUpload = (id: string, updates: Partial<UploadFile>) => {
    setUploads((prev) =>
      prev.map((u) => (u.id === id ? { ...u, ...updates } : u)),
    );
  };

  const uploadFile = async (uploadItem: UploadFile) => {
    updateUpload(uploadItem.id, { status: "uploading", progress: 0 });

    try {
      const formData = new FormData();
      formData.append("file", uploadItem.file);
      if (folderId && folderId !== "undefined") {
        formData.append("folderId", folderId);
      }
      await api.post("/files/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
        onUploadProgress: (e) => {
          const progress = Math.round((e.loaded * 100) / (e.total || 1));
          updateUpload(uploadItem.id, { progress });
        },
      });

      updateUpload(uploadItem.id, { status: "done", progress: 100 });
      onUploadComplete();
    } catch (err: any) {
      updateUpload(uploadItem.id, {
        status: "error",
        error: err.response?.data?.error || "Upload failed",
      });
    }
  };

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      const newUploads: UploadFile[] = acceptedFiles.map((file) => ({
        id: `${file.name}-${Date.now()}-${Math.random()}`,
        file,
        status: "pending",
        progress: 0,
      }));

      setUploads((prev) => [...prev, ...newUploads]);

      // Upload all files (max 5 concurrent)
      newUploads.forEach((u) => uploadFile(u));
    },
    [folderId],
  );

  const { getRootProps, getInputProps } = useDropzone({
    onDrop,
    onDragEnter: () => setIsDragActive(true),
    onDragLeave: () => setIsDragActive(false),
    onDropAccepted: () => setIsDragActive(false),
    onDropRejected: () => setIsDragActive(false),
  });

  const removeUpload = (id: string) => {
    setUploads((prev) => prev.filter((u) => u.id !== id));
  };

  const clearDone = () => {
    setUploads((prev) => prev.filter((u) => u.status !== "done"));
  };

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  };

  return (
    <div className="w-full">
      {/* Drop zone */}
      <div
        {...getRootProps()}
        className={clsx(
          "border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all",
          isDragActive
            ? "border-blue-400 bg-blue-50"
            : "border-gray-300 hover:border-gray-400 hover:bg-gray-50",
        )}
      >
        <input {...getInputProps()} />
        <div
          className={clsx(
            "w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3",
            isDragActive ? "bg-blue-100" : "bg-gray-100",
          )}
        >
          <Upload
            size={22}
            className={isDragActive ? "text-blue-500" : "text-gray-400"}
          />
        </div>
        <p className="text-sm font-medium text-gray-700">
          {isDragActive ? "Drop files here" : "Drag & drop files here"}
        </p>
        <p className="text-xs text-gray-400 mt-1">
          or{" "}
          <span className="text-blue-600 hover:underline">
            browse to upload
          </span>
        </p>
        <p className="text-xs text-gray-400 mt-2">All file types supported</p>
      </div>

      {/* Upload progress list */}
      {uploads.length > 0 && (
        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-gray-600">
              {uploads.filter((u) => u.status === "done").length}/
              {uploads.length} uploaded
            </span>
            <button
              onClick={clearDone}
              className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
            >
              Clear done
            </button>
          </div>

          {uploads.map((upload) => (
            <div
              key={upload.id}
              className="flex items-center gap-3 bg-white border border-gray-200
                         rounded-lg px-3 py-2.5"
            >
              {/* Status icon */}
              <div className="flex-shrink-0">
                {upload.status === "done" && (
                  <CheckCircle size={16} className="text-green-500" />
                )}
                {upload.status === "error" && (
                  <AlertCircle size={16} className="text-red-500" />
                )}
                {(upload.status === "uploading" ||
                  upload.status === "pending") && (
                  <Loader size={16} className="text-blue-500 animate-spin" />
                )}
              </div>

              {/* File info + progress */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-gray-800 truncate">
                    {upload.file.name}
                  </span>
                  <span className="text-xs text-gray-400 flex-shrink-0">
                    {formatBytes(upload.file.size)}
                  </span>
                </div>

                {upload.status === "uploading" && (
                  <div className="mt-1.5 h-1 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full transition-all duration-300"
                      style={{ width: `${upload.progress}%` }}
                    />
                  </div>
                )}

                {upload.status === "error" && (
                  <p className="text-xs text-red-500 mt-0.5">{upload.error}</p>
                )}

                {upload.status === "done" && (
                  <p className="text-xs text-green-600 mt-0.5">
                    Uploaded successfully
                  </p>
                )}
              </div>

              {/* Remove button */}
              {(upload.status === "done" || upload.status === "error") && (
                <button
                  onClick={() => removeUpload(upload.id)}
                  className="shrink-0 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
