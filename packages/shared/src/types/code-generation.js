"use strict";
/**
 * Code Generation Types and Interfaces
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MockType = exports.ValidationStatus = exports.GenerationStatus = exports.PerformanceTarget = exports.SecurityLevel = exports.CodeQuality = exports.ValidationLevel = exports.GenerationType = void 0;
var GenerationType;
(function (GenerationType) {
    GenerationType["GENERATE"] = "generate";
    GenerationType["MODIFY"] = "modify";
    GenerationType["REFACTOR"] = "refactor";
    GenerationType["FIX"] = "fix";
    GenerationType["OPTIMIZE"] = "optimize";
})(GenerationType || (exports.GenerationType = GenerationType = {}));
var ValidationLevel;
(function (ValidationLevel) {
    ValidationLevel["BASIC"] = "basic";
    ValidationLevel["STANDARD"] = "standard";
    ValidationLevel["STRICT"] = "strict";
    ValidationLevel["ENTERPRISE"] = "enterprise";
})(ValidationLevel || (exports.ValidationLevel = ValidationLevel = {}));
var CodeQuality;
(function (CodeQuality) {
    CodeQuality["PROTOTYPE"] = "prototype";
    CodeQuality["DEVELOPMENT"] = "development";
    CodeQuality["PRODUCTION"] = "production";
    CodeQuality["ENTERPRISE"] = "enterprise";
})(CodeQuality || (exports.CodeQuality = CodeQuality = {}));
var SecurityLevel;
(function (SecurityLevel) {
    SecurityLevel["NONE"] = "none";
    SecurityLevel["BASIC"] = "basic";
    SecurityLevel["STANDARD"] = "standard";
    SecurityLevel["HIGH"] = "high";
    SecurityLevel["CRITICAL"] = "critical";
})(SecurityLevel || (exports.SecurityLevel = SecurityLevel = {}));
var PerformanceTarget;
(function (PerformanceTarget) {
    PerformanceTarget["BASIC"] = "basic";
    PerformanceTarget["OPTIMIZED"] = "optimized";
    PerformanceTarget["HIGH_PERFORMANCE"] = "high_performance";
    PerformanceTarget["REAL_TIME"] = "real_time";
})(PerformanceTarget || (exports.PerformanceTarget = PerformanceTarget = {}));
var GenerationStatus;
(function (GenerationStatus) {
    GenerationStatus["PENDING"] = "pending";
    GenerationStatus["IN_PROGRESS"] = "in_progress";
    GenerationStatus["VALIDATING"] = "validating";
    GenerationStatus["COMPLETED"] = "completed";
    GenerationStatus["FAILED"] = "failed";
    GenerationStatus["CANCELLED"] = "cancelled";
})(GenerationStatus || (exports.GenerationStatus = GenerationStatus = {}));
var ValidationStatus;
(function (ValidationStatus) {
    ValidationStatus["PASSED"] = "passed";
    ValidationStatus["WARNING"] = "warning";
    ValidationStatus["FAILED"] = "failed";
    ValidationStatus["SKIPPED"] = "skipped";
})(ValidationStatus || (exports.ValidationStatus = ValidationStatus = {}));
var MockType;
(function (MockType) {
    MockType["FAKE_API"] = "fake_api";
    MockType["DUMMY_DATA"] = "dummy_data";
    MockType["PLACEHOLDER_LOGIC"] = "placeholder_logic";
    MockType["INCOMPLETE_IMPLEMENTATION"] = "incomplete_implementation";
})(MockType || (exports.MockType = MockType = {}));
//# sourceMappingURL=code-generation.js.map