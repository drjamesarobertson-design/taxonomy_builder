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
// short name works exactly as well as a real address; see Login.tsx's plain-text field. Every
// password here is that same identifier string, so the password field is *also* compared
// case-insensitively (both sides lower-cased before hashing, below) — otherwise "the password
// is your username" silently breaks the moment anyone types either field back in a different
// case than it happened to be seeded with (James's own report: typed his email address in its
// normal mixed case into both fields and got rejected). Hashes below were regenerated for this
// change; re-generate the same way (a fresh random salt, `sha256(salt + identifier.toLowerCase())`)
// if a login is ever added or changed.
export const AUTH_USERS: AuthUser[] = [
  {
    email: 'jamesar@jar-and-a.com',
    salt: 'd71a52016ac7912ffcd9a07d7d366d86',
    hash: '7a30b82f0d7f64388110624edb0886b72edaa2455b16c8e2cb988ebd83a24adc',
  },
  {
    email: 'Friend_1',
    salt: '0c84433d089456fb66635270701fa05a',
    hash: '76c2fa2b53632e39816b5ea3407723c895c54d4f68555c76a94ff59b386fd93a',
  },
  {
    email: 'Friend_2',
    salt: '2b3bc65a31790bdb7997d44521350871',
    hash: 'd43b7732f395c3d875b44b0b0fc62cd5dd81beadd52126d46e2416520a1d777b',
  },
  {
    email: 'Friend_3',
    salt: '7dc64bef2428d1206dfa7637b60b15b8',
    hash: 'ded334733888f49354cc5ee9dbc86e1073932b19ab36e7e045274f415844bea2',
  },
  {
    email: 'Friend_4',
    salt: 'e8553e1018cce49c2691e7d5093aa3c1',
    hash: '4f7bb9f6a8a67dc2aa2f7fb3edd1ca6e1b592067fd7e7d74bd2d16a3ca655c3f',
  },
  {
    email: 'Friend_5',
    salt: '2c22a91c9921162bf231f4c0e3499e01',
    hash: 'c3550db497e91974a1ff039de8ccb362f3b8f0738da537a4df2d097da8dac919',
  },
  {
    email: 'Friend_6',
    salt: 'fa17b3cb4d3933dd79657eae53fc0258',
    hash: '7408796da45f6ff9c48aa5916542d257e1e5f2e1282e2f8a3148d6b04a283d8c',
  },
  {
    email: 'Friend_7',
    salt: '3787dcae403cd218a26eba36253e391b',
    hash: '7824f2d120cb8334d3f8ec7d8fa8b9b166a6e233b606697f9f59ccb7d4654f5c',
  },
  {
    email: 'Friend_8',
    salt: '07b3f36a189e8b9f410c666726574e80',
    hash: 'f1de44e5d7f8a57451d04c80b994bdb1cf6544cbbe422c821148d0ee7605c304',
  },
  {
    email: 'Friend_9',
    salt: 'b212aefd8de2c9876b3c2f3387ae9758',
    hash: 'fc6374f15f58a5ecc38febb483b34f5e2e5738effae5e8815da393d424bd2e02',
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
  // Every password here is just the identifier itself (see AUTH_USERS above) — lower-cased the
  // same way the identifier/username field already is, so typing either field back in a
  // different case than it was seeded with doesn't fail a comparison that was never meant to be
  // case-sensitive in the first place.
  const hash = await sha256Hex(user.salt + password.trim().toLowerCase());
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
