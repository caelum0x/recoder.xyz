export type TestTarget = {
  pathGlob: string;
  commands: string[];
  reason: string;
};

export type TestTargetMap = {
  targets: TestTarget[];
};

export function relatedTestsForPaths(map: TestTargetMap, paths: string[]): TestTarget[] {
  return map.targets.filter((target) =>
    paths.some((path) => path.startsWith(target.pathGlob.replace('/**', ''))),
  );
}
