import { useQuery } from "@tanstack/react-query";
import api from "../api/axios";
import type { CapabilityMap } from "./useFileCapabilities";

export function useFolderCapabilities(folderIds: string[]): {
  capMap: CapabilityMap;
  isLoading: boolean;
} {
  const { data, isLoading } = useQuery({
    queryKey: ["folder-capabilities", folderIds.join(",")],
    queryFn: async () => {
      if (folderIds.length === 0) return { capabilities: {} };
      const res = await api.post("/permissions/my-folder-capabilities", {
        folderIds,
      });
      return res.data as { capabilities: CapabilityMap };
    },
    enabled: folderIds.length > 0,
    staleTime: 30_000,
  });

  return {
    capMap: data?.capabilities ?? {},
    isLoading,
  };
}
