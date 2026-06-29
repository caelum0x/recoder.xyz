/**
 * Preact-native animation hooks.
 *
 * Same animation utilities as `@recoder/shared/animations`, but the hook
 * primitives are imported from `preact/hooks` instead of `react`. This lets a
 * Preact app (e.g. the cockpit) consume the smooth text/animation/tool-argument
 * hooks WITHOUT pulling in `preact/compat`.
 *
 * The implementation is shared with the React entry; only the runtime binding
 * differs. The existing React entry (`../index`) is left untouched.
 */

export * from './use-smooth-animation';
export * from './use-smooth-text';
export * from './use-smooth-tool-arguments';
