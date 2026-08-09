import { decode as decodeJpeg, encode as encodeJpeg } from "jpeg-js";
import { PNG } from "pngjs";

export type CompressedMcpImage = {
  bytes: Buffer;
  mimeType: "image/jpeg";
  width: number;
  height: number;
};

const MAX_SOURCE_PIXELS = 40_000_000;
const TARGET_DIMENSIONS = [2800, 2200, 1800, 1400, 1000];
const JPEG_QUALITIES = [82, 72, 62, 52, 42];

const dimensionsFor = (width: number, height: number, maxDimension: number) => {
  const largest = Math.max(width, height);
  const scale = Math.min(1, maxDimension / largest);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
};

const resizeRgba = (source: Uint8Array, sourceWidth: number, sourceHeight: number, width: number, height: number): Buffer => {
  const target = Buffer.allocUnsafe(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const sourceY = Math.min(sourceHeight - 1, Math.floor((y + 0.5) * sourceHeight / height));
    for (let x = 0; x < width; x += 1) {
      const sourceX = Math.min(sourceWidth - 1, Math.floor((x + 0.5) * sourceWidth / width));
      const sourceOffset = (sourceY * sourceWidth + sourceX) * 4;
      const targetOffset = (y * width + x) * 4;
      const alpha = source[sourceOffset + 3] / 255;
      target[targetOffset] = Math.round(source[sourceOffset] * alpha + 255 * (1 - alpha));
      target[targetOffset + 1] = Math.round(source[sourceOffset + 1] * alpha + 255 * (1 - alpha));
      target[targetOffset + 2] = Math.round(source[sourceOffset + 2] * alpha + 255 * (1 - alpha));
      target[targetOffset + 3] = 255;
    }
  }
  return target;
};

const decodeRgba = (bytes: Buffer, mimeType: string) => {
  if (mimeType === "image/png") {
    if (bytes.length < 24 || bytes.toString("ascii", 1, 4) !== "PNG") throw new Error("Invalid PNG image");
    const width = bytes.readUInt32BE(16);
    const height = bytes.readUInt32BE(20);
    if (!width || !height || width * height > MAX_SOURCE_PIXELS) throw new Error("Image dimensions are too large to compress safely");
    const decoded = PNG.sync.read(bytes, { checkCRC: true, skipRescale: false });
    return { data: decoded.data, width: decoded.width, height: decoded.height };
  }
  if (mimeType === "image/jpeg") {
    const decoded = decodeJpeg(bytes, { useTArray: true, formatAsRGBA: true, tolerantDecoding: true, maxResolutionInMP: 40, maxMemoryUsageInMB: 384 });
    if (!decoded.width || !decoded.height || decoded.width * decoded.height > MAX_SOURCE_PIXELS) throw new Error("Image dimensions are too large to compress safely");
    return decoded;
  }
  throw new Error(`Automatic MCP compression is unavailable for ${mimeType}`);
};

export const compressImageForMcp = (bytes: Buffer, mimeType: string, maxBytes: number): CompressedMcpImage => {
  const decoded = decodeRgba(bytes, mimeType);
  let smallest: CompressedMcpImage | null = null;
  for (let index = 0; index < TARGET_DIMENSIONS.length; index += 1) {
    const dimensions = dimensionsFor(decoded.width, decoded.height, TARGET_DIMENSIONS[index]);
    const rgba = resizeRgba(decoded.data, decoded.width, decoded.height, dimensions.width, dimensions.height);
    const encoded = encodeJpeg({ data: rgba, ...dimensions }, JPEG_QUALITIES[index]).data;
    const candidate: CompressedMcpImage = { bytes: encoded, mimeType: "image/jpeg", ...dimensions };
    if (!smallest || candidate.bytes.length < smallest.bytes.length) smallest = candidate;
    if (candidate.bytes.length <= maxBytes) return candidate;
  }
  if (smallest && smallest.bytes.length <= maxBytes) return smallest;
  throw new Error(`Image could not be compressed below ${Math.round(maxBytes / 1024 / 1024)} MB`);
};
