import { createWriteStream, rmSync } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const errorMessage = (error) => {
  if (!(error instanceof Error)) return String(error);
  const cause = error.cause instanceof Error ? `: ${error.cause.message}` : "";
  return `${error.message}${cause}`;
};

export const downloadFile = async (url, destination, {
  fetchImpl = fetch,
  attempts = 3,
  timeoutMs = 120_000,
  waitImpl = wait,
} = {}) => {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    rmSync(destination, { force: true });
    try {
      const response = await fetchImpl(url, {
        redirect: "follow",
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok || !response.body) {
        const failure = new Error(`HTTP ${response.status} ${response.statusText}`.trim());
        if (response.status < 500 || attempt === attempts) throw failure;
        lastError = failure;
      } else {
        await pipeline(Readable.fromWeb(response.body), createWriteStream(destination));
        return;
      }
    } catch (error) {
      lastError = error;
      if (attempt === attempts) break;
    }
    await waitImpl(attempt * 500);
  }
  rmSync(destination, { force: true });
  throw new Error(`Download failed after ${attempts} attempts for ${url} (${errorMessage(lastError)})`);
};
