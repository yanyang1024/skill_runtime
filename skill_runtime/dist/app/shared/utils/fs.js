import fs from "node:fs/promises";
import path from "node:path";
export async function copyDir(src, dest) {
    await fs.mkdir(dest, { recursive: true });
    const entries = await fs.readdir(src, { withFileTypes: true });
    for (const entry of entries) {
        const s = path.join(src, entry.name);
        const d = path.join(dest, entry.name);
        if (entry.isDirectory()) {
            await copyDir(s, d);
        }
        else {
            await fs.copyFile(s, d);
        }
    }
}
export async function removeDir(dir) {
    await fs.rm(dir, { recursive: true, force: true });
}
export async function readDirNames(dir) {
    try {
        return await fs.readdir(dir);
    }
    catch {
        return [];
    }
}
//# sourceMappingURL=fs.js.map