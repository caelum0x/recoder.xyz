"use strict";
/**
 * Common types and enums
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ValidationLevel = exports.IntegrationType = exports.CodeQuality = exports.Environment = exports.ProjectType = void 0;
var ProjectType;
(function (ProjectType) {
    ProjectType["WEB"] = "web";
    ProjectType["MOBILE"] = "mobile";
    ProjectType["BLOCKCHAIN"] = "blockchain";
    ProjectType["AI"] = "ai";
    ProjectType["BACKEND"] = "backend";
    ProjectType["DESKTOP"] = "desktop";
    ProjectType["MICROSERVICE"] = "microservice";
    ProjectType["FULLSTACK"] = "fullstack";
})(ProjectType || (exports.ProjectType = ProjectType = {}));
var Environment;
(function (Environment) {
    Environment["DEVELOPMENT"] = "development";
    Environment["STAGING"] = "staging";
    Environment["PRODUCTION"] = "production";
    Environment["TEST"] = "test";
})(Environment || (exports.Environment = Environment = {}));
var CodeQuality;
(function (CodeQuality) {
    CodeQuality["PRODUCTION"] = "production";
    CodeQuality["PROTOTYPE"] = "prototype";
    CodeQuality["ENTERPRISE"] = "enterprise";
    CodeQuality["MINIMAL"] = "minimal";
})(CodeQuality || (exports.CodeQuality = CodeQuality = {}));
var IntegrationType;
(function (IntegrationType) {
    IntegrationType["DATABASE"] = "database";
    IntegrationType["API"] = "api";
    IntegrationType["PAYMENT"] = "payment";
    IntegrationType["AUTH"] = "auth";
    IntegrationType["STORAGE"] = "storage";
    IntegrationType["MESSAGING"] = "messaging";
    IntegrationType["BLOCKCHAIN"] = "blockchain";
    IntegrationType["AI_ML"] = "ai_ml";
    IntegrationType["ANALYTICS"] = "analytics";
    IntegrationType["CDN"] = "cdn";
})(IntegrationType || (exports.IntegrationType = IntegrationType = {}));
var ValidationLevel;
(function (ValidationLevel) {
    ValidationLevel["BASIC"] = "basic";
    ValidationLevel["INTERMEDIATE"] = "intermediate";
    ValidationLevel["STRICT"] = "strict";
    ValidationLevel["ENTERPRISE"] = "enterprise";
})(ValidationLevel || (exports.ValidationLevel = ValidationLevel = {}));
//# sourceMappingURL=common.js.map