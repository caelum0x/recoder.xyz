"use strict";
/**
 * Planning types and interfaces for project requirements, architecture, and validation
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ArchitecturePattern = exports.RequirementType = exports.PlanningPhase = void 0;
var PlanningPhase;
(function (PlanningPhase) {
    PlanningPhase["DISCOVERY"] = "discovery";
    PlanningPhase["REQUIREMENTS"] = "requirements";
    PlanningPhase["ARCHITECTURE"] = "architecture";
    PlanningPhase["DESIGN"] = "design";
    PlanningPhase["VALIDATION"] = "validation";
    PlanningPhase["APPROVAL"] = "approval";
    PlanningPhase["IMPLEMENTATION"] = "implementation";
})(PlanningPhase || (exports.PlanningPhase = PlanningPhase = {}));
var RequirementType;
(function (RequirementType) {
    RequirementType["FUNCTIONAL"] = "functional";
    RequirementType["NON_FUNCTIONAL"] = "non_functional";
    RequirementType["BUSINESS"] = "business";
    RequirementType["TECHNICAL"] = "technical";
    RequirementType["SECURITY"] = "security";
    RequirementType["COMPLIANCE"] = "compliance";
    RequirementType["INTEGRATION"] = "integration";
    RequirementType["DATA"] = "data";
})(RequirementType || (exports.RequirementType = RequirementType = {}));
var ArchitecturePattern;
(function (ArchitecturePattern) {
    ArchitecturePattern["MONOLITHIC"] = "monolithic";
    ArchitecturePattern["MICROSERVICES"] = "microservices";
    ArchitecturePattern["SERVERLESS"] = "serverless";
    ArchitecturePattern["EVENT_DRIVEN"] = "event_driven";
    ArchitecturePattern["LAYERED"] = "layered";
    ArchitecturePattern["HEXAGONAL"] = "hexagonal";
    ArchitecturePattern["CQRS"] = "cqrs";
    ArchitecturePattern["EVENT_SOURCING"] = "event_sourcing";
    ArchitecturePattern["JAMSTACK"] = "jamstack";
    ArchitecturePattern["SPA"] = "spa";
    ArchitecturePattern["SSR"] = "ssr";
    ArchitecturePattern["HYBRID"] = "hybrid";
})(ArchitecturePattern || (exports.ArchitecturePattern = ArchitecturePattern = {}));
//# sourceMappingURL=planning.js.map