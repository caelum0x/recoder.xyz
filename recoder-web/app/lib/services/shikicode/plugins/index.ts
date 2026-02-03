/**
 * ShikiCode Plugins
 *
 * A collection of editor plugins for enhanced editing functionality.
 */

import type { EditorOptions, ShikiCode } from '../core';

export type IDisposable = () => void;
export type { EditorOptions, IndentOptions, ShikiCode } from '../core';

export type EditorPlugin = {
  (editor: ShikiCode, options: EditorOptions): IDisposable;
};

export * from './autoload';
export * from './closing-pairs';
export * from './comments';
export * from './tab';
