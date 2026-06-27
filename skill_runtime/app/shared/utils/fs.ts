import fs from "node:fs/promises";
import path from "node:path";

export async function copyDir(src: string, dest: string): Promise<void> {
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

export async function copyDirAtomic(src: string, dest: string): Promise<void> {
  const destTmp = `${dest}.atomic-tmp-${process.pid}`;
  await copyDir(src, destTmp);
  try {
    await fs.rename(destTmp, dest);
  } catch (err) {
    const tmpErr = err as NodeJS.ErrnoException;
    if (tmpErr.code === "ENOTEMPTY") {
      await fs.rm(dest, { recursive: true, force: true });
      await fs.rename(destTmp, dest);
    } else {
      throw err;
    }
  }
}

export async function removeDir(dir: string): Promise<void> {
  await fs.rm(dir, { recursive: true, force: true });
}

/**
 * 硬链接目录树。对只读源使用硬链接（零 IO 复制），
 * 跨设备失败时回退到 copyFile。
 */
export async function hardlinkDir(src: string, dest: string): Promise<void> {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await hardlinkDir(s, d);
    } else {
      try {
        await fs.link(s, d);
      } catch {
        await fs.copyFile(s, d);
      }
    }
  }
}

export async function readDirNames(dir: string): Promise<string[]> {
  try {
    return await fs.readdir(dir);
  } catch (err) {
    const nodeErr = err as NodeJS.ErrnoException;
    if (nodeErr.code === "ENOENT") {
      return [];
    }
    throw err;
  }
}
