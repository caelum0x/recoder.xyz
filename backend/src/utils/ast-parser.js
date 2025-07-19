const { parse } = require('@babel/parser');
const traverse = require('@babel/traverse').default;
const generate = require('@babel/generator').default;
const t = require('@babel/types');
const { logger } = require('./logger');

class ASTParser {
  static parseJavaScript(code, options = {}) {
    try {
      const defaultOptions = {
        sourceType: 'module',
        allowImportExportEverywhere: true,
        allowReturnOutsideFunction: true,
        plugins: [
          'jsx',
          'typescript',
          'decorators-legacy',
          'classProperties',
          'objectRestSpread',
          'asyncGenerators',
          'functionBind',
          'exportDefaultFrom',
          'exportNamespaceFrom',
          'dynamicImport',
          'nullishCoalescingOperator',
          'optionalChaining'
        ]
      };

      const ast = parse(code, { ...defaultOptions, ...options });
      return ast;
    } catch (error) {
      logger.error('Failed to parse JavaScript:', { error: error.message });
      throw error;
    }
  }

  static generateCode(ast, options = {}) {
    try {
      const defaultOptions = {
        retainLines: false,
        compact: false,
        minified: false
      };

      const result = generate(ast, { ...defaultOptions, ...options });
      return result.code;
    } catch (error) {
      logger.error('Failed to generate code from AST:', { error: error.message });
      throw error;
    }
  }

  static analyzeCode(code) {
    try {
      const ast = this.parseJavaScript(code);
      const analysis = {
        imports: [],
        exports: [],
        functions: [],
        classes: [],
        variables: [],
        dependencies: new Set(),
        complexity: 0
      };

      traverse(ast, {
        ImportDeclaration(path) {
          analysis.imports.push({
            source: path.node.source.value,
            specifiers: path.node.specifiers.map(spec => ({
              type: spec.type,
              local: spec.local?.name,
              imported: spec.imported?.name || spec.local?.name
            }))
          });
          analysis.dependencies.add(path.node.source.value);
        },

        ExportNamedDeclaration(path) {
          if (path.node.declaration) {
            analysis.exports.push({
              type: 'named',
              name: this.getDeclarationName(path.node.declaration)
            });
          }
        },

        ExportDefaultDeclaration(path) {
          analysis.exports.push({
            type: 'default',
            name: this.getDeclarationName(path.node.declaration)
          });
        },

        FunctionDeclaration(path) {
          analysis.functions.push({
            name: path.node.id?.name,
            params: path.node.params.map(p => p.name || 'destructured'),
            async: path.node.async,
            generator: path.node.generator,
            loc: path.node.loc
          });
          analysis.complexity += this.calculateComplexity(path);
        },

        ArrowFunctionExpression(path) {
          if (path.parent.type === 'VariableDeclarator') {
            analysis.functions.push({
              name: path.parent.id.name,
              params: path.node.params.map(p => p.name || 'destructured'),
              async: path.node.async,
              arrow: true,
              loc: path.node.loc
            });
          }
          analysis.complexity += this.calculateComplexity(path);
        },

        ClassDeclaration(path) {
          analysis.classes.push({
            name: path.node.id.name,
            superClass: path.node.superClass?.name,
            methods: [],
            properties: [],
            loc: path.node.loc
          });
        },

        VariableDeclaration(path) {
          path.node.declarations.forEach(declarator => {
            if (declarator.id.type === 'Identifier') {
              analysis.variables.push({
                name: declarator.id.name,
                kind: path.node.kind,
                initialized: !!declarator.init,
                loc: declarator.loc
              });
            }
          });
        },

        IfStatement(path) {
          analysis.complexity += 1;
        },

        SwitchStatement(path) {
          analysis.complexity += path.node.cases.length;
        },

        WhileStatement(path) {
          analysis.complexity += 1;
        },

        ForStatement(path) {
          analysis.complexity += 1;
        },

        ConditionalExpression(path) {
          analysis.complexity += 1;
        }
      });

      analysis.dependencies = Array.from(analysis.dependencies);
      return analysis;
    } catch (error) {
      logger.error('Failed to analyze code:', { error: error.message });
      throw error;
    }
  }

  static getDeclarationName(declaration) {
    if (t.isFunctionDeclaration(declaration) || t.isClassDeclaration(declaration)) {
      return declaration.id?.name;
    }
    if (t.isVariableDeclaration(declaration)) {
      return declaration.declarations[0]?.id?.name;
    }
    return 'anonymous';
  }

  static calculateComplexity(path) {
    let complexity = 1; // Base complexity
    
    // Add complexity for nested conditions
    path.traverse({
      IfStatement() { complexity += 1; },
      SwitchCase() { complexity += 1; },
      WhileStatement() { complexity += 1; },
      ForStatement() { complexity += 1; },
      ConditionalExpression() { complexity += 1; },
      LogicalExpression(innerPath) {
        if (innerPath.node.operator === '||' || innerPath.node.operator === '&&') {
          complexity += 1;
        }
      }
    });

    return complexity;
  }

  static extractImports(code) {
    try {
      const ast = this.parseJavaScript(code);
      const imports = [];

      traverse(ast, {
        ImportDeclaration(path) {
          imports.push({
            source: path.node.source.value,
            specifiers: path.node.specifiers.map(spec => ({
              type: spec.type,
              local: spec.local?.name,
              imported: spec.imported?.name || spec.local?.name
            })),
            raw: generate(path.node).code
          });
        }
      });

      return imports;
    } catch (error) {
      logger.error('Failed to extract imports:', { error: error.message });
      throw error;
    }
  }

  static extractExports(code) {
    try {
      const ast = this.parseJavaScript(code);
      const exports = [];

      traverse(ast, {
        ExportNamedDeclaration(path) {
          exports.push({
            type: 'named',
            declaration: path.node.declaration ? this.getDeclarationName(path.node.declaration) : null,
            specifiers: path.node.specifiers?.map(spec => ({
              local: spec.local.name,
              exported: spec.exported.name
            })),
            raw: generate(path.node).code
          });
        },

        ExportDefaultDeclaration(path) {
          exports.push({
            type: 'default',
            declaration: this.getDeclarationName(path.node.declaration),
            raw: generate(path.node).code
          });
        }
      });

      return exports;
    } catch (error) {
      logger.error('Failed to extract exports:', { error: error.message });
      throw error;
    }
  }

  static transformCode(code, transformations) {
    try {
      const ast = this.parseJavaScript(code);

      traverse(ast, transformations);

      return this.generateCode(ast);
    } catch (error) {
      logger.error('Failed to transform code:', { error: error.message });
      throw error;
    }
  }

  static validateSyntax(code, options = {}) {
    try {
      this.parseJavaScript(code, options);
      return { valid: true, errors: [] };
    } catch (error) {
      return {
        valid: false,
        errors: [{
          message: error.message,
          line: error.loc?.line,
          column: error.loc?.column
        }]
      };
    }
  }

  static minifyCode(code) {
    try {
      const ast = this.parseJavaScript(code);
      return this.generateCode(ast, { compact: true, minified: true });
    } catch (error) {
      logger.error('Failed to minify code:', { error: error.message });
      throw error;
    }
  }

  static beautifyCode(code) {
    try {
      const ast = this.parseJavaScript(code);
      return this.generateCode(ast, { compact: false, retainLines: false });
    } catch (error) {
      logger.error('Failed to beautify code:', { error: error.message });
      throw error;
    }
  }

  static findReferences(code, identifier) {
    try {
      const ast = this.parseJavaScript(code);
      const references = [];

      traverse(ast, {
        Identifier(path) {
          if (path.node.name === identifier && path.isReferencedIdentifier()) {
            references.push({
              line: path.node.loc?.start.line,
              column: path.node.loc?.start.column,
              type: path.parent.type
            });
          }
        }
      });

      return references;
    } catch (error) {
      logger.error('Failed to find references:', { error: error.message });
      throw error;
    }
  }

  static getCodeMetrics(code) {
    try {
      const analysis = this.analyzeCode(code);
      const lines = code.split('\n');
      
      return {
        linesOfCode: lines.length,
        nonEmptyLines: lines.filter(line => line.trim().length > 0).length,
        functions: analysis.functions.length,
        classes: analysis.classes.length,
        imports: analysis.imports.length,
        exports: analysis.exports.length,
        cyclomaticComplexity: analysis.complexity,
        dependencies: analysis.dependencies.length
      };
    } catch (error) {
      logger.error('Failed to get code metrics:', { error: error.message });
      throw error;
    }
  }
}

module.exports = { ASTParser };