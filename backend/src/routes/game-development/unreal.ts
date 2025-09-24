import * as express from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { authenticateUser } from '../../middleware/auth';
import { prisma } from '../../database/prisma';
import { logger } from '../../utils/logger';
import * as path from 'path';
import { promises as fs } from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const router = express.Router();

// User type is already declared in auth middleware
// No need to redeclare here

// Validation middleware
const validateRequest = (req: express.Request, res: express.Response, next: express.NextFunction): void => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors.array()
    });
    return;
  }
  next();
};

/**
 * Create new Unreal Engine project
 * POST /api/game-development/unreal/create
 */
router.post('/create',
  authenticateUser,
  [
    body('name').notEmpty().withMessage('Project name is required'),
    body('description').optional().isLength({ max: 500 }),
    body('engineVersion').optional().matches(/^\d+\.\d+$/).withMessage('Engine version must be in format X.Y'),
    body('targetPlatforms').optional().isArray(),
    body('rayTracingEnabled').optional().isBoolean(),
    body('lumenEnabled').optional().isBoolean(),
    body('naniteEnabled').optional().isBoolean(),
    body('cppSupport').optional().isBoolean(),
    body('projectPath').optional().isString()
  ],
  validateRequest,
  async (req: express.Request, res: express.Response) => {
    try {
      const {
        name,
        description,
        engineVersion = '5.3',
        targetPlatforms = ['Windows'],
        rayTracingEnabled = false,
        lumenEnabled = true,
        naniteEnabled = true,
        virtualShadowMaps = true,
        worldPartition = false,
        cppSupport = false,
        projectPath
      } = req.body;

      const userId = req.user!.id;

      // Create main project record
      const project = await prisma.project.create({
        data: {
          name,
          type: 'game',
          description,
          framework: 'Unreal',
          language: cppSupport ? 'C++' : 'Blueprint',
          user: { connect: { id: userId } },
          metadata: {
            engineType: 'unreal',
            created: new Date().toISOString()
          }
        }
      });

      // Determine project path
      const baseProjectPath = projectPath || path.join(process.cwd(), 'projects', 'unreal', project.id);
      const uprojectPath = path.join(baseProjectPath, `${name}.uproject`);
      const sourcePath = path.join(baseProjectPath, 'Source');
      const contentPath = path.join(baseProjectPath, 'Content');
      const configPath = path.join(baseProjectPath, 'Config');

      // Create Unreal-specific project record
      const unrealProject = await prisma.unrealProject.create({
        data: {
          projectId: project.id,
          engineVersion,
          targetPlatforms,
          rayTracingEnabled,
          lumenEnabled,
          naniteEnabled,
          virtualShadowMaps,
          worldPartition,
          projectPath: baseProjectPath,
          uprojectPath,
          sourceCodePath: sourcePath,
          contentPath,
          configPath,
          cppSupport,
          moduleName: cppSupport ? name : undefined,
          apiMacro: cppSupport ? `${name.toUpperCase()}_API` : undefined
        }
      });

      // Create project directory structure
      await fs.mkdir(baseProjectPath, { recursive: true });
      await fs.mkdir(sourcePath, { recursive: true });
      await fs.mkdir(contentPath, { recursive: true });
      await fs.mkdir(configPath, { recursive: true });

      // Create .uproject file
      const uprojectContent = {
        FileVersion: 3,
        EngineAssociation: engineVersion,
        Category: "",
        Description: description || "",
        Modules: cppSupport ? [
          {
            Name: name,
            Type: "Runtime",
            LoadingPhase: "Default"
          }
        ] : [],
        Plugins: [
          {
            Name: "ModelingToolsEditorMode",
            Enabled: true
          }
        ],
        TargetPlatforms: targetPlatforms
      };

      await fs.writeFile(uprojectPath, JSON.stringify(uprojectContent, null, 2));

      // Create DefaultEngine.ini
      const engineIniContent = `[/Script/EngineSettings.GameMapsSettings]
GameDefaultMap=/Engine/Maps/Templates/OpenWorld

[/Script/HardwareTargeting.HardwareTargetingSettings]
TargetedHardwareClass=Desktop
AppliedTargetedHardwareClass=Desktop
DefaultGraphicsPerformance=Maximum
AppliedDefaultGraphicsPerformance=Maximum

[/Script/Engine.RendererSettings]
r.GenerateMeshDistanceFields=True
r.DynamicGlobalIlluminationMethod=${lumenEnabled ? '1' : '0'}
r.ReflectionMethod=${lumenEnabled ? '1' : '0'}
r.Shadow.Virtual.Enable=${virtualShadowMaps ? '1' : '0'}
r.DefaultFeature.AutoExposure.ExtendDefaultLuminanceRange=True
r.DefaultFeature.LocalExposure.HighlightContrastScale=0.8
r.DefaultFeature.LocalExposure.ShadowContrastScale=0.8

[/Script/WorldPartitionEditor.WorldPartitionEditorSettings]
CommandletClass=WorldPartitionConvertCommandlet
bEnableWorldPartition=${worldPartition ? 'True' : 'False'}

[/Script/Engine.Engine]
+ActiveGameNameRedirects=(OldGameName="TP_Blank",NewGameName="/Script/${name}")
+ActiveGameNameRedirects=(OldGameName="/Script/TP_Blank",NewGameName="/Script/${name}")

[/Script/AndroidFileServerEditor.AndroidFileServerRuntimeSettings]
bEnablePlugin=True
bAllowNetworkConnection=True
SecurityToken=
bIncludeInShipping=False
bAllowExternalStartInShipping=False
bCompileAFSProject=True
bUseCompression=False
bLogFiles=False
bReportStats=False
ConnectionType=USBOnly
bUseManualIPAddress=False
ManualIPAddress=
`;

      await fs.writeFile(path.join(configPath, 'DefaultEngine.ini'), engineIniContent);

      // If C++ support is enabled, create basic module files
      if (cppSupport) {
        const moduleDir = path.join(sourcePath, name);
        await fs.mkdir(moduleDir, { recursive: true });

        // Create module header file
        const moduleHeaderContent = `#pragma once

#include "CoreMinimal.h"
#include "Modules/ModuleManager.h"

class F${name}Module : public IModuleInterface
{
public:
    virtual void StartupModule() override;
    virtual void ShutdownModule() override;
};
`;

        await fs.writeFile(path.join(moduleDir, `${name}.h`), moduleHeaderContent);

        // Create module implementation file
        const moduleImplContent = `#include "${name}.h"

#define LOCTEXT_NAMESPACE "F${name}Module"

void F${name}Module::StartupModule()
{
    // This code will execute after your module is loaded into memory; the exact timing is specified in the .uplugin file per-module
}

void F${name}Module::ShutdownModule()
{
    // This function may be called during shutdown to clean up your module. For modules that support dynamic reloading,
    // we call this function before unloading the module.
}

#undef LOCTEXT_NAMESPACE

IMPLEMENT_MODULE(F${name}Module, ${name})
`;

        await fs.writeFile(path.join(moduleDir, `${name}.cpp`), moduleImplContent);

        // Create Build.cs file
        const buildCsContent = `using UnrealBuildTool;

public class ${name} : ModuleRules
{
    public ${name}(ReadOnlyTargetRules Target) : base(Target)
    {
        PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;

        PublicDependencyModuleNames.AddRange(new string[] { 
            "Core", 
            "CoreUObject", 
            "Engine", 
            "InputCore" 
        });

        PrivateDependencyModuleNames.AddRange(new string[] { });

        // Uncomment if you are using Slate UI
        // PrivateDependencyModuleNames.AddRange(new string[] { "Slate", "SlateCore" });

        // Uncomment if you are using online features
        // PrivateDependencyModuleNames.Add("OnlineSubsystem");

        // To include OnlineSubsystemSteam, add it to the plugins section in your uproject file with the Enabled attribute set to true
    }
}
`;

        await fs.writeFile(path.join(moduleDir, `${name}.Build.cs`), buildCsContent);

        // Create Target.cs files
        const targetCsContent = `using UnrealBuildTool;
using System.Collections.Generic;

public class ${name}Target : TargetRules
{
    public ${name}Target(TargetInfo Target) : base(Target)
    {
        Type = TargetType.Game;
        DefaultBuildSettings = BuildSettingsVersion.V2;
        IncludeOrderVersion = EngineIncludeOrderVersion.Unreal5_1;
        ExtraModuleNames.Add("${name}");
    }
}
`;

        await fs.writeFile(path.join(sourcePath, `${name}Target.cs`), targetCsContent);

        const editorTargetCsContent = `using UnrealBuildTool;
using System.Collections.Generic;

public class ${name}EditorTarget : TargetRules
{
    public ${name}EditorTarget(TargetInfo Target) : base(Target)
    {
        Type = TargetType.Editor;
        DefaultBuildSettings = BuildSettingsVersion.V2;
        IncludeOrderVersion = EngineIncludeOrderVersion.Unreal5_1;
        ExtraModuleNames.Add("${name}");
    }
}
`;

        await fs.writeFile(path.join(sourcePath, `${name}EditorTarget.cs`), editorTargetCsContent);
      }

      // Create default build configuration
      const buildConfig = await prisma.unrealBuildConfig.create({
        data: {
          unrealProjectId: unrealProject.id,
          configName: 'Development',
          platform: targetPlatforms[0] || 'Win64',
          outputPath: path.join(baseProjectPath, 'Binaries', targetPlatforms[0] || 'Win64')
        }
      });

      logger.info('Created Unreal Engine project', {
        projectId: project.id,
        unrealProjectId: unrealProject.id,
        userId,
        name,
        engineVersion,
        cppSupport
      });

      res.json({
        success: true,
        data: {
          project,
          unrealProject,
          buildConfig,
          projectPath: baseProjectPath,
          uprojectPath
        }
      });

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to create Unreal project', { 
        error: errorMessage,
        userId: req.user?.id 
      });
      
      res.status(500).json({
        success: false,
        error: 'Failed to create Unreal project',
        details: errorMessage
      });
    }
  }
);

/**
 * Generate C++ or Blueprint script for Unreal project
 * POST /api/game-development/unreal/generate-script
 */
router.post('/generate-script',
  authenticateUser,
  [
    body('projectId').notEmpty().withMessage('Project ID is required'),
    body('scriptType').isIn(['cpp', 'blueprint']).withMessage('Script type must be cpp or blueprint'),
    body('className').notEmpty().withMessage('Class name is required'),
    body('baseClass').optional().isString(),
    body('features').optional().isArray()
  ],
  validateRequest,
  async (req: express.Request, res: express.Response) => {
    try {
      const { projectId, scriptType, className, baseClass = 'AActor', features = [] } = req.body;
      const userId = req.user!.id;

      // Verify project ownership and get Unreal project
      const project = await prisma.project.findFirst({
        where: { id: projectId, userId },
        include: { unrealProject: true }
      }) as any;

      if (!project || !project.unrealProject) {
        res.status(404).json({
          success: false,
          error: 'Unreal project not found'
        });
        return;
      }

      const unrealProject = project.unrealProject;

      if (scriptType === 'cpp') {
        // Generate C++ class files
        const headerContent = generateCppHeader(className, baseClass, features);
        const implementationContent = generateCppImplementation(className, baseClass, features);

        const classDir = path.join(unrealProject.sourceCodePath!, unrealProject.moduleName!);
        const headerPath = path.join(classDir, `${className}.h`);
        const cppPath = path.join(classDir, `${className}.cpp`);

        await fs.writeFile(headerPath, headerContent);
        await fs.writeFile(cppPath, implementationContent);

        res.json({
          success: true,
          data: {
            scriptType,
            className,
            files: {
              header: headerPath,
              implementation: cppPath
            },
            content: {
              header: headerContent,
              implementation: implementationContent
            }
          }
        });

      } else {
        // Generate Blueprint template data
        const blueprintData = generateBlueprintTemplate(className, baseClass, features);

        res.json({
          success: true,
          data: {
            scriptType,
            className,
            blueprintData,
            instructions: 'Create a new Blueprint in Unreal Editor with the following configuration'
          }
        });
      }

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to generate Unreal script', { 
        error: errorMessage,
        userId: req.user?.id 
      });
      
      res.status(500).json({
        success: false,
        error: 'Failed to generate script',
        details: errorMessage
      });
    }
  }
);

/**
 * Compile Unreal project using Unreal Build Tool
 * POST /api/game-development/unreal/compile
 */
router.post('/compile',
  authenticateUser,
  [
    body('projectId').notEmpty().withMessage('Project ID is required'),
    body('configuration').optional().isIn(['Debug', 'Development', 'Shipping', 'Test']),
    body('platform').optional().isString()
  ],
  validateRequest,
  async (req: express.Request, res: express.Response) => {
    try {
      const { projectId, configuration = 'Development', platform = 'Win64' } = req.body;
      const userId = req.user!.id;

      // Get project and build configuration
      const project = await prisma.project.findFirst({
        where: { id: projectId, userId },
        include: { 
          unrealProject: {
            include: { buildConfigs: true }
          }
        }
      }) as any;

      if (!project || !project.unrealProject) {
        res.status(404).json({
          success: false,
          error: 'Unreal project not found'
        });
        return;
      }

      const unrealProject = project.unrealProject;
      
      // Find or create build configuration
      let buildConfig = unrealProject.buildConfigs.find(
        config => config.configName === configuration && config.platform === platform
      );

      if (!buildConfig) {
        buildConfig = await prisma.unrealBuildConfig.create({
          data: {
            unrealProjectId: unrealProject.id,
            configName: configuration,
            platform,
            outputPath: path.join(unrealProject.projectPath!, 'Binaries', platform)
          }
        });
      }

      // Update build status to building
      await prisma.unrealBuildConfig.update({
        where: { id: buildConfig.id },
        data: { 
          buildStatus: 'building',
          lastBuildTime: new Date()
        }
      });

      // Execute Unreal Build Tool command
      const uprojectPath = unrealProject.uprojectPath!;
      const buildCommand = `"C:\\Program Files\\Epic Games\\UE_${unrealProject.engineVersion}\\Engine\\Binaries\\DotNET\\UnrealBuildTool.exe" ${project.name} ${platform} ${configuration} -project="${uprojectPath}"`;

      const startTime = Date.now();
      
      try {
        const { stdout, stderr } = await execAsync(buildCommand, { 
          cwd: unrealProject.projectPath!,
          timeout: 300000 // 5 minute timeout
        });

        const buildDuration = Math.floor((Date.now() - startTime) / 1000);

        // Update build status to success
        await prisma.unrealBuildConfig.update({
          where: { id: buildConfig.id },
          data: { 
            buildStatus: 'success',
            buildDuration,
            buildLog: stdout + stderr,
            buildErrors: undefined
          }
        });

        res.json({
          success: true,
          data: {
            buildStatus: 'success',
            buildDuration,
            configuration,
            platform,
            output: stdout
          }
        });

      } catch (buildError: unknown) {
        const errorMessage = buildError instanceof Error ? buildError.message : 'Build failed';
        
        // Update build status to failed
        await prisma.unrealBuildConfig.update({
          where: { id: buildConfig.id },
          data: { 
            buildStatus: 'failed',
            buildLog: errorMessage,
            buildErrors: { error: errorMessage }
          }
        });

        res.status(400).json({
          success: false,
          error: 'Build failed',
          details: errorMessage
        });
      }

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to compile Unreal project', { 
        error: errorMessage,
        userId: req.user?.id 
      });
      
      res.status(500).json({
        success: false,
        error: 'Failed to compile project',
        details: errorMessage
      });
    }
  }
);

/**
 * Get Unreal project details
 * GET /api/game-development/unreal/:projectId
 */
router.get('/:projectId',
  authenticateUser,
  [
    param('projectId').notEmpty().withMessage('Project ID is required')
  ],
  validateRequest,
  async (req: express.Request, res: express.Response) => {
    try {
      const { projectId } = req.params;
      const userId = req.user!.id;

      const project = await prisma.project.findFirst({
        where: { id: projectId, userId },
        include: {
          unrealProject: {
            include: {
              blueprintNodes: true,
              assetReferences: true,
              buildConfigs: true
            }
          }
        }
      }) as any;

      if (!project || !project.unrealProject) {
        res.status(404).json({
          success: false,
          error: 'Unreal project not found'
        });
        return;
      }

      res.json({
        success: true,
        data: project
      });

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to get Unreal project', { 
        error: errorMessage,
        userId: req.user?.id 
      });
      
      res.status(500).json({
        success: false,
        error: 'Failed to get project details',
        details: errorMessage
      });
    }
  }
);

// Helper functions for code generation
function generateCppHeader(className: string, baseClass: string, features: string[]): string {
  const includeStatements = [
    '#pragma once',
    '',
    '#include "CoreMinimal.h"',
    `#include "Engine/Engine.h"`,
    `#include "${baseClass.replace('A', '').replace('U', '')}.h"`,
    `#include "${className}.generated.h"`,
    ''
  ];

  const classDeclaration = [
    'UCLASS()',
    `class ${className.toUpperCase()}_API ${className} : public ${baseClass}`,
    '{',
    '\tGENERATED_BODY()',
    '',
    'public:',
    `\t${className}();`,
    ''
  ];

  // Add feature-specific methods
  if (features.includes('tick')) {
    classDeclaration.push('\tvirtual void Tick(float DeltaTime) override;');
  }

  if (features.includes('input')) {
    classDeclaration.push('\tvirtual void SetupPlayerInputComponent(class UInputComponent* PlayerInputComponent) override;');
  }

  if (features.includes('movement')) {
    classDeclaration.push('\tUFUNCTION(BlueprintCallable)');
    classDeclaration.push('\tvoid MoveForward(float Value);');
    classDeclaration.push('\tUFUNCTION(BlueprintCallable)');
    classDeclaration.push('\tvoid MoveRight(float Value);');
  }

  classDeclaration.push('};');

  return [...includeStatements, ...classDeclaration].join('\n');
}

function generateCppImplementation(className: string, baseClass: string, features: string[]): string {
  const includeStatements = [
    `#include "${className}.h"`,
    '',
    `${className}::${className}()`,
    '{',
    '\tPrimaryActorTick.bCanEverTick = true;',
    '}',
    ''
  ];

  const implementations: any[] = [];

  if (features.includes('tick')) {
    implementations.push(
      `void ${className}::Tick(float DeltaTime)`,
      '{',
      '\tSuper::Tick(DeltaTime);',
      '\t// Add tick logic here',
      '}',
      ''
    );
  }

  if (features.includes('movement')) {
    implementations.push(
      `void ${className}::MoveForward(float Value)`,
      '{',
      '\tif (Value != 0.0f)',
      '\t{',
      '\t\tFVector Direction = GetActorForwardVector();',
      '\t\tAddMovementInput(Direction, Value);',
      '\t}',
      '}',
      '',
      `void ${className}::MoveRight(float Value)`,
      '{',
      '\tif (Value != 0.0f)',
      '\t{',
      '\t\tFVector Direction = GetActorRightVector();',
      '\t\tAddMovementInput(Direction, Value);',
      '\t}',
      '}',
      ''
    );
  }

  return [...includeStatements, ...implementations].join('\n');
}

function generateBlueprintTemplate(className: string, baseClass: string, features: string[]): any {
  return {
    className,
    baseClass,
    blueprintType: baseClass.startsWith('A') ? 'Actor' : 'Object',
    components: features.includes('mesh') ? ['StaticMeshComponent'] : [],
    events: features.includes('tick') ? ['Tick'] : [],
    functions: features.includes('movement') ? ['MoveForward', 'MoveRight'] : [],
    variables: features.includes('health') ? [
      { name: 'Health', type: 'float', defaultValue: 100.0 },
      { name: 'MaxHealth', type: 'float', defaultValue: 100.0 }
    ] : []
  };
}

export default router;
