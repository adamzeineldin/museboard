// Pure; safe to import from client components.

/** The auth-checked download route for a resume (GET streams the file to its owner only). */
export function resumeDownloadPath(resumeId: string): string {
  return `/api/resumes/${encodeURIComponent(resumeId)}`;
}
