import { useQuery } from "@tanstack/react-query";
import api from "../api/axios";

export type CapabilityMap = Record<string, Record<string, boolean>>;

export function useFileCapabilities(fileIds: string[]): {
  capMap: CapabilityMap;
  isLoading: boolean;
} {
  const { data, isLoading } = useQuery({
    queryKey: ["file-capabilities", fileIds.join(",")],
    queryFn: async () => {
      if (fileIds.length === 0) return { capabilities: {} };
      const res = await api.post("/permissions/my-capabilities", { fileIds });
      return res.data as { capabilities: CapabilityMap };
    },
    enabled: fileIds.length > 0,
    staleTime: 30_000,
  });

  return {
    capMap: data?.capabilities ?? {},
    isLoading,
  };
}

export function getCap(
  capMap: CapabilityMap,
  fileId: string,
  cap: string,
): boolean {
  return capMap[fileId]?.[cap] ?? false;
}
