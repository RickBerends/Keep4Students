import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { config } from "../config.js";

/**
 * Where uploaded media goes. Local disk today; the interface is deliberately
 * small so swapping in S3/R2 later is a one-file change.
 */
export interface Storage {
  /** Moves a file already on disk (multer's temp output) into permanent storage. */
  save(tempPath: string, originalName: string): Promise<string>;
  readStream(key: string): fs.ReadStream;
  absolutePath(key: string): string;
  remove(key: string): Promise<void>;
}

function safeExtension(originalName: string): string {
  const ext = path.extname(originalName).toLowerCase();
  // Only letters/digits, and short. Anything weird gets dropped entirely.
  return /^\.[a-z0-9]{1,5}$/.test(ext) ? ext : "";
}

export const localStorage: Storage = {
  async save(tempPath, originalName) {
    const key = `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${safeExtension(originalName)}`;
    const dest = path.join(config.uploadDir, key);
    await fs.promises.rename(tempPath, dest).catch(async (err: NodeJS.ErrnoException) => {
      // rename fails across filesystems; fall back to copy+unlink.
      if (err.code !== "EXDEV") throw err;
      await fs.promises.copyFile(tempPath, dest);
      await fs.promises.unlink(tempPath);
    });
    return key;
  },

  readStream(key) {
    return fs.createReadStream(this.absolutePath(key));
  },

  absolutePath(key) {
    // Defend against a key ever containing traversal characters.
    const resolved = path.resolve(config.uploadDir, path.basename(key));
    return resolved;
  },

  async remove(key) {
    await fs.promises.unlink(this.absolutePath(key)).catch(() => {});
  },
};

export const storage: Storage = localStorage;

export async function sha256File(filePath: string): Promise<string> {
  const hash = crypto.createHash("sha256");
  await new Promise<void>((resolve, reject) => {
    const stream = fs.createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve());
  });
  return hash.digest("hex");
}
