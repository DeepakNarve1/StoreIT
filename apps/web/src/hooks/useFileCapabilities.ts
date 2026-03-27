import { useQuery } from "@tanstack/react-query";
import api from "../api/axios";
import { useAuthStore } from "../store/authStore";

export type CapabilityMap = Record<string, Record<string, boolean>>;

const PRIVILEGED = ["SUPERADMIN", "ORG_ADMIN", "MANAGER", "EDITOR"];

const ALL_TRUE: Record<string, boolean> = {
  preview_files: true,
  download_files: true,
  add_files: true,
  delete_files: true,
  edit_file_attrs: true,
  view_metadata: true,
  edit_metadata: true,
  see_files: true,
  see_folders: true,
  share_files: true,
  share_folders: true,
};

/**
 * For a list of file IDs, fetches the current user's granular capabilities
 * from the backend. For privileged roles, returns all-true immediately without
 * hitting the API. For VIEWERs, the backend resolves per-file grant records.
 */
export function useFileCapabilities(fileIds: string[]): {
  capMap: CapabilityMap;
  isLoading: boolean;
} {
  const { user } = useAuthStore();
  const isPrivileged = PRIVILEGED.includes(user?.role ?? "");

  const { data, isLoading } = useQuery({
    queryKey: ["file-capabilities", fileIds.join(",")],
    queryFn: async () => {
      if (fileIds.length === 0) return { capabilities: {} };
      const res = await api.post("/permissions/my-capabilities", { fileIds });
      return res.data as { capabilities: CapabilityMap };
    },
    enabled: fileIds.length > 0 && !isPrivileged,
    staleTime: 30_000, // cache for 30s — capabilities don't change that fast
  });

  if (isPrivileged) {
    const capMap: CapabilityMap = {};
    fileIds.forEach((id) => (capMap[id] = ALL_TRUE));
    return { capMap, isLoading: false };
  }

  return {
    capMap: data?.capabilities ?? {},
    isLoading,
  };
}

/** Helper: get a single capability for a file, defaults to false for VIEWERs */
export function getCap(
  capMap: CapabilityMap,
  fileId: string,
  cap: string,
): boolean {
  return capMap[fileId]?.[cap] ?? false;
}
