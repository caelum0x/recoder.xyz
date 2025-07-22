"use strict";
/**
 * AI Model Integration Hub - Type Definitions
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.StatsPeriod = exports.HealthStatus = exports.ErrorType = exports.PrivacyLevel = exports.TaskPriority = exports.TaskType = exports.ModelSpecialization = exports.ModelType = exports.ModelProvider = void 0;
var ModelProvider;
(function (ModelProvider) {
    ModelProvider["OPENAI"] = "openai";
    ModelProvider["ANTHROPIC"] = "anthropic";
    ModelProvider["GOOGLE"] = "google";
    ModelProvider["MISTRAL"] = "mistral";
    ModelProvider["PERPLEXITY"] = "perplexity";
    ModelProvider["COHERE"] = "cohere";
    ModelProvider["OLLAMA"] = "ollama";
    ModelProvider["HUGGINGFACE"] = "huggingface";
    ModelProvider["CUSTOM"] = "custom";
})(ModelProvider || (exports.ModelProvider = ModelProvider = {}));
var ModelType;
(function (ModelType) {
    ModelType["CHAT"] = "chat";
    ModelType["COMPLETION"] = "completion";
    ModelType["CODE"] = "code";
    ModelType["EMBEDDING"] = "embedding";
    ModelType["VISION"] = "vision";
    ModelType["REASONING"] = "reasoning";
    ModelType["SPECIALIZED"] = "specialized";
})(ModelType || (exports.ModelType = ModelType = {}));
var ModelSpecialization;
(function (ModelSpecialization) {
    ModelSpecialization["JAVASCRIPT"] = "javascript";
    ModelSpecialization["PYTHON"] = "python";
    ModelSpecialization["TYPESCRIPT"] = "typescript";
    ModelSpecialization["RUST"] = "rust";
    ModelSpecialization["GO"] = "go";
    ModelSpecialization["JAVA"] = "java";
    ModelSpecialization["CPP"] = "cpp";
    ModelSpecialization["CSHARP"] = "csharp";
    ModelSpecialization["PHP"] = "php";
    ModelSpecialization["RUBY"] = "ruby";
    ModelSpecialization["SWIFT"] = "swift";
    ModelSpecialization["KOTLIN"] = "kotlin";
    ModelSpecialization["SOLIDITY"] = "solidity";
    ModelSpecialization["SQL"] = "sql";
    ModelSpecialization["HTML"] = "html";
    ModelSpecialization["CSS"] = "css";
    ModelSpecialization["SECURITY"] = "security";
    ModelSpecialization["PERFORMANCE"] = "performance";
    ModelSpecialization["ARCHITECTURE"] = "architecture";
    ModelSpecialization["TESTING"] = "testing";
    ModelSpecialization["DOCUMENTATION"] = "documentation";
    ModelSpecialization["DEVOPS"] = "devops";
    ModelSpecialization["DATA_SCIENCE"] = "data_science";
    ModelSpecialization["MACHINE_LEARNING"] = "machine_learning";
    ModelSpecialization["WEB_DEVELOPMENT"] = "web_development";
    ModelSpecialization["MOBILE_DEVELOPMENT"] = "mobile_development";
    ModelSpecialization["BLOCKCHAIN"] = "blockchain";
    ModelSpecialization["CLOUD"] = "cloud";
})(ModelSpecialization || (exports.ModelSpecialization = ModelSpecialization = {}));
var TaskType;
(function (TaskType) {
    TaskType["CODE_GENERATION"] = "code_generation";
    TaskType["CODE_REVIEW"] = "code_review";
    TaskType["DEBUGGING"] = "debugging";
    TaskType["REFACTORING"] = "refactoring";
    TaskType["DOCUMENTATION"] = "documentation";
    TaskType["TESTING"] = "testing";
    TaskType["SECURITY_ANALYSIS"] = "security_analysis";
    TaskType["PERFORMANCE_OPTIMIZATION"] = "performance_optimization";
    TaskType["ARCHITECTURE_PLANNING"] = "architecture_planning";
    TaskType["PROJECT_ANALYSIS"] = "project_analysis";
    TaskType["CHAT"] = "chat";
    TaskType["TRANSLATION"] = "translation";
    TaskType["EXPLANATION"] = "explanation";
    TaskType["CUSTOM"] = "custom";
})(TaskType || (exports.TaskType = TaskType = {}));
var TaskPriority;
(function (TaskPriority) {
    TaskPriority["LOW"] = "low";
    TaskPriority["MEDIUM"] = "medium";
    TaskPriority["HIGH"] = "high";
    TaskPriority["CRITICAL"] = "critical";
})(TaskPriority || (exports.TaskPriority = TaskPriority = {}));
var PrivacyLevel;
(function (PrivacyLevel) {
    PrivacyLevel["PUBLIC"] = "public";
    PrivacyLevel["INTERNAL"] = "internal";
    PrivacyLevel["CONFIDENTIAL"] = "confidential";
    PrivacyLevel["RESTRICTED"] = "restricted"; // Specific approved models only
})(PrivacyLevel || (exports.PrivacyLevel = PrivacyLevel = {}));
var ErrorType;
(function (ErrorType) {
    ErrorType["API_ERROR"] = "api_error";
    ErrorType["RATE_LIMIT"] = "rate_limit";
    ErrorType["QUOTA_EXCEEDED"] = "quota_exceeded";
    ErrorType["MODEL_UNAVAILABLE"] = "model_unavailable";
    ErrorType["INVALID_REQUEST"] = "invalid_request";
    ErrorType["AUTHENTICATION"] = "authentication";
    ErrorType["PERMISSION_DENIED"] = "permission_denied";
    ErrorType["CONTENT_FILTER"] = "content_filter";
    ErrorType["TIMEOUT"] = "timeout";
    ErrorType["NETWORK_ERROR"] = "network_error";
    ErrorType["INTERNAL_ERROR"] = "internal_error";
    ErrorType["UNKNOWN"] = "unknown";
})(ErrorType || (exports.ErrorType = ErrorType = {}));
var HealthStatus;
(function (HealthStatus) {
    HealthStatus["HEALTHY"] = "healthy";
    HealthStatus["DEGRADED"] = "degraded";
    HealthStatus["UNAVAILABLE"] = "unavailable";
    HealthStatus["UNKNOWN"] = "unknown";
})(HealthStatus || (exports.HealthStatus = HealthStatus = {}));
var StatsPeriod;
(function (StatsPeriod) {
    StatsPeriod["HOUR"] = "hour";
    StatsPeriod["DAY"] = "day";
    StatsPeriod["WEEK"] = "week";
    StatsPeriod["MONTH"] = "month";
    StatsPeriod["YEAR"] = "year";
})(StatsPeriod || (exports.StatsPeriod = StatsPeriod = {}));
//# sourceMappingURL=ai-models.js.map