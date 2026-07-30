// Quarter-aware unit placement.
//
// Units are stored flat with a sortOrder; quarters are just a field. When a
// unit's quarter changes (via the editor's quarter picker), it should move to
// sit with its quarter group instead of staying wherever it was created
// (typically the bottom, where "+ Add unit" appends). This computes the new
// ordering; the caller persists the changed sortOrders.

const QUARTER_RANK: Record<string, number> = {
  Summer: 0,
  Q1: 1,
  Q2: 2,
  Q3: 3,
  Q4: 4,
};

export function quarterRank(quarter: string | null | undefined): number {
  if (quarter == null) return Number.MAX_SAFE_INTEGER; // quarterless units sink to the end
  return QUARTER_RANK[quarter] ?? Number.MAX_SAFE_INTEGER;
}

/**
 * Return the units re-ordered so `unitId` (with its new `quarter`) sits at the
 * END of its quarter's group — after existing units of that quarter, before
 * the first unit of a later quarter — with sortOrder renumbered 1..n.
 * Relative order of all other units is preserved. Returns the input array
 * unchanged (same reference) when the unit is unknown.
 */
export function placeUnitInQuarter<
  T extends { id: string; quarter: string | null; sortOrder: number },
>(units: T[], unitId: string, quarter: string | null): T[] {
  const moving = units.find((u) => u.id === unitId);
  if (!moving) return units;

  const rest = units.filter((u) => u.id !== unitId);
  const rank = quarterRank(quarter);
  let insertAt = rest.findIndex((u) => quarterRank(u.quarter) > rank);
  if (insertAt === -1) insertAt = rest.length;

  const next = [
    ...rest.slice(0, insertAt),
    { ...moving, quarter },
    ...rest.slice(insertAt),
  ];
  return next.map((u, i) => ({ ...u, sortOrder: i + 1 }));
}
