import "server-only";

import sharp from "sharp";
import { IMAGE_WIDTHS, type ImageWidth } from "@/server/services/storage";

export type Renditions = {
  width: number;
  height: number;
  dominantColor: string;
  files: { width: ImageWidth; body: Buffer }[];
};

/**
 * Turn any uploaded photo into WebP renditions at fixed widths. Strips
 * metadata (EXIF location) by default, applies EXIF rotation, never upscales.
 */
export async function makeRenditions(input: Buffer): Promise<Renditions> {
  const base = sharp(input, { failOn: "error", limitInputPixels: 40_000_000 }).rotate();
  const meta = await base.metadata();
  const srcWidth = meta.autoOrient?.width ?? meta.width ?? 0;
  const srcHeight = meta.autoOrient?.height ?? meta.height ?? 0;
  if (!srcWidth || !srcHeight) throw new Error("Unreadable image");

  const stats = await sharp(input).rotate().stats();
  const { r, g, b } = stats.dominant;
  const dominantColor = `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;

  const files: Renditions["files"] = [];
  for (const width of IMAGE_WIDTHS) {
    const body = await sharp(input)
      .rotate()
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: 78, effort: 4 })
      .toBuffer();
    files.push({ width, body });
  }

  return { width: srcWidth, height: srcHeight, dominantColor, files };
}
