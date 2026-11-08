import "server-only";
import { db } from "@/lib/db";
import { getDefaultResume } from "@/lib/resume/service";
import { cosine, getEmbedder, type Embedder } from "./embedder";
import { scoreMatch, textForJob } from "./score";

// recomputeMatches (ARCHITECTURE contract): score every open job against the user's default resume,
// upsert Match rows, delete matches for closed jobs. Called after resume upload / set-default and by
// the worker after each scrape.

export interface RecomputeDeps {
  embedder?: Embedder;
}

const EMBED_BATCH = 128;
const WRITE_BATCH = 200;

const chunk = <T>(items: readonly T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, (index + 1) * size));

async function embedAll(embedder: Embedder, texts: readonly string[]): Promise<number[][]> {
  const vectors: number[][] = [];
  for (const batch of chunk(texts, EMBED_BATCH)) {
    const result = await embedder.embed(batch);
    if (result.length !== batch.length) {
      throw new Error(`Embedder ${embedder.name} returned ${result.length} vectors for ${batch.length} texts`);
    }
    vectors.push(...result);
  }
  return vectors;
}

/** Returns the number of Match rows written (one per open job). */
export async function recomputeMatches(userId: string, deps: RecomputeDeps = {}): Promise<number> {
  const resume = await getDefaultResume(userId);
  const resumeText = resume?.parsedText.trim() ?? "";
  if (!resumeText) {
    await db.match.deleteMany({ where: { userId } });
    return 0;
  }

  const embedder = deps.embedder ?? getEmbedder();
  const jobs = await db.job.findMany({
    where: { closedAt: null },
    select: { id: true, title: true, description: true },
    orderBy: { id: "asc" },
  });
  const jobTexts = jobs.map(textForJob);
  const [resumeVector, ...jobVectors] = await embedAll(embedder, [resumeText, ...jobTexts]);

  const rows = jobs.map((job, index) => {
    const { score, reasons } = scoreMatch({
      resumeText,
      jobText: jobTexts[index],
      similarity: cosine(resumeVector, jobVectors[index]),
    });
    return { jobId: job.id, score, reasons };
  });

  for (const batch of chunk(rows, WRITE_BATCH)) {
    await db.$transaction(
      batch.map((row) =>
        db.match.upsert({
          where: { userId_jobId: { userId, jobId: row.jobId } },
          create: { userId, jobId: row.jobId, score: row.score, reasons: row.reasons },
          update: { score: row.score, reasons: row.reasons },
        }),
      ),
    );
  }
  await db.match.deleteMany({ where: { userId, job: { closedAt: { not: null } } } });
  return rows.length;
}
