export interface RunPaths {
    runId: string;
    dir: string;
}
export declare function createRunDir(skillId: string): Promise<RunPaths>;
export declare function writeJson<T>(filePath: string, data: T): Promise<void>;
export declare function writeYaml<T>(filePath: string, data: T): Promise<void>;
export declare function writeMarkdown(filePath: string, content: string): Promise<void>;
//# sourceMappingURL=growthRun.d.ts.map