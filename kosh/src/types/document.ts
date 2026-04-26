import { z } from 'zod';

export const DocumentTypeSchema = z.enum([
  'zerodha_xlsx',
  'zerodha_pl_xlsx',
  'groww_mf_xlsx',
  'w_groww_pdf',
  'screenshot',
  'fd_receipt',
  'other',
]);
export type DocumentType = z.infer<typeof DocumentTypeSchema>;

export const DocumentSchema = z.object({
  id: z.string(),
  accountId: z.string().optional(),
  type: DocumentTypeSchema,
  filename: z.string().optional(),
  encryptedPath: z.string(),
  sha256: z.string(),
  capturedAt: z.string(),
});
export type DocumentRecord = z.infer<typeof DocumentSchema>;
