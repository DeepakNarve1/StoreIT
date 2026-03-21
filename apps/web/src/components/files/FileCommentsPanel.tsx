import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MessageSquare, Send, Trash2, X } from "lucide-react";
import api from "../../api/axios";
import { useAuthStore } from "../../store/authStore";

interface Props {
  fileId: string;
  fileName: string;
  onClose: () => void;
}

function timeAgo(date: string) {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

export default function FileCommentsPanel({
  fileId,
  fileName,
  onClose,
}: Props) {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [content, setContent] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["file-comments", fileId],
    queryFn: async () => {
      const res = await api.get(`/files/${fileId}/comments`);
      return res.data as {
        comments: {
          id: string;
          content: string;
          createdAt: string;
          user: { id: string; name: string };
        }[];
      };
    },
  });

  const addComment = useMutation({
    mutationFn: async () => api.post(`/files/${fileId}/comments`, { content }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["file-comments", fileId] });
      setContent("");
    },
  });

  const deleteComment = useMutation({
    mutationFn: async (commentId: string) =>
      api.delete(`/files/${fileId}/comments/${commentId}`),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["file-comments", fileId] }),
  });

  const comments = data?.comments ?? [];

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="flex items-center gap-3 p-5 border-b border-gray-100 shrink-0">
          <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center">
            <MessageSquare size={15} className="text-blue-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900">Comments</p>
            <p className="text-xs text-gray-400 truncate">{fileName}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X size={16} />
          </button>
        </div>

        {/* Comments list */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {isLoading ? (
            <div className="flex justify-center py-6">
              <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : comments.length === 0 ? (
            <div className="text-center py-8">
              <MessageSquare size={28} className="text-gray-200 mx-auto mb-2" />
              <p className="text-sm text-gray-400">No comments yet</p>
              <p className="text-xs text-gray-300 mt-1">
                Be the first to comment
              </p>
            </div>
          ) : (
            comments.map((c) => (
              <div key={c.id} className="flex gap-3 group">
                <div
                  className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center
                                text-blue-600 font-medium text-xs shrink-0 mt-0.5"
                >
                  {c.user.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2 mb-1">
                    <span className="text-xs font-medium text-gray-800">
                      {c.user.name}
                    </span>
                    <span className="text-xs text-gray-400">
                      {timeAgo(c.createdAt)}
                    </span>
                  </div>
                  <p className="text-sm text-gray-700 leading-relaxed">
                    {c.content}
                  </p>
                </div>
                {c.user.id === user?.id && (
                  <button
                    onClick={() => deleteComment.mutate(c.id)}
                    className="opacity-0 group-hover:opacity-100 text-gray-300
                               hover:text-red-500 transition-all shrink-0 mt-1"
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            ))
          )}
        </div>

        {/* Input */}
        <div className="p-5 pt-0 border-t border-gray-100 shrink-0">
          <div className="flex items-center gap-2 mt-4">
            <input
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onKeyDown={(e) =>
                e.key === "Enter" &&
                !e.shiftKey &&
                content.trim() &&
                addComment.mutate()
              }
              placeholder="Add a comment…"
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm
                         focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
            <button
              onClick={() => addComment.mutate()}
              disabled={!content.trim() || addComment.isPending}
              className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700
                         disabled:opacity-50 transition-colors shrink-0"
            >
              <Send size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
