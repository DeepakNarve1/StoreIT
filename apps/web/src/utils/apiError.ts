import axios from "axios";

/** Message from API `{ error: string }` or fallback for unknown errors */
export function apiErrorMessage(err: unknown, fallback: string): string {
  if (!axios.isAxiosError(err)) return fallback;
  const data = err.response?.data as { error?: string } | undefined;
  return data?.error ?? fallback;
}
