"use strict";
/**
 * Recoder Shared Types
 * Comprehensive TypeScript types for production-ready code generation
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.CodeGenerationValidationLevel = exports.CodeGenerationCodeQuality = exports.GenerationStatus = exports.GenerationType = exports.CommonValidationLevel = exports.CommonCodeQuality = exports.SubscriptionSupportLevel = exports.SubscriptionStatus = exports.SubscriptionPlan = exports.ProjectStatus = exports.AgentStatus = void 0;
const tslib_1 = require("tslib");
// Export types that don't have conflicts
tslib_1.__exportStar(require("./user"), exports);
tslib_1.__exportStar(require("./api"), exports);
// Export with aliases to resolve naming conflicts
// Agent types
var agent_1 = require("./agent");
Object.defineProperty(exports, "AgentStatus", { enumerable: true, get: function () { return agent_1.AgentStatus; } });
// Project types
var project_1 = require("./project");
Object.defineProperty(exports, "ProjectStatus", { enumerable: true, get: function () { return project_1.ProjectStatus; } });
// Subscription types
var subscription_1 = require("./subscription");
Object.defineProperty(exports, "SubscriptionPlan", { enumerable: true, get: function () { return subscription_1.SubscriptionPlan; } });
Object.defineProperty(exports, "SubscriptionStatus", { enumerable: true, get: function () { return subscription_1.SubscriptionStatus; } });
var subscription_2 = require("./subscription");
Object.defineProperty(exports, "SubscriptionSupportLevel", { enumerable: true, get: function () { return subscription_2.SupportLevel; } });
var common_1 = require("./common");
Object.defineProperty(exports, "CommonCodeQuality", { enumerable: true, get: function () { return common_1.CodeQuality; } });
var common_2 = require("./common");
Object.defineProperty(exports, "CommonValidationLevel", { enumerable: true, get: function () { return common_2.ValidationLevel; } });
// Code generation types
var code_generation_1 = require("./code-generation");
Object.defineProperty(exports, "GenerationType", { enumerable: true, get: function () { return code_generation_1.GenerationType; } });
Object.defineProperty(exports, "GenerationStatus", { enumerable: true, get: function () { return code_generation_1.GenerationStatus; } });
var code_generation_2 = require("./code-generation");
Object.defineProperty(exports, "CodeGenerationCodeQuality", { enumerable: true, get: function () { return code_generation_2.CodeQuality; } });
var code_generation_3 = require("./code-generation");
Object.defineProperty(exports, "CodeGenerationValidationLevel", { enumerable: true, get: function () { return code_generation_3.ValidationLevel; } });
//# sourceMappingURL=index.js.map