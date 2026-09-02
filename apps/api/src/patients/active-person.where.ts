/**
 * Active PERSONS filter.
 * Prisma `{ DISCONTINUE_FLAG: { not: 'Y' } }` becomes SQL `<> 'Y'`, which excludes NULL.
 * Legacy/migrated rows usually have NULL — treat those as active.
 */
export const ACTIVE_PERSON_WHERE = {
  OR: [
    { DISCONTINUE_FLAG: null },
    { DISCONTINUE_FLAG: { not: 'Y' as const } },
  ],
} as const;
