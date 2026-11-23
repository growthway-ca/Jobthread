/** A schedule item, as far as stages are concerned. Shutoffs (with a utility) aren't stages. */
export interface StageLike {
  title: string;
  starts_on: string;
  utility?: string | null;
  done_on?: string | null;
}

export interface StageProgress<T extends StageLike> {
  stages: T[];
  doneCount: number;
  /** The first stage not marked done, in date order. */
  current: T | null;
  fraction: number;
  /** "2 of 5 stages · Now: Rough-ins", "3 of 3 stages · Work done" or "No stages". */
  label: string;
}

export function stageProgress<T extends StageLike>(schedule: T[]): StageProgress<T> {
  const stages = schedule.filter((s) => !s.utility).sort((a, b) => a.starts_on.localeCompare(b.starts_on));
  const doneCount = stages.filter((s) => s.done_on).length;
  const current = stages.find((s) => !s.done_on) ?? null;
  const total = stages.length;
  const label =
    total === 0
      ? 'No stages'
      : current
        ? `${doneCount} of ${total} stages · Now: ${current.title}`
        : `${total} of ${total} stages · Work done`;
  return { stages, doneCount, current, fraction: total ? doneCount / total : 0, label };
}

/**
 * The work is well ahead of the money: at least 30 points more of the
 * stages done than of the job paid. Time to ask for the next draw.
 */
export function workAheadOfMoney(stageFraction: number, paidFraction: number, hasStages: boolean): boolean {
  return hasStages && stageFraction - paidFraction >= 0.3;
}
