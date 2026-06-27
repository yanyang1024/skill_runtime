export declare function copyDir(src: string, dest: string): Promise<void>;
export declare function copyDirAtomic(src: string, dest: string): Promise<void>;
export declare function removeDir(dir: string): Promise<void>;
/**
 * 硬链接目录树。对只读源使用硬链接（零 IO 复制），
 * 跨设备失败时回退到 copyFile。
 */
export declare function hardlinkDir(src: string, dest: string): Promise<void>;
export declare function readDirNames(dir: string): Promise<string[]>;
//# sourceMappingURL=fs.d.ts.map