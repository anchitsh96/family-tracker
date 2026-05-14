import { z } from 'zod';

// A snapshot's `breakdown` is a denormalised cache of bucket → value for
// the buckets that actually had holdings at snapshot time. It is NEVER
// exhaustive across all buckets.
//
// IMPORTANT: do not use `z.record(BucketSchema, z.number())` here. In
// Zod 4, a record with an enum key schema is treated as EXHAUSTIVE — it
// demands every bucket key be present and throws `invalid_type` for any
// missing one. That made `SnapshotRepository.latest()` throw an uncaught
// ZodError on every real snapshot. A plain string-keyed record is the
// correct, crash-proof shape for a cache like this.
export const SnapshotSchema = z.object({
  id: z.string(),
  profileId: z.string(),
  totalInr: z.number(),
  breakdown: z.record(z.string(), z.number()),
  createdAt: z.string(),
});
export type Snapshot = z.infer<typeof SnapshotSchema>;
