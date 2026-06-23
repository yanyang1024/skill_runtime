import fs from "node:fs/promises";
import path from "node:path";

async function copyDir(src: string, dest: string): Promise<void> {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyDir(s, d);
    } else {
      await fs.copyFile(s, d);
    }
  }
}

export async function collectSessionLog(
  sourcePath: string,
  destDir: string,
): Promise<void> {
  const stat = await fs.stat(sourcePath).catch(() => null);
  if (!stat) return;

  if (stat.isDirectory()) {
    await copyDir(sourcePath, destDir);
  } else {
    await fs.mkdir(destDir, { recursive: true });
    await fs.copyFile(sourcePath, path.join(destDir, path.basename(sourcePath)));
  }
}
