export interface IssuanceInput {
  name: string;
  course: string;
  date: string;
  email?: string;
  meta?: Record<string, unknown>;
}

export interface Alignment {
  targetFramework: string;
  targetCode: string;
  targetName: string;
  targetUrl: string;
}

export interface CourseEntry {
  name: string;
  description: string;
  hours: number;
  tags?: string[];
  alignment?: Alignment[];
  language?: string;
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
}

export interface IssuanceResult {
  code: string;
  credentialPath: string;
  endorsementPath: string;
  credentialHash: string;
  endorsementHash: string;
}

export interface Signer {
  id: string;
  algorithm: string;
  sign: (opts: { data: Uint8Array }) => Promise<Uint8Array>;
}
