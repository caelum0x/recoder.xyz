export function debouncePromise<T extends (...args: any[]) => any>(
  fn: T,
  wait: number,
  abortValue: any = undefined,
) {
  let cancel = () => {};
  type ReturnT = Awaited<ReturnType<T>>;
  const wrapFunc = (...args: Parameters<T>): Promise<ReturnT> => {
    cancel();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => resolve(fn(...args)), wait);
      cancel = () => {
        clearTimeout(timer);
        if (abortValue !== undefined) {
          reject(abortValue);
        }
      };
    });
  };
  return wrapFunc;
}
