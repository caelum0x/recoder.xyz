"use strict";
/**
 * @module patterns/pattern-registry
 *
 * Registry for collaboration patterns. Pre-registers the 3 built-in patterns.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PatternRegistry = void 0;
exports.getPatternRegistry = getPatternRegistry;
exports.resetPatternRegistry = resetPatternRegistry;
const direct_handoff_1 = require("./direct-handoff");
const supervisor_orchestration_1 = require("./supervisor-orchestration");
const competitive_pattern_1 = require("./competitive-pattern");
class PatternRegistry {
    patterns = new Map();
    register(pattern) {
        this.patterns.set(pattern.patternType, pattern);
    }
    get(type) {
        return this.patterns.get(type);
    }
    list() {
        return Array.from(this.patterns.keys());
    }
    getDetails() {
        const builtIns = [
            { type: 'direct-handoff', description: 'Agent A completes work, transfers context to Agent B for continuation' },
            { type: 'supervisor', description: 'Supervisor breaks task into subtasks, assigns to workers, aggregates results' },
            { type: 'competitive', description: 'Same task sent to multiple agents; first to complete wins' },
        ];
        return builtIns.filter((d) => this.patterns.has(d.type));
    }
    static createDefault() {
        const registry = new PatternRegistry();
        registry.register(new direct_handoff_1.DirectHandoffPattern());
        registry.register(new supervisor_orchestration_1.SupervisorOrchestrationPattern());
        registry.register(new competitive_pattern_1.CompetitivePattern());
        return registry;
    }
}
exports.PatternRegistry = PatternRegistry;
// Singleton
let instance = null;
function getPatternRegistry() {
    if (!instance) {
        instance = PatternRegistry.createDefault();
    }
    return instance;
}
function resetPatternRegistry() {
    instance = null;
}
