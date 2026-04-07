"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.mountFiles = mountFiles;
exports.mountDirectory = mountDirectory;
const dockerode_1 = __importDefault(require("dockerode"));
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const fs_1 = require("fs");
const child_process_1 = require("child_process");
const util_1 = require("util");
const execAsync = (0, util_1.promisify)(child_process_1.exec);
const docker = new dockerode_1.default();
/**
 * Copy files into running container
 */
async function mountFiles(containerId, files) {
    const container = docker.getContainer(containerId);
    const mounted = [];
    for (const filePath of files) {
        try {
            const stat = await fs.stat(filePath);
            if (stat.isDirectory()) {
                const containerPath = await mountDirectory(containerId, filePath);
                mounted.push({ hostPath: filePath, containerPath });
            }
            else {
                const fileName = path.basename(filePath);
                const containerPath = `/workspace/${fileName}`;
                // Create tar archive of single file
                const tarPath = `/tmp/mount-${Date.now()}.tar`;
                await execAsync(`tar -cf ${tarPath} -C "${path.dirname(filePath)}" "${fileName}"`);
                // Upload to container
                await container.putArchive((0, fs_1.createReadStream)(tarPath), { path: '/workspace' });
                // Cleanup
                await fs.unlink(tarPath);
                mounted.push({ hostPath: filePath, containerPath });
                console.log(`✅ Mounted: ${fileName} → ${containerPath}`);
            }
        }
        catch (err) {
            console.error(`❌ Failed to mount ${filePath}:`, err.message);
        }
    }
    return mounted;
}
/**
 * Copy directory into container
 */
async function mountDirectory(containerId, dirPath) {
    const container = docker.getContainer(containerId);
    const dirName = path.basename(dirPath);
    const containerPath = `/workspace/${dirName}`;
    // Create tar archive of directory
    const tarPath = `/tmp/mount-dir-${Date.now()}.tar`;
    await execAsync(`tar -cf ${tarPath} -C "${path.dirname(dirPath)}" "${dirName}"`);
    // Upload to container
    await container.putArchive((0, fs_1.createReadStream)(tarPath), { path: '/workspace' });
    // Cleanup
    await fs.unlink(tarPath);
    console.log(`✅ Mounted dir: ${dirName} → ${containerPath}`);
    return containerPath;
}
