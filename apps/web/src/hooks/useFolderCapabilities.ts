import { useQuery } from "@tanstack/react-query";
import api from "../api/axios";
import { useAuthStore } from "../store/authStore";
import type { CapabilityMap } from "./useFileCapabilities";

const PRIVILEGED = ["SUPERADMIN", "ORG_ADMIN", "MANAGER", "EDITOR"];

const ALL_TRUE_FOLDER: Record<string, boolean> = {
  create_folders: true,
  see_folders: true,
  download_folders: true,
  edit_folders: true,
  move_folders: true,
  delete_folders: true,
  duplicate_folders: true,
  share_folders: true,
  share_public_link_folder: true,
  see_audit_trails: true,
  view_metadata: true,
  edit_metadata: true,
};

export function useFolderCapabilities(folderIds: string[]): {
  capMap: CapabilityMap;
  isLoading: boolean;
} {
  const { user } = useAuthStore();
  const isPrivileged = PRIVILEGED.includes(user?.role ?? "");

  const { data, isLoading } = useQuery({
    queryKey: ["folder-capabilities", folderIds.join(",")],
    queryFn: async () => {
      if (folderIds.length === 0) return { capabilities: {} };
      const res = await api.post("/permissions/my-folder-capabilities", {
        folderIds,
      });
      return res.data as { capabilities: CapabilityMap };
    },
    enabled: folderIds.length > 0 && !isPrivileged,
    staleTime: 30_000,
  });

  if (isPrivileged) {
    const capMap: CapabilityMap = {};
    folderIds.forEach((id) => (capMap[id] = ALL_TRUE_FOLDER));
    return { capMap, isLoading: false };
  }

  return {
    capMap: data?.capabilities ?? {},
    isLoading,
  };
}

