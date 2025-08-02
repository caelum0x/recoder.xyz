"use strict";
/**
 * Core plugin interface definitions for the Craft Code extensibility framework
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PluginErrorCode = exports.PluginError = exports.PluginCategory = void 0;
var PluginCategory;
(function (PluginCategory) {
    PluginCategory["AI_INTEGRATION"] = "ai-integration";
    PluginCategory["CODE_GENERATION"] = "code-generation";
    PluginCategory["DEPLOYMENT"] = "deployment";
    PluginCategory["TESTING"] = "testing";
    PluginCategory["VERSION_CONTROL"] = "version-control";
    PluginCategory["DATABASE"] = "database";
    PluginCategory["CLOUD_SERVICES"] = "cloud-services";
    PluginCategory["BLOCKCHAIN"] = "blockchain";
    PluginCategory["PAYMENT"] = "payment";
    PluginCategory["UTILITIES"] = "utilities";
    PluginCategory["THEMES"] = "themes";
    PluginCategory["LANGUAGES"] = "languages";
    PluginCategory["FRAMEWORKS"] = "frameworks";
    PluginCategory["CONTAINERS"] = "containers";
})(PluginCategory || (exports.PluginCategory = PluginCategory = {}));
class PluginError extends Error {
    constructor(message, pluginId, code, details) {
        super(message);
        this.pluginId = pluginId;
        this.code = code;
        this.details = details;
        this.name = 'PluginError';
        Object.setPrototypeOf(this, PluginError.prototype);
    }
}
exports.PluginError = PluginError;
var PluginErrorCode;
(function (PluginErrorCode) {
    PluginErrorCode["ACTIVATION_FAILED"] = "ACTIVATION_FAILED";
    PluginErrorCode["DEACTIVATION_FAILED"] = "DEACTIVATION_FAILED";
    PluginErrorCode["INVALID_MANIFEST"] = "INVALID_MANIFEST";
    PluginErrorCode["DEPENDENCY_NOT_FOUND"] = "DEPENDENCY_NOT_FOUND";
    PluginErrorCode["PERMISSION_DENIED"] = "PERMISSION_DENIED";
    PluginErrorCode["CONFIGURATION_ERROR"] = "CONFIGURATION_ERROR";
    PluginErrorCode["RUNTIME_ERROR"] = "RUNTIME_ERROR";
    PluginErrorCode["SANDBOX_VIOLATION"] = "SANDBOX_VIOLATION";
    PluginErrorCode["VERSION_INCOMPATIBLE"] = "VERSION_INCOMPATIBLE";
})(PluginErrorCode || (exports.PluginErrorCode = PluginErrorCode = {}));
//# sourceMappingURL=types.js.map