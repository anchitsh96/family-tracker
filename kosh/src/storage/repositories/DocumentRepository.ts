import { ulid } from 'ulid';
import { getDb } from '../db';
import { DocumentRecord, DocumentSchema, DocumentType } from '@/types/document';

interface Row {
  id: string;
  account_id: string | null;
  type: string;
  filename: string | null;
  encrypted_path: string;
  sha256: string;
  captured_at: string;
}

function rowToDoc(r: Row): DocumentRecord {
  return DocumentSchema.parse({
    id: r.id,
    accountId: r.account_id ?? undefined,
    type: r.type,
    filename: r.filename ?? undefined,
    encryptedPath: r.encrypted_path,
    sha256: r.sha256,
    capturedAt: r.captured_at,
  });
}

export const DocumentRepository = {
  list(): DocumentRecord[] {
    const db = getDb();
    const res = db.executeSync('SELECT * FROM documents ORDER BY captured_at DESC;');
    return (res.rows ?? []).map((r) => rowToDoc(r as unknown as Row));
  },

  create(input: {
    accountId?: string;
    type: DocumentType;
    filename?: string;
    encryptedPath: string;
    sha256: string;
  }): DocumentRecord {
    const db = getDb();
    const id = ulid();
    const ts = new Date().toISOString();
    db.executeSync(
      `INSERT INTO documents (id, account_id, type, filename, encrypted_path, sha256, captured_at)
       VALUES (?, ?, ?, ?, ?, ?, ?);`,
      [
        id,
        input.accountId ?? null,
        input.type,
        input.filename ?? null,
        input.encryptedPath,
        input.sha256,
        ts,
      ]
    );
    return {
      id,
      accountId: input.accountId,
      type: input.type,
      filename: input.filename,
      encryptedPath: input.encryptedPath,
      sha256: input.sha256,
      capturedAt: ts,
    };
  },

  delete(id: string) {
    getDb().execute('DELETE FROM documents WHERE id = ?;', [id]);
  },
};
