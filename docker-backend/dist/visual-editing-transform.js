"use strict";
/**
 * Visual Editing AST Transformation
 * Uses Babel parser + recast to modify className attributes in JSX/TSX files.
 * Ported from Dyad's visual_editing_utils.ts pattern.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyzeComponent = analyzeComponent;
exports.transformContent = transformContent;
const parser_1 = require("@babel/parser");
const traverse_1 = __importDefault(require("@babel/traverse"));
const recast = __importStar(require("recast"));
const style_utils_js_1 = require("./style-utils.js");
// Handle both ESM default and CJS module.exports
const traverse = (typeof traverse_1.default === 'function' ? traverse_1.default : traverse_1.default.default);
/**
 * Parse JSX/TSX content using Babel parser via recast for formatting preservation
 */
function parseSource(content, isTypeScript) {
    return recast.parse(content, {
        parser: {
            parse(source) {
                return (0, parser_1.parse)(source, {
                    sourceType: 'module',
                    plugins: [
                        'jsx',
                        ...(isTypeScript ? ['typescript'] : []),
                        'decorators-legacy',
                        'classProperties',
                        'optionalChaining',
                        'nullishCoalescingOperator',
                    ],
                    tokens: true,
                });
            },
        },
    });
}
/**
 * Determine if a file is TypeScript based on extension
 */
function isTS(filePath) {
    return filePath.endsWith('.tsx') || filePath.endsWith('.ts');
}
/**
 * Extract the string value from a className attribute's value node
 */
function getClassNameValue(attrValue) {
    if (!attrValue)
        return null;
    // className="static classes"
    if (attrValue.type === 'StringLiteral') {
        return { value: attrValue.value, isDynamic: false };
    }
    // className={expression}
    if (attrValue.type === 'JSXExpressionContainer') {
        const expr = attrValue.expression;
        // className={"static classes"}
        if (expr.type === 'StringLiteral') {
            return { value: expr.value, isDynamic: false };
        }
        // className={`template ${literal}`} or className={condition ? a : b}
        // These are dynamic — we can't safely modify them
        return { value: '', isDynamic: true };
    }
    return null;
}
/**
 * Analyze a component at a specific line number
 */
function analyzeComponent(content, lineNumber, filePath) {
    try {
        const ast = parseSource(content, isTS(filePath));
        let result = {
            hasDynamicClassName: false,
            hasStaticClassName: false,
            existingClasses: [],
            lineNumber,
        };
        traverse(ast, {
            JSXOpeningElement(path) {
                const loc = path.node.loc;
                if (!loc)
                    return;
                // Match by line number (allow +/- 1 for slight offset)
                if (Math.abs(loc.start.line - lineNumber) > 1)
                    return;
                const classAttr = path.node.attributes?.find((attr) => attr.type === 'JSXAttribute' && attr.name?.name === 'className');
                if (classAttr) {
                    const classValue = getClassNameValue(classAttr.value);
                    if (classValue) {
                        result.hasDynamicClassName = classValue.isDynamic;
                        result.hasStaticClassName = !classValue.isDynamic;
                        if (!classValue.isDynamic && classValue.value) {
                            result.existingClasses = classValue.value.split(/\s+/).filter(Boolean);
                        }
                    }
                }
                path.stop();
            },
        });
        return result;
    }
    catch (error) {
        console.error('[VisualEditingTransform] Analysis error:', error);
        return {
            hasDynamicClassName: false,
            hasStaticClassName: false,
            existingClasses: [],
            lineNumber,
        };
    }
}
/**
 * Transform file content by modifying the className of a JSX element at a specific line.
 *
 * Strategy:
 * 1. Parse the file preserving formatting (recast)
 * 2. Find the JSXOpeningElement at the target line
 * 3. Get existing className
 * 4. Remove classes with matching prefixes
 * 5. Add new Tailwind classes
 * 6. Reprint with recast (minimal formatting changes)
 */
function transformContent(content, changes) {
    try {
        // Group changes by line number (usually one per element)
        const changesByLine = new Map();
        for (const change of changes) {
            const existing = changesByLine.get(change.lineNumber);
            if (existing) {
                // Merge styles
                existing.styles = {
                    ...existing.styles,
                    ...change.styles,
                    margin: { ...existing.styles.margin, ...change.styles.margin },
                    padding: { ...existing.styles.padding, ...change.styles.padding },
                    border: { ...existing.styles.border, ...change.styles.border },
                    text: { ...existing.styles.text, ...change.styles.text },
                };
            }
            else {
                changesByLine.set(change.lineNumber, { ...change });
            }
        }
        const filePath = changes[0]?.filePath || 'file.tsx';
        const ast = parseSource(content, isTS(filePath));
        let modified = false;
        let hasDynamic = false;
        traverse(ast, {
            JSXOpeningElement(path) {
                const loc = path.node.loc;
                if (!loc)
                    return;
                // Find change for this line
                const change = changesByLine.get(loc.start.line);
                if (!change)
                    return;
                // Find or create className attribute
                let classAttr = path.node.attributes?.find((attr) => attr.type === 'JSXAttribute' && attr.name?.name === 'className');
                if (classAttr) {
                    const classValue = getClassNameValue(classAttr.value);
                    if (classValue?.isDynamic) {
                        hasDynamic = true;
                        return; // Skip dynamic classNames
                    }
                    // Get existing classes
                    const existingClasses = (classValue?.value || '').split(/\s+/).filter(Boolean);
                    // Determine which prefixes to remove
                    const prefixesToRemove = (0, style_utils_js_1.extractClassPrefixes)(change.styles);
                    // Filter existing classes, removing ones we're replacing
                    const filteredClasses = (0, style_utils_js_1.filterExistingClasses)(existingClasses, prefixesToRemove);
                    // Generate new Tailwind classes
                    const newClasses = (0, style_utils_js_1.stylesToTailwind)(change.styles);
                    // Combine
                    const finalClasses = [...filteredClasses, ...newClasses];
                    const classString = finalClasses.join(' ');
                    // Update the attribute value
                    classAttr.value = {
                        type: 'StringLiteral',
                        value: classString,
                    };
                    modified = true;
                }
                else {
                    // No className attribute - create one
                    const newClasses = (0, style_utils_js_1.stylesToTailwind)(change.styles);
                    if (newClasses.length > 0) {
                        const classString = newClasses.join(' ');
                        path.node.attributes = path.node.attributes || [];
                        path.node.attributes.push({
                            type: 'JSXAttribute',
                            name: { type: 'JSXIdentifier', name: 'className' },
                            value: { type: 'StringLiteral', value: classString },
                        });
                        modified = true;
                    }
                }
            },
        });
        if (hasDynamic && !modified) {
            return { success: false, error: 'Dynamic className detected — use "Edit in Chat" instead', isDynamic: true };
        }
        if (!modified) {
            return { success: false, error: 'Could not find the target element at the specified line' };
        }
        // Reprint with recast to preserve formatting
        const output = recast.print(ast).code;
        return { success: true, content: output };
    }
    catch (error) {
        console.error('[VisualEditingTransform] Transform error:', error);
        return { success: false, error: `Transform failed: ${error.message}` };
    }
}
