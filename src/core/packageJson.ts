import { z } from 'zod';

const stringMap = z.record(z.string(), z.string()).catch({});
const optionalString = z.string().optional().catch(undefined);

/** Only the fields docsync uses; anything malformed degrades to "absent" instead of failing the run. */
const packageSchema = z.looseObject({
  name: optionalString,
  version: optionalString,
  description: optionalString,
  license: optionalString,
  keywords: z.array(z.string()).optional().catch(undefined),
  engines: stringMap.optional(),
  scripts: stringMap.optional(),
  dependencies: stringMap.optional(),
  devDependencies: stringMap.optional(),
  packageManager: optionalString,
});

export type PackageJson = z.infer<typeof packageSchema>;

export function parsePackageJson(text: string): PackageJson | null {
  try {
    const parsed = packageSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Resolved versions from package-lock.json v2/v3 (`packages["node_modules/x"].version`). v1 is not supported (DR-11). */
export function parseLockfileVersions(
  text: string,
): { versions: Map<string, string> } | { unsupported: string } {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { unsupported: 'package-lock.json is not valid JSON' };
  }
  const lock = json as { lockfileVersion?: number; packages?: Record<string, { version?: unknown }> };
  if (!lock.packages || (lock.lockfileVersion ?? 1) < 2) {
    return {
      unsupported: `package-lock.json v${lock.lockfileVersion ?? 1} is not supported; showing declared ranges`,
    };
  }
  const versions = new Map<string, string>();
  for (const [key, value] of Object.entries(lock.packages)) {
    const match = /^node_modules\/((?:@[^/]+\/)?[^/]+)$/.exec(key);
    if (match?.[1] && typeof value.version === 'string') versions.set(match[1], value.version);
  }
  return { versions };
}
