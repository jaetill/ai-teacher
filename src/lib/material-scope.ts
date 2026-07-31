import { materials } from "@/db/schema";
import { eq, isNull, or } from "drizzle-orm";

// #566: direct ownership predicate for materials reads.
//
// materials.owner_email exists and is stamped on every insert path (#655);
// legacy rows were backfilled, but the isNull arm stays as the open-null
// policy (ADR-0044) so a future NULL row degrades to "legacy-shared" instead
// of vanishing. A missing caller email fails closed to legacy-only rows.
//
// Compose it into every WHERE that reads materials:
//   .where(and(inArray(materials.driveFolderId, ids), ownedMaterials(email)))
export function ownedMaterials(ownerEmail: string | null | undefined) {
  if (!ownerEmail) return isNull(materials.ownerEmail);
  return or(eq(materials.ownerEmail, ownerEmail), isNull(materials.ownerEmail));
}
