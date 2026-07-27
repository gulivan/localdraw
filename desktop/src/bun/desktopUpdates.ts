const RELEASES_API = "https://api.github.com/repos/gulivan/localdraw/releases?per_page=30";
const CACHE_TTL_MS = 10 * 60 * 1000;

export type UpdateChannel = "stable" | "prerelease";

type GithubRelease = {
  tag_name?: string;
  html_url?: string;
  prerelease?: boolean;
  draft?: boolean;
  published_at?: string;
};

type ParsedVersion = {
  major: number;
  minor: number;
  patch: number;
  prerelease: string[];
  normalized: string;
};

export type DesktopUpdateInfo = {
  currentVersion: string;
  channel: UpdateChannel;
  outboundEnabled: true;
  latestVersion: string | null;
  latestUrl: string | null;
  publishedAt: string | null;
  isUpdateAvailable: boolean | null;
  error?: string;
};

const cache = new Map<UpdateChannel, {
  fetchedAt: number;
  response: Omit<DesktopUpdateInfo, "currentVersion" | "isUpdateAvailable">;
}>();

export const parseDesktopReleaseVersion = (value: string): ParsedVersion | null => {
  const withoutPrefix = value.trim().replace(/^v/, "");
  const withoutDesktopSuffix = withoutPrefix.replace(/-desktop$/, "");
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/.exec(
    withoutDesktopSuffix,
  );
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4]?.split(".") ?? [],
    normalized: withoutDesktopSuffix,
  };
};

const compareIdentifiers = (left: string, right: string): number => {
  const leftNumeric = /^\d+$/.test(left);
  const rightNumeric = /^\d+$/.test(right);
  if (leftNumeric && rightNumeric) return Number(left) - Number(right);
  if (leftNumeric !== rightNumeric) return leftNumeric ? -1 : 1;
  return left.localeCompare(right);
};

export const compareDesktopVersions = (left: ParsedVersion, right: ParsedVersion): number => {
  for (const key of ["major", "minor", "patch"] as const) {
    if (left[key] !== right[key]) return left[key] - right[key];
  }
  if (left.prerelease.length === 0 || right.prerelease.length === 0) {
    if (left.prerelease.length === right.prerelease.length) return 0;
    return left.prerelease.length === 0 ? 1 : -1;
  }
  const length = Math.max(left.prerelease.length, right.prerelease.length);
  for (let index = 0; index < length; index += 1) {
    const leftPart = left.prerelease[index];
    const rightPart = right.prerelease[index];
    if (leftPart === undefined) return -1;
    if (rightPart === undefined) return 1;
    const comparison = compareIdentifiers(leftPart, rightPart);
    if (comparison !== 0) return comparison;
  }
  return 0;
};

export const pickLatestDesktopRelease = (
  releases: GithubRelease[],
  channel: UpdateChannel,
): GithubRelease | null => {
  const candidates = releases
    .filter((release) => !release.draft)
    .map((release) => ({
      release,
      version: parseDesktopReleaseVersion(release.tag_name ?? ""),
    }))
    .filter((candidate): candidate is { release: GithubRelease; version: ParsedVersion } =>
      candidate.version !== null &&
      (channel === "prerelease" || (!candidate.release.prerelease && candidate.version.prerelease.length === 0)),
    );
  return candidates.reduce<typeof candidates[number] | null>((latest, candidate) =>
    !latest || compareDesktopVersions(candidate.version, latest.version) > 0
      ? candidate
      : latest,
  null)?.release ?? null;
};

export const getDesktopUpdateInfo = async (
  currentVersion: string,
  channel: UpdateChannel,
): Promise<DesktopUpdateInfo> => {
  const now = Date.now();
  let cached = cache.get(channel);
  if (!cached || now - cached.fetchedAt >= CACHE_TTL_MS) {
    try {
      const response = await fetch(RELEASES_API, {
        headers: {
          Accept: "application/vnd.github+json",
          "User-Agent": `LocalDraw/${currentVersion}`,
        },
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw new Error(`GitHub API returned HTTP ${response.status}`);
      const body = await response.json();
      const latest = pickLatestDesktopRelease(
        Array.isArray(body) ? body as GithubRelease[] : [],
        channel,
      );
      const latestVersion = parseDesktopReleaseVersion(latest?.tag_name ?? "")?.normalized ?? null;
      cached = {
        fetchedAt: now,
        response: {
          channel,
          outboundEnabled: true,
          latestVersion,
          latestUrl: typeof latest?.html_url === "string" ? latest.html_url : null,
          publishedAt: typeof latest?.published_at === "string" ? latest.published_at : null,
        },
      };
    } catch (error) {
      cached = {
        fetchedAt: now,
        response: {
          channel,
          outboundEnabled: true,
          latestVersion: null,
          latestUrl: null,
          publishedAt: null,
          error: error instanceof Error ? error.message : "Update check failed",
        },
      };
    }
    cache.set(channel, cached);
  }

  const current = parseDesktopReleaseVersion(currentVersion);
  const latest = parseDesktopReleaseVersion(cached.response.latestVersion ?? "");
  return {
    ...cached.response,
    currentVersion,
    isUpdateAvailable: current && latest
      ? compareDesktopVersions(latest, current) > 0
      : null,
  };
};
