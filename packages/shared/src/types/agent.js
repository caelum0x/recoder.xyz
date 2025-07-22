"use strict";
/**
 * Agent types and interfaces
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.CodeQualityLevel = exports.DesignPattern = exports.ModelProvider = exports.AgentStatus = exports.AgentRole = void 0;
var AgentRole;
(function (AgentRole) {
    AgentRole["ARCHITECT"] = "architect";
    AgentRole["DEVELOPER"] = "developer";
    AgentRole["REVIEWER"] = "reviewer";
    AgentRole["TESTER"] = "tester";
    AgentRole["SECURITY"] = "security";
    AgentRole["DEVOPS"] = "devops";
    AgentRole["SPECIALIST"] = "specialist";
    AgentRole["GENERAL"] = "general";
})(AgentRole || (exports.AgentRole = AgentRole = {}));
var AgentStatus;
(function (AgentStatus) {
    AgentStatus["ACTIVE"] = "active";
    AgentStatus["TRAINING"] = "training";
    AgentStatus["INACTIVE"] = "inactive";
    AgentStatus["DEPRECATED"] = "deprecated";
})(AgentStatus || (exports.AgentStatus = AgentStatus = {}));
var ModelProvider;
(function (ModelProvider) {
    ModelProvider["OPENAI"] = "openai";
    ModelProvider["ANTHROPIC"] = "anthropic";
    ModelProvider["GOOGLE"] = "google";
    ModelProvider["COHERE"] = "cohere";
    ModelProvider["HUGGINGFACE"] = "huggingface";
    ModelProvider["OLLAMA"] = "ollama";
    ModelProvider["CUSTOM"] = "custom";
})(ModelProvider || (exports.ModelProvider = ModelProvider = {}));
var DesignPattern;
(function (DesignPattern) {
    DesignPattern["SINGLETON"] = "singleton";
    DesignPattern["FACTORY"] = "factory";
    DesignPattern["OBSERVER"] = "observer";
    DesignPattern["STRATEGY"] = "strategy";
    DesignPattern["DECORATOR"] = "decorator";
    DesignPattern["MVC"] = "mvc";
    DesignPattern["MVVM"] = "mvvm";
    DesignPattern["REPOSITORY"] = "repository";
    DesignPattern["DEPENDENCY_INJECTION"] = "dependency-injection";
    DesignPattern["COMMAND"] = "command";
})(DesignPattern || (exports.DesignPattern = DesignPattern = {}));
var CodeQualityLevel;
(function (CodeQualityLevel) {
    CodeQualityLevel["BASIC"] = "basic";
    CodeQualityLevel["GOOD"] = "good";
    CodeQualityLevel["EXCELLENT"] = "excellent";
    CodeQualityLevel["ENTERPRISE"] = "enterprise";
})(CodeQualityLevel || (exports.CodeQualityLevel = CodeQualityLevel = {}));
//# sourceMappingURL=agent.js.map