import { useEffect, useState } from "react";
import { X, Download, ExternalLink } from "lucide-react";
import api from "../../api/axios";
import { canPreviewImageMimeType, getFileKind } from "../../utils/fileMime";

interface FileItem {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  viewUrl?: string | null;
}

interface Props {
  file: FileItem | null;
  onClose: () => void;
}

const getFileType = (mimeType: string) => {
  return getFileKind(mimeType);
};

const getOfficeViewerUrl = (fileUrl: string) =>
  `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(fileUrl)}`;

function FileDocumentPreviewModalInner({
  file,
  onClose,
}: {
  file: FileItem;
  onClose: () => void;
}) {
  const [viewUrl, setViewUrl] = useState<string | null>(file.viewUrl ?? null);
  const [loadingUrl, setLoadingUrl] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api
      .get(`/files/${file.id}`)
      .then((res) => {
        if (!cancelled) setViewUrl(res.data.file.viewUrl);
      })
      .catch(() => {
        if (!cancelled) setViewUrl(null);
      })
      .finally(() => {
        if (!cancelled) setLoadingUrl(false);
      });
    return () => {
      cancelled = true;
    };
  }, [file.id]);

  const fileType = getFileType(file.mimeType);

  const renderPreview = () => {
    if (loadingUrl) {
      return (
        <div className="h-full flex items-center justify-center text-sm text-gray-500 dark:text-gray-400">
          Loading preview...
        </div>
      );
    }
    if (!viewUrl) {
      return (
        <div className="h-full flex items-center justify-center text-sm text-gray-500 dark:text-gray-400">
          Preview not available for this file.
        </div>
      );
    }
    if (fileType === "image")
      return canPreviewImageMimeType(file.mimeType) ? (
        <div className="h-full flex items-center justify-center p-4">
          <img src={viewUrl} alt={file.name} className="max-w-full max-h-full object-contain rounded-lg" />
        </div>
      ) : (
        <div className="h-full flex flex-col items-center justify-center gap-3 text-center px-6">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            This image format is not previewable in the browser.
          </p>
          <a
            href={viewUrl}
            download={file.name}
            className="px-4 py-2 rounded-lg bg-primary-600 text-white text-sm hover:bg-primary-700"
          >
            Download file
          </a>
        </div>
      );
    if (fileType === "video")
      return (
        <div className="h-full flex items-center justify-center p-4">
          <video src={viewUrl} controls className="max-w-full max-h-full rounded-lg" />
        </div>
      );
    if (fileType === "audio")
      return (
        <div className="h-full flex items-center justify-center p-8">
          <audio src={viewUrl} controls className="w-full max-w-lg" />
        </div>
      );
    if (fileType === "pdf")
      return <iframe src={`${viewUrl}#toolbar=1&navpanes=1`} className="w-full h-full border-0" title={file.name} />;
    if (fileType === "office")
      return <iframe src={getOfficeViewerUrl(viewUrl)} className="w-full h-full border-0" title={file.name} />;
    if (fileType === "text")
      return <iframe src={viewUrl} className="w-full h-full border-0 bg-white dark:bg-gray-900" title={file.name} />;
    return (
      <div className="h-full flex items-center justify-center">
        <a
          href={viewUrl}
          download={file.name}
          className="px-4 py-2 rounded-lg bg-primary-600 text-white text-sm hover:bg-primary-700"
        >
          Download file
        </a>
      </div>
    );
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose} />
      <div className="fixed inset-4 md:inset-8 lg:inset-12 z-50 bg-white dark:bg-gray-900 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{file.name}</p>
          <div className="flex items-center gap-1.5">
            {viewUrl && (
              <>
                <a href={viewUrl} download={file.name} className="px-3 py-1.5 text-xs rounded-lg border border-gray-300 dark:border-gray-600">
                  <span className="inline-flex items-center gap-1"><Download size={13} />Download</span>
                </a>
                <a href={viewUrl} target="_blank" rel="noopener noreferrer" className="px-3 py-1.5 text-xs rounded-lg border border-gray-300 dark:border-gray-600">
                  <span className="inline-flex items-center gap-1"><ExternalLink size={13} />Open</span>
                </a>
              </>
            )}
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800">
              <X size={18} />
            </button>
          </div>
        </div>
        <div className="flex-1 bg-gray-50 dark:bg-gray-900">{renderPreview()}</div>
      </div>
    </>
  );
}

export default function FileDocumentPreviewModal({ file, onClose }: Props) {
  useEffect(() => {
    if (!file) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose, file]);

  useEffect(() => {
    if (!file) return;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [file]);

  if (!file) return null;

  return <FileDocumentPreviewModalInner key={file.id} file={file} onClose={onClose} />;
}
