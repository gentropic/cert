export interface IssuanceInput {
  name: string;
  course: string;
  date: string;
  email?: string;
  meta?: Record<string, unknown>;
}

export interface Alignment {
  type?: string[];
  targetFramework: string;
  targetCode: string;
  targetName: string;
  targetUrl: string;
}

// Flat per-locale view consumed by the signing pipeline.
export interface CourseEntry {
  name: string;
  description: string;
  hours: number;
  tags?: string[];
  alignment?: Alignment[];
  language: string;
  series?: string;
}

// Authoring format of the top-level courses.json (nested, multi-locale).
export interface CoursesDocument {
  series: Record<string, SeriesEntry>;
  courses: Record<string, RichCourse>;
}

export interface SeriesEntry {
  name: string;
  org: string;
  issuer: string;
  issuerTitle: Record<string, string>;
  layout: string;
  pageAccent: string;
  pageBg: string;
}

export interface RichCourse {
  series: string;
  title: Record<string, string>;
  desc: Record<string, string[]>;
  hours: number;
  color?: string;
  layout?: string;
  tags?: string[];
  alignment?: Alignment[];
}

export interface StatusListConfig {
  // URL the status list is served at (goes into each credential's credentialStatus.statusListCredential).
  publicUrl: string;
  // Path to the monotonic next-index counter file on disk.
  nextIndexPath: string;
}

export interface LedgerConfig {
  path: string;
  tipPath?: string;
}

// deno-lint-ignore no-explicit-any
export type CosignRunner = (args: string[]) => Promise<{ success: boolean; stderr: string }>;

export interface RekorConfig {
  cosignPath?: string;
  // Inject a fake runner for tests; omitted in production.
  runner?: CosignRunner;
}

export interface EngineConfig {
  baseUrl: string;
  issuerId: string;
  verificationMethod: string;
  signingKeyPem: string;
  codeSalt: string;
  recipientSalt: string;
  repoRoot: string;
  courses: Record<string, CourseEntry>;
  pinnedDocuments?: Record<string, unknown>;
  statusList?: StatusListConfig;
  ledger?: LedgerConfig;
  rekor?: RekorConfig;
}

export interface IssuanceResult {
  code: string;
  credentialPath: string;
  endorsementPath: string;
  credentialHash: string;
  endorsementHash: string;
  statusIndex?: number;
  ledgerIndex?: number;
  rekorBundlePaths?: {
    credential: string;
    endorsement: string;
    ledgerTip?: string;
  };
}

export interface Signer {
  id: string;
  algorithm: string;
  sign: (opts: { data: Uint8Array }) => Promise<Uint8Array>;
}
