import { z } from "zod";
import { getSessionUserId } from "@/lib/current-user";
import { readResumeFile } from "@/lib/resume";
import { contentDisposition } from "./content-disposition";

// GET /api/resumes/:id streams the stored file to its owner as an attachment. Anyone else (signed
// out, another user, unknown id, missing file) gets the same 404 so ids can't be probed.

const idSchema = z.string().trim().min(1).max(100);

const notFound = (): Response =>
  new Response("Not found", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const parsed = idSchema.safeParse((await context.params).id);
  if (!parsed.success) return notFound();

  try {
    const userId = await getSessionUserId();
    if (!userId) return notFound();
    const file = await readResumeFile(userId, parsed.data);
    if (!file) return notFound();
    return new Response(new Uint8Array(file.bytes), {
      status: 200,
      headers: {
        "Content-Type": file.contentType,
        "Content-Length": String(file.bytes.length),
        "Content-Disposition": contentDisposition(file.resume.filename),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("[api/resumes] download failed", { resumeId: parsed.data, error: error instanceof Error ? error.message : error });
    return new Response("Something went wrong", { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
