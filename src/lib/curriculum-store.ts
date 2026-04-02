// Client-side localStorage store for year plans and units.
// All reads/writes are safe to call during SSR (guarded by typeof window check).

export interface CurriculumUnit {
  id: string;
  index: number;
  title: string;
  weeks: number;
  standards: string;
  summary: string;
  anchorTexts: string;
  flags: string;
  notes?: string;
  lessonPlan?: string;
}

export interface YearPlan {
  grade: number;
  schoolYear: string;
  rawPlan: string;
  units: CurriculumUnit[];
  createdAt: string;
}

const key = (grade: number) => `ai-teacher:yearplan:${grade}`;

export function saveYearPlan(plan: YearPlan): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(key(plan.grade), JSON.stringify(plan));
}

export function loadYearPlan(grade: number): YearPlan | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(key(grade));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as YearPlan;
  } catch {
    return null;
  }
}

export function findUnit(
  unitId: string
): { plan: YearPlan; unit: CurriculumUnit } | null {
  if (typeof window === "undefined") return null;
  for (const grade of [6, 7, 8]) {
    const plan = loadYearPlan(grade);
    if (!plan) continue;
    const unit = plan.units.find((u) => u.id === unitId);
    if (unit) return { plan, unit };
  }
  return null;
}

export function updateUnit(
  unitId: string,
  updates: Partial<CurriculumUnit>
): void {
  if (typeof window === "undefined") return;
  for (const grade of [6, 7, 8]) {
    const plan = loadYearPlan(grade);
    if (!plan) continue;
    const idx = plan.units.findIndex((u) => u.id === unitId);
    if (idx === -1) continue;
    plan.units[idx] = { ...plan.units[idx], ...updates };
    saveYearPlan(plan);
    return;
  }
}
