// A simple sign-on gate. Important limitation, worth stating plainly rather than pretending
// otherwise: this app is a fully static, client-side site with no backend (Section 2), deployed
// straight to GitHub Pages. Everything shipped to the browser — including this file and the
// hashes below — is downloadable and inspectable by anyone who opens dev tools or clones the
// repo. Hashing the password (rather than storing it in plain text) and salting it (so the same
// password doesn't produce the same hash for two different users, and so a precomputed
// "rainbow table" of common password hashes doesn't work directly) is worth doing since it's
// nearly free, but this can only ever be a speed bump against casual access — never real
// security against someone determined. A genuine access-control system needs a real backend,
// which is explicitly out of scope (Section 2/9).

export interface AuthUser {
  email: string;
  /** Random per-user salt (hex), mixed in before hashing so two users with the same password
   * don't share a hash, and so a precomputed table of common-password hashes doesn't apply
   * directly. Not a substitute for a real backend — see the file-level note above. */
  salt: string;
  /** SHA-256 hex digest of `salt + password`. */
  hash: string;
}

// Seeded manually. To add or change a user, compute a fresh salt + hash (e.g. via Node's
// `crypto` module: `salt = crypto.randomBytes(16).toString('hex')`,
// `hash = crypto.createHash('sha256').update(salt + password).digest('hex')`) and add/replace
// an entry here.
export const AUTH_USERS: AuthUser[] = [
  {
    email: 'jamesar@jar-and-a.com',
    salt: '3d9c10bdc6f44dbf9043d887b17004ba',
    hash: '65801540df9ec652244f2de713fbe70ecaa02010716c34ce48d462c2844e0ba2',
  },
];

/** Whom to contact for a password reset — shown on the login screen. There's no automated
 * reset flow (no backend to send email or manage tokens), so this is literally "email me". */
export const PASSWORD_RESET_CONTACT = 'jamesar@jar-and-a.com';

async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function verifyLogin(email: string, password: string): Promise<boolean> {
  const normalizedEmail = email.trim().toLowerCase();
  const user = AUTH_USERS.find((u) => u.email.toLowerCase() === normalizedEmail);
  if (!user) return false;
  const hash = await sha256Hex(user.salt + password);
  return hash === user.hash;
}

const SESSION_KEY = 'taxonomy-builder-auth-email';

/** Remembers a successful login in this browser (localStorage, not per-tab) so signing on
 * isn't required on every visit — cleared only by Log Out or clearing site data. */
export function getStoredAuthEmail(): string | null {
  try {
    return localStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

export function storeAuthEmail(email: string): void {
  try {
    localStorage.setItem(SESSION_KEY, email);
  } catch {
    // Private browsing or storage disabled — login still works, just re-asked next visit.
  }
}

export function clearAuthEmail(): void {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    // Nothing to clear if storage isn't available in the first place.
  }
}
