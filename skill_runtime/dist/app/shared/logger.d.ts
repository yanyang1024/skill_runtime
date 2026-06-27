export interface Logger {
    debug(msg: string, data?: unknown): void;
    info(msg: string, data?: unknown): void;
    warn(msg: string, data?: unknown): void;
    error(msg: string, data?: unknown): void;
}
export declare function createLogger(module: string): Logger;
//# sourceMappingURL=logger.d.ts.map