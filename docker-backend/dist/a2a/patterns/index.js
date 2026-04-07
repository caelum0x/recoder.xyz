"use strict";
/**
 * @module patterns
 *
 * Barrel export for collaboration pattern templates.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.patternRouter = exports.resetPatternRegistry = exports.getPatternRegistry = exports.PatternRegistry = exports.CompetitivePattern = exports.SupervisorOrchestrationPattern = exports.DirectHandoffPattern = void 0;
var direct_handoff_1 = require("./direct-handoff");
Object.defineProperty(exports, "DirectHandoffPattern", { enumerable: true, get: function () { return direct_handoff_1.DirectHandoffPattern; } });
var supervisor_orchestration_1 = require("./supervisor-orchestration");
Object.defineProperty(exports, "SupervisorOrchestrationPattern", { enumerable: true, get: function () { return supervisor_orchestration_1.SupervisorOrchestrationPattern; } });
var competitive_pattern_1 = require("./competitive-pattern");
Object.defineProperty(exports, "CompetitivePattern", { enumerable: true, get: function () { return competitive_pattern_1.CompetitivePattern; } });
var pattern_registry_1 = require("./pattern-registry");
Object.defineProperty(exports, "PatternRegistry", { enumerable: true, get: function () { return pattern_registry_1.PatternRegistry; } });
Object.defineProperty(exports, "getPatternRegistry", { enumerable: true, get: function () { return pattern_registry_1.getPatternRegistry; } });
Object.defineProperty(exports, "resetPatternRegistry", { enumerable: true, get: function () { return pattern_registry_1.resetPatternRegistry; } });
var pattern_routes_1 = require("./pattern.routes");
Object.defineProperty(exports, "patternRouter", { enumerable: true, get: function () { return pattern_routes_1.patternRouter; } });
