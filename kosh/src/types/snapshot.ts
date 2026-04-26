import { z } from 'zod';
import { BucketSchema } from './account';

export const SnapshotSchema = z.object({
  id: z.string(),
  profileId: z.string(),
  totalInr: z.number(),
  breakdown: z.record(BucketSchema, z.number()),
  createdAt: z.string(),
});
export type Snapshot = z.infer<typeof SnapshotSchema>;
