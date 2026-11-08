// Which campaign version governs (brief ground rule 3): the newest approved one. A newer unapproved
// version is "pending" and changes nothing until approved.

export interface VersionLike {
  createdAt: Date;
  approvedAt: Date | null;
}

type Approved<T extends VersionLike> = T & { approvedAt: Date };

const isApproved = <T extends VersionLike>(version: T): version is Approved<T> => version.approvedAt != null;

const byCreatedDesc = (a: VersionLike, b: VersionLike): number => b.createdAt.getTime() - a.createdAt.getTime();

const byCreatedThenApprovedDesc = (a: Approved<VersionLike>, b: Approved<VersionLike>): number =>
  byCreatedDesc(a, b) || b.approvedAt.getTime() - a.approvedAt.getTime();

/** The newest version with `approvedAt` set, or null. Does not reorder the input. */
export function pickVersionInForce<T extends VersionLike>(versions: readonly T[]): T | null {
  return versions.filter(isApproved).sort(byCreatedThenApprovedDesc)[0] ?? null;
}

/** The newest unapproved version created after the one in force (or any, if none is in force), else null. */
export function pendingVersion<T extends VersionLike>(versions: readonly T[]): T | null {
  const inForce = pickVersionInForce(versions);
  const cutoff = inForce ? inForce.createdAt.getTime() : Number.NEGATIVE_INFINITY;
  return (
    versions
      .filter((version) => !isApproved(version) && version.createdAt.getTime() > cutoff)
      .sort(byCreatedDesc)[0] ?? null
  );
}
