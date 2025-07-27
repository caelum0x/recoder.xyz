export declare class Logger {
    private static instance;
    static getInstance(): Logger;
    static info(message: string, meta?: any): void;
    static warn(message: string, meta?: any): void;
    static error(message: string, meta?: any): void;
    static success(message: string, meta?: any): void;
    static debug(message: string, meta?: any): void;
    info(message: string, meta?: any): void;
    warn(message: string, meta?: any): void;
    error(message: string, meta?: any): void;
    success(message: string, meta?: any): void;
    debug(message: string, meta?: any): void;
}
//# sourceMappingURL=logger.d.ts.map