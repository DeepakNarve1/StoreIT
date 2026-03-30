import { useMemo } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import AppShell from "../components/layout/AppShell";
import FileMetadataPanel from "../components/files/FileMetadataPanel";
import FolderMetadataPanel from "../components/files/FolderMetadataPanel";

type LocationState = {
  backPath?: string;
  fileName?: string;
  folderName?: string;
};

export default function MetadataPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { fileId, folderId } = useParams<{ fileId?: string; folderId?: string }>();
  const state = (location.state ?? {}) as LocationState;

  const backPath = state.backPath ?? "/browse";

  const header = useMemo(() => {
    if (fileId) return "File metadata";
    if (folderId) return "Folder metadata";
    return "Metadata";
  }, [fileId, folderId]);

  return (
    <AppShell>
      <div className="max-w-6xl mx-auto">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {header}
            </h1>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Metadata editor in center content view
            </p>
          </div>
          <button
            onClick={() => navigate(backPath)}
            className="px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
          >
            Back
          </button>
        </div>

        {fileId ? (
          <FileMetadataPanel
            key={fileId}
            fileId={fileId}
            fileName={state.fileName ?? "File"}
            variant="page"
            onClose={() => navigate(backPath)}
          />
        ) : folderId ? (
          <FolderMetadataPanel
            key={folderId}
            folderId={folderId}
            folderName={state.folderName ?? "Folder"}
            variant="page"
            onClose={() => navigate(backPath)}
          />
        ) : (
          <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-4 py-6 text-sm text-gray-500 dark:text-gray-400">
            Invalid metadata route.
          </div>
        )}
      </div>
    </AppShell>
  );
}

