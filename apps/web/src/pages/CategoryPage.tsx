import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Hash, Folder } from "lucide-react";
import AppShell from "../components/layout/AppShell";
import FileGrid from "../components/files/FileGrid";
import FilePreviewModal from "../components/files/FilePreviewModal";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/axios";

export default function CategoryPage() {
  const { categoryId } = useParams();
  const navigate = useNavigate();
  const [previewFile, setPreviewFile] = useState<any>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["category", categoryId],
    queryFn: async () => {
      const res = await api.get(`/categories/${categoryId}/files`);
      return res.data;
    },
    enabled: !!categoryId,
  });

  const category = data?.category;
  const files = data?.files ?? [];
  const folders = data?.folders ?? [];
  const isEmpty = files.length === 0 && folders.length === 0;

  return (
    <AppShell>
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-2 mb-6">
          <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center">
            <Hash size={16} className="text-blue-500" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-gray-900">
              {category?.name ?? "Category"}
            </h1>
            <p className="text-xs text-gray-400">
              {files.length} files · {folders.length} folders
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : isEmpty ? (
          <div className="bg-white border border-gray-200 rounded-xl">
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                <Hash size={22} className="text-gray-400" />
              </div>
              <p className="text-sm font-medium text-gray-700">
                No files in this category yet
              </p>
              <p className="text-xs text-gray-400 mt-1">
                Assign files or folders to this category when uploading
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {folders.length > 0 && (
              <div>
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">
                  Folders ({folders.length})
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                  {folders.map((folder: any) => (
                    <button
                      key={folder.id}
                      onClick={() => navigate(`/browse/${folder.id}`)}
                      className="flex flex-col items-center p-4 bg-white border border-gray-200
                                 rounded-xl hover:border-blue-300 hover:shadow-sm transition-all text-center group"
                    >
                      <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center mb-3">
                        <Folder size={22} className="text-blue-500" />
                      </div>
                      <span className="text-xs font-medium text-gray-800 truncate w-full text-center">
                        {folder.name}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {files.length > 0 && (
              <div>
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">
                  Files ({files.length})
                </p>
                <FileGrid files={files} onFileClick={setPreviewFile} />
              </div>
            )}
          </div>
        )}
      </div>

      {previewFile && (
        <FilePreviewModal
          file={previewFile}
          onClose={() => setPreviewFile(null)}
        />
      )}
    </AppShell>
  );
}
