export interface PassphraseStrength {
  score: 0 | 1 | 2 | 3 | 4;
  label: 'Too weak' | 'Weak' | 'Fair' | 'Good' | 'Strong';
}

export function evaluateStrength(p: string): PassphraseStrength {
  if (!p) return { score: 0, label: 'Too weak' };
  let score = 0;
  if (p.length >= 8) score++;
  if (p.length >= 12) score++;
  if (/[a-z]/.test(p) && /[A-Z]/.test(p)) score++;
  if (/\d/.test(p) && /[^A-Za-z0-9]/.test(p)) score++;
  // clamp
  const s = Math.min(4, score) as 0 | 1 | 2 | 3 | 4;
  const labels: PassphraseStrength['label'][] = ['Too weak', 'Weak', 'Fair', 'Good', 'Strong'];
  return { score: s, label: labels[s]! };
}

export function isPassphraseAcceptable(p: string): { ok: true } | { ok: false; reason: string } {
  if (p.length < 12) return { ok: false, reason: 'Use at least 12 characters' };
  if (!/[A-Za-z]/.test(p)) return { ok: false, reason: 'Include at least one letter' };
  if (!/\d/.test(p)) return { ok: false, reason: 'Include at least one number' };
  return { ok: true };
}
