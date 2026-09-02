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
//
// James asked to hand out separate logins to up to nine friends so they can try the tool out
// under their own name rather than sharing his one login (each still gets their own private,
// empty workspace — nothing here shares data between accounts, see storage.ts/Library — this
// is purely about not having to hand out his own credential). "Email" is really just a login
// identifier — `verifyLogin` only ever compares it as a plain, case-insensitive string, so a
// short name works exactly as well as a real address; see Login.tsx's plain-text field.
export const AUTH_USERS: AuthUser[] = [
  {
    email: 'jamesar@jar-and-a.com',
    salt: '3d9c10bdc6f44dbf9043d887b17004ba',
    hash: '65801540df9ec652244f2de713fbe70ecaa02010716c34ce48d462c2844e0ba2',
  },
  {
    email: 'Friend_1',
    salt: 'c5423adbebcd783806909c6cd8e21a52',
    hash: 'cc7a83a7a8f9812d8b8d504941181c31ad6ae9239feae2832987c1d5ad5baf0b',
  },
  {
    email: 'Friend_2',
    salt: '1bc2ff3af4ea512cb30465beda539696',
    hash: '37c89322bb6e0e6270047bc3206121443c6ae44fee21ca11b65b6d94234aac94',
  },
  {
    email: 'Friend_3',
    salt: '83980775f9c0e0e23f9a3db1b8dbe2d5',
    hash: '87d6c9f1982f805466786d74f161522d479129389a7168f71d91ee881731d31c',
  },
  {
    email: 'Friend_4',
    salt: 'dbd752f47ca9d31291bcd3f6f275bbcc',
    hash: 'c321b58cb168d130d8b7114e9e625bbdf429613d825fcea3df6d8b666808e348',
  },
  {
    email: 'Friend_5',
    salt: '3c6f5b8e0309b32d576e8c0f36f067a8',
    hash: 'af4d51806141aed414b0fba912ab01af880eb38ac4c4ee21bcde30bb2f924401',
  },
  {
    email: 'Friend_6',
    salt: 'ad89211eb1e53726df19a9964fa2a71a',
    hash: '98f94bc2edf3cfe57b4f8f8ec237bd30193764c56c87c1051ed5a9561034f773',
  },
  {
    email: 'Friend_7',
    salt: '438e2e35bad01f96e506c007b04809ca',
    hash: 'bb30ea6d9fa980ca6064acba19167b140d8dc541d9757e58acbdbb10d0ec833d',
  },
  {
    email: 'Friend_8',
    salt: '799fa7e2a7f36b9975e2502bbddcfa49',
    hash: '42a6175349ab1d9aa15947747a9ce06903367042ac536f1b1dd13cb1c5407a96',
  },
  {
    email: 'Friend_9',
    salt: '6302e2386089c6b46ec334ed5c444b82',
    hash: '8d6bb64bab4da901b0f4ca893f4a96b7e5d3a57f4cd563b8040679c90966fc1c',
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
