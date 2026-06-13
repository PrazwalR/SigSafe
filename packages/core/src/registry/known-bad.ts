/**
 * Community drainer blocklist.
 *
 * Seeded empty on purpose: shipping stale or unverified "bad" addresses would
 * cause false CRITICALs and erode trust. The real list belongs in a
 * data/known-drainers.json fed by ScamSniffer / Chainalysis reports and loaded
 * at build time. Until then this works entirely through `customBlocklist`.
 *
 * The blocklist is a *bonus*; the structural rules (permit-to-eoa,
 * unlimited-approval) are the real defence against never-before-seen drainers.
 */
const KNOWN_DRAINERS = new Set<string>();

export function isKnownDrainer(address: string | undefined, custom?: readonly string[]): boolean {
  if (!address) return false;
  const a = address.toLowerCase();
  if (KNOWN_DRAINERS.has(a)) return true;
  if (custom) {
    for (const c of custom) {
      if (c.toLowerCase() === a) return true;
    }
  }
  return false;
}
