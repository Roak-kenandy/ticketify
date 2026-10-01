import axiosInterceptorInstance, { REPORT_TIMEOUT_MS } from "./axios-interceptor";

export async function downloadFile(
  url: string,
  filename: string,
  mimeType: string,
): Promise<void> {
  const response = await axiosInterceptorInstance.get(url, {
    responseType: "blob",
    timeout: REPORT_TIMEOUT_MS,
  });
  const blob = new Blob([response.data], { type: mimeType });
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}

export function buildQuery(params: Record<string, string | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value && value !== "all") {
      search.set(key, value);
    }
  }
  const query = search.toString();
  return query ? `?${query}` : "";
}
