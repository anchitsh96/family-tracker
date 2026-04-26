import { z } from 'zod';

export const ProfileSchema = z.object({
  id: z.string().min(1),
  displayName: z.string().min(1),
  isDefault: z.boolean(),
  accentColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  createdAt: z.string(),
});

export type Profile = z.infer<typeof ProfileSchema>;
