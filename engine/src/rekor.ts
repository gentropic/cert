// Sigstore Rekor transparency logging. Shells out to `cosign sign-blob`.
// OIDC identity comes from the environment — GitHub Actions runners have one
// automatically (with `id-token: write`); local invocations need interactive
// OAuth flow. Callers skip this entirely by leaving EngineConfig.rekor unset.

export interface RekorConfig {
  // Path to the cosign binary; defaults to "cosign" (resolved via PATH).
  cosignPath?: string;
}

export interface CosignInvocation {
  success: boolean;
  stderr: string;
}

export type CosignRunner = (args: string[]) => Promise<CosignInvocation>;

export function systemCosignRunner(cosignPath: string): CosignRunner {
  return async (args: string[]) => {
    const proc = new Deno.Command(cosignPath, { args, stdout: "piped", stderr: "piped" });
    const { success, stderr } = await proc.output();
    return { success, stderr: new TextDecoder().decode(stderr) };
  };
}

export interface LogBlobOptions {
  subjectPath: string;
  bundlePath: string;
  cosignPath?: string;
  runner?: CosignRunner;
}

export async function logBlob(opts: LogBlobOptions): Promise<{ bundlePath: string }> {
  const cosignPath = opts.cosignPath ?? "cosign";
  const runner = opts.runner ?? systemCosignRunner(cosignPath);
  const args = ["sign-blob", "--bundle", opts.bundlePath, "--yes", opts.subjectPath];
  const { success, stderr } = await runner(args);
  if (!success) {
    throw new Error(`cosign sign-blob failed for ${opts.subjectPath}: ${stderr.trim()}`);
  }
  return { bundlePath: opts.bundlePath };
}
