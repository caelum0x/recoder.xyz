#!/usr/bin/env node
// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const desktopRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
);
const frontendRoot = path.join(desktopRoot, 'tsunami', 'frontend');
const scaffoldDir = path.resolve(frontendRoot, process.argv[2] || 'scaffold');
const modulesDir = path.join(scaffoldDir, 'nm');
const roots = ['@tailwindcss/cli', 'tailwindcss'];

function packageRootFor(packageName, fromPackageJson) {
  const requireFrom = createRequire(fromPackageJson);
  let current;
  try {
    current = path.dirname(requireFrom.resolve(`${packageName}/package.json`));
  } catch {
    current = path.dirname(requireFrom.resolve(packageName));
  }
  for (;;) {
    const manifestPath = path.join(current, 'package.json');
    if (fs.existsSync(manifestPath)) {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      if (manifest.name === packageName)
        return { root: current, manifest, manifestPath };
    }
    const parent = path.dirname(current);
    if (parent === current)
      throw new Error(`Could not locate package root for ${packageName}`);
    current = parent;
  }
}

function copyDependencyClosure() {
  const packages = new Map();
  const rootManifest = path.join(frontendRoot, 'package.json');

  const stagePackage = (
    name,
    from,
    destination,
    optional,
    ancestors = new Set()
  ) => {
    let found;
    try {
      found = packageRootFor(name, from);
    } catch (error) {
      if (optional) return;
      throw error;
    }
    const identity = `${name}@${found.root}`;
    if (ancestors.has(identity)) return;
    packages.set(identity, { name, version: found.manifest.version });
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.cpSync(found.root, destination, {
      recursive: true,
      dereference: true,
      filter: source => {
        const relative = path.relative(found.root, source);
        return (
          relative === '' || !relative.split(path.sep).includes('node_modules')
        );
      },
    });
    const nextAncestors = new Set(ancestors).add(identity);
    for (const dependency of Object.keys(found.manifest.dependencies || {})) {
      stagePackage(
        dependency,
        found.manifestPath,
        path.join(destination, 'node_modules', ...dependency.split('/')),
        false,
        nextAncestors
      );
    }
    for (const dependency of Object.keys(
      found.manifest.optionalDependencies || {}
    )) {
      stagePackage(
        dependency,
        found.manifestPath,
        path.join(destination, 'node_modules', ...dependency.split('/')),
        true,
        nextAncestors
      );
    }
  };

  fs.rmSync(modulesDir, { recursive: true, force: true });
  fs.mkdirSync(path.join(modulesDir, '.bin'), { recursive: true });
  for (const name of roots) {
    const destination = path.join(modulesDir, ...name.split('/'));
    stagePackage(name, rootManifest, destination, false);
    const found = packageRootFor(name, rootManifest);
    const bins =
      typeof found.manifest.bin === 'string'
        ? { [name.replace(/^@[^/]+\//, '')]: found.manifest.bin }
        : found.manifest.bin || {};
    for (const [binName, relativeTarget] of Object.entries(bins)) {
      const linkPath = path.join(modulesDir, '.bin', binName);
      const targetPath = path.join(destination, String(relativeTarget));
      fs.symlinkSync(
        path.relative(path.dirname(linkPath), targetPath),
        linkPath
      );
    }
  }
  fs.writeFileSync(
    path.join(modulesDir, 'RECODER-DEPS.json'),
    `${JSON.stringify({ packages: [...packages.values()].sort((a, b) => `${a.name}@${a.version}`.localeCompare(`${b.name}@${b.version}`)) }, null, 2)}\n`
  );
  console.log(
    `staged ${packages.size} locked Tsunami scaffold packages in ${modulesDir}`
  );
}

if (!fs.existsSync(path.join(frontendRoot, 'node_modules'))) {
  throw new Error(
    'Tsunami frontend node_modules is missing; install the locked workspace before packaging'
  );
}
fs.mkdirSync(scaffoldDir, { recursive: true });
copyDependencyClosure();
