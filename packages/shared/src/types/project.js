"use strict";
/**
 * Project types and interfaces
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProjectVisibility = exports.ProjectStatus = void 0;
var ProjectStatus;
(function (ProjectStatus) {
    ProjectStatus["PLANNING"] = "planning";
    ProjectStatus["IN_PROGRESS"] = "in_progress";
    ProjectStatus["GENERATING"] = "generating";
    ProjectStatus["VALIDATING"] = "validating";
    ProjectStatus["COMPLETED"] = "completed";
    ProjectStatus["FAILED"] = "failed";
    ProjectStatus["ARCHIVED"] = "archived";
})(ProjectStatus || (exports.ProjectStatus = ProjectStatus = {}));
var ProjectVisibility;
(function (ProjectVisibility) {
    ProjectVisibility["PRIVATE"] = "private";
    ProjectVisibility["TEAM"] = "team";
    ProjectVisibility["PUBLIC"] = "public";
})(ProjectVisibility || (exports.ProjectVisibility = ProjectVisibility = {}));
//# sourceMappingURL=project.js.map