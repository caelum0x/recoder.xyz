export type ContainerCreationEntry<T> = {
    promise: Promise<T>;
    startedAt: number;
    timeoutId?: NodeJS.Timeout;
};
export declare function isCreationStale(entry: ContainerCreationEntry<unknown>, timeoutMs: number, now?: number): boolean;
export declare function withCreationTimeout<T>(promise: Promise<T>, timeoutMs: number, onTimeout?: () => void): Promise<T>;
