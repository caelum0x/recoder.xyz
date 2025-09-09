import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { checkRateLimit } from '../middleware/rate-limit';
import { validateRequest } from '../middleware/validation';
import { z } from 'zod';
import { exec } from 'child_process';
import { promisify } from 'util';
import { Request, Response } from 'express';
import { prisma } from '../database/prisma';
import path from 'path';
import fs from 'fs/promises';

const execAsync = promisify(exec);
const router = Router();

// Validation schemas
const unityProjectSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  template: z.enum(['2D', '3D', 'VR', 'Mobile', 'AR', 'Custom']),
  unityVersion: z.string().optional().default('2022.3.0f1'),
  platform: z.array(z.enum(['Windows', 'Mac', 'Linux', 'iOS', 'Android', 'WebGL', 'Console'])),
  renderPipeline: z.enum(['Built-in', 'URP', 'HDRP']).default('URP'),
  features: z.array(z.string()).optional().default([]),
  isMultiplayer: z.boolean().default(false),
  analytics: z.boolean().default(true),
});

const unityScriptSchema = z.object({
  projectId: z.string().uuid(),
  scriptName: z.string().min(1),
  scriptType: z.enum(['MonoBehaviour', 'ScriptableObject', 'Editor', 'Custom']),
  namespace: z.string().optional(),
  baseClass: z.string().optional(),
  interfaces: z.array(z.string()).optional().default([]),
  functionality: z.string().min(10).max(2000),
  includeComments: z.boolean().default(true),
  generateTests: z.boolean().default(false),
});

const unityBuildSchema = z.object({
  projectId: z.string().uuid(),
  platforms: z.array(z.enum(['Windows', 'Mac', 'Linux', 'iOS', 'Android', 'WebGL'])),
  buildSettings: z.object({
    developmentBuild: z.boolean().default(false),
    scriptDebugging: z.boolean().default(false),
    compressionMethod: z.enum(['Default', 'LZ4', 'LZ4HC', 'LZMA']).default('Default'),
    targetGroup: z.string().optional(),
    defines: z.array(z.string()).optional().default([]),
  }),
  cloudBuild: z.boolean().default(false),
  autoPublish: z.boolean().default(false),
});

const unrealProjectSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  template: z.enum(['Blank', 'First Person', 'Third Person', 'Top Down', 'Vehicle', 'VR', 'AR']),
  engineVersion: z.string().optional().default('5.3'),
  targetPlatforms: z.array(z.enum(['Windows', 'Mac', 'Linux', 'iOS', 'Android', 'Console'])),
  renderingFeatures: z.object({
    rayTracing: z.boolean().default(false),
    lumen: z.boolean().default(true),
    nanite: z.boolean().default(true),
    virtualShadowMaps: z.boolean().default(true),
  }),
  isMultiplayer: z.boolean().default(false),
  blueprintOnly: z.boolean().default(false),
});

const unrealScriptSchema = z.object({
  projectId: z.string().uuid(),
  scriptName: z.string().min(1),
  scriptType: z.enum(['Actor', 'ActorComponent', 'Pawn', 'Character', 'PlayerController', 'GameMode', 'Widget', 'Object', 'Interface', 'Subsystem']),
  scriptLanguage: z.enum(['C++', 'Blueprint', 'Hybrid']).default('C++'),
  baseClass: z.string().optional(),
  includeHeader: z.boolean().default(true),
  generateBlueprint: z.boolean().default(false),
  functionality: z.string().min(15).max(2000),
  includeComments: z.boolean().default(true),
  generateTests: z.boolean().default(false),
  useUE5Features: z.boolean().default(true),
  projectMetadata: z.object({
    engineVersion: z.string(),
    blueprintOnly: z.boolean(),
    renderingFeatures: z.object({
      rayTracing: z.boolean(),
      lumen: z.boolean(),
      nanite: z.boolean(),
      virtualShadowMaps: z.boolean()
    })
  })
});

const gameAssetSchema = z.object({
  projectId: z.string().uuid(),
  assetName: z.string().min(1),
  assetType: z.enum(['Texture', 'Model', 'Audio', 'Animation', 'Script', 'Prefab', 'Material', 'Shader']),
  category: z.string().optional(),
  tags: z.array(z.string()).optional().default([]),
  metadata: z.object({
    size: z.number().optional(),
    format: z.string().optional(),
    resolution: z.string().optional(),
    duration: z.number().optional(),
  }).optional(),
  dependencies: z.array(z.string()).optional().default([]),
});

// Rate limiting
const gameDevRateLimit = checkRateLimit(2000);
const buildRateLimit = checkRateLimit(100); // More restrictive for builds

// Unity Project Management
router.post('/unity/create', authenticate, gameDevRateLimit, validateRequest(unityProjectSchema), async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const projectData = req.body;

    // Check user subscription for game development features
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user?.subscription || user.subscription === 'free') {
      return res.status(403).json({
        success: false,
        error: 'Game development features require a Pro or Enterprise subscription',
        upgradeRequired: true
      });
    }

    // Create Unity project directory structure
    const projectPath = path.join(process.env.PROJECTS_DIR || './projects', userId, 'unity', projectData.name);
    await fs.mkdir(projectPath, { recursive: true });

    // Generate Unity project files
    const projectConfig = await generateUnityProject(projectPath, projectData);

    // Save project to database
    const project = await prisma.project.create({
      data: {
        userId,
        name: projectData.name,
        description: projectData.description,
        type: 'game',
        framework: 'Unity',
        language: 'C#',
        metadata: {
          gameEngine: 'Unity',
          unityVersion: projectData.unityVersion,
          template: projectData.template,
          platforms: projectData.platform,
          renderPipeline: projectData.renderPipeline,
          features: projectData.features,
          isMultiplayer: projectData.isMultiplayer,
          projectPath,
          ...projectConfig
        },
        status: 'active'
      }
    });

    // Track analytics
    await prisma.usageAnalytics.create({
      data: {
        userId,
        eventType: 'unity_project_created',
        platform: 'cli',
        metadata: {
          template: projectData.template,
          platforms: projectData.platform,
          renderPipeline: projectData.renderPipeline
        }
      }
    });

    res.json({
      success: true,
      data: {
        project,
        projectPath: `/unity/${projectData.name}`,
        generatedFiles: projectConfig.generatedFiles
      }
    });

  } catch (error) {
    console.error('Unity project creation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create Unity project'
    });
  }
});

// Generate Unity C# Scripts
router.post('/unity/generate-script', authenticate, gameDevRateLimit, validateRequest(unityScriptSchema), async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const { projectId, scriptName, scriptType, namespace, baseClass, interfaces, functionality, includeComments, generateTests } = req.body;

    // Verify project ownership
    const project = await prisma.project.findFirst({
      where: { id: projectId, userId }
    });

    if (!project) {
      return res.status(404).json({
        success: false,
        error: 'Project not found'
      });
    }

    // Generate Unity C# script
    const scriptContent = await generateUnityScript({
      scriptName,
      scriptType,
      namespace,
      baseClass,
      interfaces,
      functionality,
      includeComments
    });

    let testContent = '';
    if (generateTests) {
      testContent = await generateUnityTestScript(scriptName, scriptContent);
    }

    // Save generated files
    const projectPath = project.metadata?.projectPath as string;
    const scriptsPath = path.join(projectPath, 'Assets', 'Scripts');
    const testsPath = path.join(projectPath, 'Assets', 'Tests');
    
    await fs.mkdir(scriptsPath, { recursive: true });
    await fs.writeFile(path.join(scriptsPath, `${scriptName}.cs`), scriptContent);

    if (generateTests) {
      await fs.mkdir(testsPath, { recursive: true });
      await fs.writeFile(path.join(testsPath, `${scriptName}Tests.cs`), testContent);
    }

    // Track generation
    await prisma.codeGeneration.create({
      data: {
        userId,
        projectId,
        prompt: functionality,
        type: 'script',
        framework: 'Unity',
        language: 'C#',
        generatedCode: scriptContent,
        metadata: {
          scriptType,
          hasTests: generateTests,
          files: generateTests ? 2 : 1
        },
        status: 'completed',
        tokensUsed: Math.floor(scriptContent.length / 4) // Rough estimate
      }
    });

    res.json({
      success: true,
      data: {
        scriptContent,
        testContent: generateTests ? testContent : undefined,
        files: {
          script: `Assets/Scripts/${scriptName}.cs`,
          test: generateTests ? `Assets/Tests/${scriptName}Tests.cs` : undefined
        }
      }
    });

  } catch (error) {
    console.error('Unity script generation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate Unity script'
    });
  }
});

// Unity Build System
router.post('/unity/build', authenticate, buildRateLimit, validateRequest(unityBuildSchema), async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const { projectId, platforms, buildSettings, cloudBuild, autoPublish } = req.body;

    // Verify project ownership
    const project = await prisma.project.findFirst({
      where: { id: projectId, userId }
    });

    if (!project) {
      return res.status(404).json({
        success: false,
        error: 'Project not found'
      });
    }

    // Check subscription for cloud builds
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (cloudBuild && user?.subscription === 'free') {
      return res.status(403).json({
        success: false,
        error: 'Cloud builds require a Pro or Enterprise subscription',
        upgradeRequired: true
      });
    }

    // Create build record
    const build = await prisma.gameBuild.create({
      data: {
        projectId,
        userId,
        platforms,
        buildSettings: buildSettings as any,
        cloudBuild,
        status: 'queued',
        buildNumber: Math.floor(Date.now() / 1000).toString(),
        startedAt: new Date()
      }
    });

    // Queue build process
    if (cloudBuild) {
      await queueCloudBuild(build.id, project, platforms, buildSettings);
    } else {
      await queueLocalBuild(build.id, project, platforms, buildSettings);
    }

    res.json({
      success: true,
      data: {
        buildId: build.id,
        status: 'queued',
        estimatedTime: platforms.length * 5, // Minutes
        platforms
      }
    });

  } catch (error) {
    console.error('Unity build error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to start build process'
    });
  }
});

// Generate Unreal Engine Scripts
router.post('/unreal/generate-script', authenticate, gameDevRateLimit, validateRequest(unrealScriptSchema), async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const { 
      projectId, 
      scriptName, 
      scriptType, 
      scriptLanguage, 
      baseClass, 
      includeHeader, 
      generateBlueprint, 
      functionality, 
      includeComments, 
      generateTests, 
      useUE5Features,
      projectMetadata 
    } = req.body;

    // Verify project ownership
    const project = await prisma.project.findFirst({
      where: { id: projectId, userId }
    });

    if (!project) {
      return res.status(404).json({
        success: false,
        error: 'Project not found'
      });
    }

    let scriptContent = '';
    let headerContent = '';
    let blueprintContent = '';
    const files: any = {};

    // Generate based on script language
    if (scriptLanguage === 'C++' || scriptLanguage === 'Hybrid') {
      const cppResult = await generateUnrealCppScript({
        scriptName,
        scriptType,
        baseClass,
        functionality,
        includeComments,
        useUE5Features,
        projectName: project.name,
        engineVersion: projectMetadata.engineVersion,
        renderingFeatures: projectMetadata.renderingFeatures
      });

      scriptContent = cppResult.cpp;
      if (includeHeader) {
        headerContent = cppResult.header;
        files.header = `Source/${project.name}/${scriptName}.h`;
      }
      files.script = `Source/${project.name}/${scriptName}.cpp`;
    }

    if (scriptLanguage === 'Blueprint' || generateBlueprint) {
      blueprintContent = await generateUnrealBlueprintScript({
        scriptName,
        scriptType,
        functionality,
        includeComments,
        projectName: project.name
      });
      files.blueprint = `Content/Blueprints/BP_${scriptName}.uasset`;
    }

    // Save generated files to project directory
    const projectPath = project.metadata?.projectPath as string;
    if (projectPath) {
      if (scriptContent) {
        const sourcePath = path.join(projectPath, 'Source', project.name);
        await fs.mkdir(sourcePath, { recursive: true });
        await fs.writeFile(path.join(sourcePath, `${scriptName}.cpp`), scriptContent);
      }

      if (headerContent) {
        const sourcePath = path.join(projectPath, 'Source', project.name);
        await fs.writeFile(path.join(sourcePath, `${scriptName}.h`), headerContent);
      }

      if (blueprintContent) {
        const blueprintPath = path.join(projectPath, 'Content', 'Blueprints');
        await fs.mkdir(blueprintPath, { recursive: true });
        await fs.writeFile(path.join(blueprintPath, `BP_${scriptName}.json`), blueprintContent);
      }
    }

    // Track generation in database
    await prisma.codeGeneration.create({
      data: {
        userId,
        projectId,
        prompt: functionality,
        type: 'script',
        framework: 'Unreal Engine',
        language: scriptLanguage,
        generatedCode: scriptContent || blueprintContent,
        metadata: {
          scriptType,
          scriptLanguage,
          hasHeader: !!headerContent,
          hasBlueprint: !!blueprintContent,
          useUE5Features,
          files: Object.keys(files).length
        },
        status: 'completed',
        tokensUsed: Math.floor((scriptContent + headerContent + blueprintContent).length / 4)
      }
    });

    res.json({
      success: true,
      data: {
        scriptContent: scriptContent || undefined,
        headerContent: headerContent || undefined,
        blueprintContent: blueprintContent || undefined,
        files
      }
    });

  } catch (error) {
    console.error('Unreal script generation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate Unreal Engine script'
    });
  }
});

// Unreal Engine Project Creation
router.post('/unreal/create', authenticate, gameDevRateLimit, validateRequest(unrealProjectSchema), async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const projectData = req.body;

    // Check subscription
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user?.subscription || user.subscription === 'free') {
      return res.status(403).json({
        success: false,
        error: 'Unreal Engine development requires a Pro or Enterprise subscription',
        upgradeRequired: true
      });
    }

    // Create Unreal project
    const projectPath = path.join(process.env.PROJECTS_DIR || './projects', userId, 'unreal', projectData.name);
    await fs.mkdir(projectPath, { recursive: true });

    const projectConfig = await generateUnrealProject(projectPath, projectData);

    const project = await prisma.project.create({
      data: {
        userId,
        name: projectData.name,
        description: projectData.description,
        type: 'game',
        framework: 'Unreal Engine',
        language: projectData.blueprintOnly ? 'Blueprint' : 'C++',
        metadata: {
          gameEngine: 'Unreal',
          engineVersion: projectData.engineVersion,
          template: projectData.template,
          platforms: projectData.targetPlatforms,
          renderingFeatures: projectData.renderingFeatures,
          isMultiplayer: projectData.isMultiplayer,
          blueprintOnly: projectData.blueprintOnly,
          projectPath,
          ...projectConfig
        },
        status: 'active'
      }
    });

    res.json({
      success: true,
      data: {
        project,
        projectPath: `/unreal/${projectData.name}`,
        generatedFiles: projectConfig.generatedFiles
      }
    });

  } catch (error) {
    console.error('Unreal project creation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create Unreal project'
    });
  }
});

// Asset Management
router.post('/assets', authenticate, gameDevRateLimit, validateRequest(gameAssetSchema), async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const assetData = req.body;

    const asset = await prisma.gameAsset.create({
      data: {
        ...assetData,
        userId,
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date()
      }
    });

    res.json({
      success: true,
      data: asset
    });

  } catch (error) {
    console.error('Asset creation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create asset'
    });
  }
});

// Get Game Projects
router.get('/projects', authenticate, gameDevRateLimit, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const { engine, platform, page = '1', limit = '10' } = req.query;

    const where: any = {
      userId,
      type: 'game'
    };

    if (engine) {
      where.framework = engine === 'unity' ? 'Unity' : 'Unreal Engine';
    }

    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
    const take = parseInt(limit as string);

    const [projects, total] = await Promise.all([
      prisma.project.findMany({
        where,
        skip,
        take,
        orderBy: { updatedAt: 'desc' },
        include: {
          _count: {
            select: {
              gameAssets: true,
              gameBuilds: true
            }
          }
        }
      }),
      prisma.project.count({ where })
    ]);

    res.json({
      success: true,
      data: {
        projects,
        pagination: {
          page: parseInt(page as string),
          limit: parseInt(limit as string),
          total,
          pages: Math.ceil(total / parseInt(limit as string))
        }
      }
    });

  } catch (error) {
    console.error('Game projects fetch error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch game projects'
    });
  }
});

// Get Build Status
router.get('/builds/:buildId/status', authenticate, gameDevRateLimit, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const { buildId } = req.params;

    const build = await prisma.gameBuild.findFirst({
      where: { id: buildId, userId },
      include: {
        project: {
          select: { name: true, framework: true }
        }
      }
    });

    if (!build) {
      return res.status(404).json({
        success: false,
        error: 'Build not found'
      });
    }

    res.json({
      success: true,
      data: build
    });

  } catch (error) {
    console.error('Build status error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get build status'
    });
  }
});

// Helper functions
async function generateUnityProject(projectPath: string, config: any) {
  // Generate Unity project structure
  const directories = [
    'Assets/Scripts',
    'Assets/Scenes',
    'Assets/Materials',
    'Assets/Prefabs',
    'Assets/Textures',
    'Assets/Audio',
    'Assets/Animations',
    'ProjectSettings',
    'Packages'
  ];

  // Create directory structure
  for (const dir of directories) {
    await fs.mkdir(path.join(projectPath, dir), { recursive: true });
  }

  // Generate project files
  const projectSettings = generateUnityProjectSettings(config);
  const packageManifest = generateUnityPackageManifest(config);
  const mainScene = generateUnityMainScene(config);

  await fs.writeFile(path.join(projectPath, 'ProjectSettings', 'ProjectSettings.asset'), projectSettings);
  await fs.writeFile(path.join(projectPath, 'Packages', 'manifest.json'), packageManifest);
  await fs.writeFile(path.join(projectPath, 'Assets', 'Scenes', 'MainScene.unity'), mainScene);

  return {
    generatedFiles: [
      'ProjectSettings/ProjectSettings.asset',
      'Packages/manifest.json',
      'Assets/Scenes/MainScene.unity'
    ],
    directories
  };
}

async function generateUnityScript(config: any) {
  const { scriptName, scriptType, namespace, baseClass, interfaces, functionality, includeComments } = config;

  let script = '';
  
  if (includeComments) {
    script += `/// <summary>\n/// ${functionality}\n/// Generated by Recoder.xyz\n/// </summary>\n\n`;
  }

  script += `using UnityEngine;\n`;
  
  if (scriptType === 'Editor') {
    script += `using UnityEditor;\n`;
  }
  
  script += `using System.Collections;\nusing System.Collections.Generic;\n\n`;

  if (namespace) {
    script += `namespace ${namespace}\n{\n`;
  }

  const indentation = namespace ? '    ' : '';
  const actualBaseClass = baseClass || (scriptType === 'MonoBehaviour' ? 'MonoBehaviour' : 
                                       scriptType === 'ScriptableObject' ? 'ScriptableObject' : 
                                       'MonoBehaviour');

  script += `${indentation}public class ${scriptName} : ${actualBaseClass}`;
  
  if (interfaces && interfaces.length > 0) {
    script += `, ${interfaces.join(', ')}`;
  }
  
  script += `\n${indentation}{\n`;

  // Generate basic structure based on base class
  if (actualBaseClass === 'MonoBehaviour') {
    script += `${indentation}    void Start()\n${indentation}    {\n${indentation}        // Initialize component\n${indentation}    }\n\n`;
    script += `${indentation}    void Update()\n${indentation}    {\n${indentation}        // Update logic\n${indentation}    }\n\n`;
  }

  // Add custom functionality comment
  script += `${indentation}    // ${functionality}\n`;
  script += `${indentation}    // TODO: Implement the requested functionality\n\n`;

  script += `${indentation}}\n`;

  if (namespace) {
    script += `}\n`;
  }

  return script;
}

async function generateUnityTestScript(scriptName: string, scriptContent: string) {
  return `using System.Collections;
using System.Collections.Generic;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.TestTools;

public class ${scriptName}Tests
{
    [Test]
    public void ${scriptName}_Creation_Test()
    {
        // Arrange & Act
        var gameObject = new GameObject();
        var component = gameObject.AddComponent<${scriptName}>();
        
        // Assert
        Assert.IsNotNull(component);
        
        // Cleanup
        Object.DestroyImmediate(gameObject);
    }
    
    [UnityTest]
    public IEnumerator ${scriptName}_Runtime_Test()
    {
        // Arrange
        var gameObject = new GameObject();
        var component = gameObject.AddComponent<${scriptName}>();
        
        // Act
        yield return null; // Wait one frame
        
        // Assert
        Assert.IsNotNull(component);
        
        // Cleanup
        Object.DestroyImmediate(gameObject);
    }
}`;
}

function generateUnityProjectSettings(config: any) {
  // Simplified Unity project settings
  return `%YAML 1.1
%TAG !u! tag:unity3d.com,2011:
--- !u!129 &1
PlayerSettings:
  m_ObjectHideFlags: 0
  serializedVersion: 23
  productName: ${config.name}
  companyName: Generated by Recoder
  defaultCursor: {fileID: 0}
  cursorHotspot: {x: 0, y: 0}
  m_SplashScreenBackgroundColor: {r: 0.13725491, g: 0.12156863, b: 0.1254902, a: 1}
  m_PlayerDataRoot: 
  m_BuildTargets:
${config.platform.map((p: string) => `  - ${p}`).join('\n')}
  m_GraphicsAPIs:
    m_Automatic: 1`;
}

function generateUnityPackageManifest(config: any) {
  const packages: Record<string, string> = {
    "com.unity.collab-proxy": "2.0.5",
    "com.unity.feature.development": "1.0.1",
    "com.unity.ide.rider": "3.0.24",
    "com.unity.ide.visualstudio": "2.0.18",
    "com.unity.ide.vscode": "1.2.5",
    "com.unity.test-framework": "1.1.33",
    "com.unity.textmeshpro": "3.0.6",
    "com.unity.timeline": "1.7.5",
    "com.unity.ugui": "1.0.0",
    "com.unity.visualscripting": "1.8.0",
    "com.unity.modules.ai": "1.0.0",
    "com.unity.modules.androidjni": "1.0.0",
    "com.unity.modules.animation": "1.0.0",
    "com.unity.modules.assetbundle": "1.0.0",
    "com.unity.modules.audio": "1.0.0",
    "com.unity.modules.cloth": "1.0.0",
    "com.unity.modules.director": "1.0.0",
    "com.unity.modules.imageconversion": "1.0.0",
    "com.unity.modules.imgui": "1.0.0",
    "com.unity.modules.jsonserialize": "1.0.0",
    "com.unity.modules.particlesystem": "1.0.0",
    "com.unity.modules.physics": "1.0.0",
    "com.unity.modules.physics2d": "1.0.0",
    "com.unity.modules.screencapture": "1.0.0",
    "com.unity.modules.terrain": "1.0.0",
    "com.unity.modules.terrainphysics": "1.0.0",
    "com.unity.modules.tilemap": "1.0.0",
    "com.unity.modules.ui": "1.0.0",
    "com.unity.modules.uielements": "1.0.0",
    "com.unity.modules.umbra": "1.0.0",
    "com.unity.modules.unityanalytics": "1.0.0",
    "com.unity.modules.unitywebrequest": "1.0.0",
    "com.unity.modules.unitywebrequestassetbundle": "1.0.0",
    "com.unity.modules.unitywebrequestaudio": "1.0.0",
    "com.unity.modules.unitywebrequesttexture": "1.0.0",
    "com.unity.modules.unitywebrequestwww": "1.0.0",
    "com.unity.modules.vehicles": "1.0.0",
    "com.unity.modules.video": "1.0.0",
    "com.unity.modules.vr": "1.0.0",
    "com.unity.modules.wind": "1.0.0",
    "com.unity.modules.xr": "1.0.0"
  };

  // Add render pipeline specific packages
  if (config.renderPipeline === 'URP') {
    packages["com.unity.render-pipelines.universal"] = "14.0.8";
  } else if (config.renderPipeline === 'HDRP') {
    packages["com.unity.render-pipelines.high-definition"] = "14.0.8";
  }

  return JSON.stringify({
    dependencies: packages,
    scopedRegistries: []
  }, null, 2);
}

function generateUnityMainScene(config: any) {
  return `%YAML 1.1
%TAG !u! tag:unity3d.com,2011:
--- !u!29 &1
OcclusionCullingSettings:
  m_ObjectHideFlags: 0
  serializedVersion: 2
  m_OcclusionBakeSettings:
    smallestOccluder: 5
    smallestHole: 0.25
    backfaceThreshold: 100
  m_SceneGUID: 00000000000000000000000000000000
  m_OcclusionCullingData: {fileID: 0}
--- !u!104 &2
RenderSettings:
  m_ObjectHideFlags: 0
  serializedVersion: 9
  m_Fog: 0
  m_FogColor: {r: 0.5, g: 0.5, b: 0.5, a: 1}
  m_FogMode: 3
  m_FogDensity: 0.01
  m_LinearFogStart: 0
  m_LinearFogEnd: 300
  m_AmbientSkyColor: {r: 0.212, g: 0.227, b: 0.259, a: 1}
  m_AmbientEquatorColor: {r: 0.114, g: 0.125, b: 0.133, a: 1}
  m_AmbientGroundColor: {r: 0.047, g: 0.043, b: 0.035, a: 1}
  m_AmbientIntensity: 1
  m_AmbientMode: 0
  m_SubtractiveShadowColor: {r: 0.42, g: 0.478, b: 0.627, a: 1}
  m_SkyboxMaterial: {fileID: 10304, guid: 0000000000000000f000000000000000, type: 0}
  m_HaloStrength: 0.5
  m_FlareStrength: 1
  m_FlareFadeSpeed: 3
  m_HaloTexture: {fileID: 0}
  m_SpotCookie: {fileID: 10001, guid: 0000000000000000e000000000000000, type: 0}
  m_DefaultReflectionMode: 0
  m_DefaultReflectionResolution: 128
  m_ReflectionBounces: 1
  m_ReflectionIntensity: 1
  m_CustomReflection: {fileID: 0}
  m_Sun: {fileID: 0}
  m_IndirectSpecularColor: {r: 0.18028352, g: 0.22571376, b: 0.30692244, a: 1}
  m_UseRadianceAmbientProbe: 0
--- !u!157 &3
LightmapSettings:
  m_ObjectHideFlags: 0
  serializedVersion: 12
  m_GIWorkflowMode: 1`;
}

async function generateUnrealProject(projectPath: string, config: any) {
  // Generate basic Unreal project structure
  const directories = [
    'Content',
    'Source',
    'Config',
    'Binaries',
    'Intermediate'
  ];

  for (const dir of directories) {
    await fs.mkdir(path.join(projectPath, dir), { recursive: true });
  }

  // Generate basic .uproject file
  const uprojectContent = {
    FileVersion: 3,
    EngineAssociation: config.engineVersion,
    Category: "",
    Description: config.description || "",
    Modules: config.blueprintOnly ? [] : [
      {
        Name: config.name,
        Type: "Runtime",
        LoadingPhase: "Default"
      }
    ],
    Plugins: [
      {
        Name: "ModelingToolsEditorMode",
        Enabled: true
      }
    ],
    TargetPlatforms: config.targetPlatforms
  };

  await fs.writeFile(
    path.join(projectPath, `${config.name}.uproject`),
    JSON.stringify(uprojectContent, null, 2)
  );

  return {
    generatedFiles: [`${config.name}.uproject`],
    directories
  };
}

async function queueLocalBuild(buildId: string, project: any, platforms: string[], buildSettings: any) {
  // Queue local build process
  // This would integrate with Unity Cloud Build or local build system
  console.log(`Queuing local build for project ${project.name} on platforms: ${platforms.join(', ')}`);
  
  // Update build status to building
  await prisma.gameBuild.update({
    where: { id: buildId },
    data: { status: 'building' }
  });

  // Simulate build process (in real implementation, this would be actual build commands)
  setTimeout(async () => {
    try {
      // Simulate build completion
      await prisma.gameBuild.update({
        where: { id: buildId },
        data: { 
          status: 'success',
          completedAt: new Date(),
          buildLog: `Build completed successfully for platforms: ${platforms.join(', ')}`
        }
      });
    } catch (error) {
      await prisma.gameBuild.update({
        where: { id: buildId },
        data: { 
          status: 'failed',
          completedAt: new Date(),
          buildLog: `Build failed: ${error.message}`
        }
      });
    }
  }, 30000); // 30 seconds for demo
}

async function queueCloudBuild(buildId: string, project: any, platforms: string[], buildSettings: any) {
  // Queue cloud build process
  console.log(`Queuing cloud build for project ${project.name}`);
  
  // This would integrate with Unity Cloud Build API or similar service
  await prisma.gameBuild.update({
    where: { id: buildId },
    data: { status: 'building' }
  });
}

async function generateUnrealCppScript(config: any) {
  const { 
    scriptName, 
    scriptType, 
    baseClass, 
    functionality, 
    includeComments, 
    useUE5Features, 
    projectName,
    engineVersion,
    renderingFeatures 
  } = config;

  const actualBaseClass = baseClass || getDefaultUnrealBaseClass(scriptType);
  const classPrefix = getUnrealClassPrefix(scriptType);
  const fullClassName = scriptName.startsWith(classPrefix) ? scriptName : `${classPrefix}${scriptName}`;

  // Generate Header File
  let header = '';
  if (includeComments) {
    header += `/**\n * ${functionality}\n * Generated by Recoder.xyz for Unreal Engine ${engineVersion}\n */\n\n`;
  }

  header += `#pragma once\n\n`;
  header += `#include "CoreMinimal.h"\n`;
  
  // Add specific includes based on script type
  switch (scriptType) {
    case 'Actor':
      header += `#include "Engine/Engine.h"\n#include "GameFramework/Actor.h"\n`;
      break;
    case 'ActorComponent':
      header += `#include "Components/ActorComponent.h"\n`;
      break;
    case 'Character':
      header += `#include "GameFramework/Character.h"\n`;
      break;
    case 'PlayerController':
      header += `#include "GameFramework/PlayerController.h"\n`;
      if (useUE5Features) {
        header += `#include "InputActionValue.h"\n#include "EnhancedInputComponent.h"\n`;
      }
      break;
    case 'GameMode':
      header += `#include "GameFramework/GameModeBase.h"\n`;
      break;
    case 'Widget':
      header += `#include "Blueprint/UserWidget.h"\n#include "Components/Button.h"\n#include "Components/TextBlock.h"\n`;
      break;
    case 'Subsystem':
      header += `#include "Subsystems/GameInstanceSubsystem.h"\n`;
      break;
  }

  if (useUE5Features && renderingFeatures.lumen) {
    header += `#include "Components/LightComponent.h"\n`;
  }

  header += `#include "${fullClassName}.generated.h"\n\n`;

  // Class declaration
  if (includeComments) {
    header += `/**\n * ${functionality}\n */\n`;
  }

  header += `UCLASS(BlueprintType, Blueprintable)\nclass ${projectName.toUpperCase()}_API ${fullClassName} : public ${actualBaseClass}\n{\n`;
  header += `    GENERATED_BODY()\n\n`;
  header += `public:\n`;
  header += `    ${fullClassName}();\n\n`;

  // Add common virtual functions based on type
  switch (scriptType) {
    case 'Actor':
    case 'Character':
      header += `protected:\n`;
      header += `    virtual void BeginPlay() override;\n\n`;
      header += `public:\n`;
      header += `    virtual void Tick(float DeltaTime) override;\n\n`;
      break;
    case 'ActorComponent':
      header += `protected:\n`;
      header += `    virtual void BeginPlay() override;\n\n`;
      header += `public:\n`;
      header += `    virtual void TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction) override;\n\n`;
      break;
    case 'PlayerController':
      header += `protected:\n`;
      header += `    virtual void BeginPlay() override;\n`;
      if (useUE5Features) {
        header += `    virtual void SetupInputComponent() override;\n\n`;
        header += `public:\n`;
        header += `    UFUNCTION(BlueprintCallable)\n`;
        header += `    void HandleInput(const FInputActionValue& Value);\n\n`;
      }
      break;
    case 'Widget':
      header += `protected:\n`;
      header += `    virtual void NativeConstruct() override;\n\n`;
      header += `public:\n`;
      header += `    UFUNCTION(BlueprintCallable)\n`;
      header += `    void OnButtonClicked();\n\n`;
      break;
  }

  // Add functionality-based properties and methods
  header += `    // Custom functionality\n`;
  header += `    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Settings")\n`;
  header += `    bool bIsEnabled = true;\n\n`;
  header += `    UFUNCTION(BlueprintCallable, Category = "Custom")\n`;
  header += `    void ExecuteCustomLogic();\n\n`;

  header += `};\n`;

  // Generate CPP File
  let cpp = '';
  if (includeComments) {
    cpp += `/**\n * ${functionality}\n * Implementation for ${fullClassName}\n * Generated by Recoder.xyz\n */\n\n`;
  }

  cpp += `#include "${fullClassName}.h"\n`;

  if (useUE5Features && scriptType === 'PlayerController') {
    cpp += `#include "EnhancedInputSubsystems.h"\n`;
  }

  cpp += `\n${fullClassName}::${fullClassName}()\n{\n`;
  
  // Constructor implementation based on type
  switch (scriptType) {
    case 'Actor':
    case 'Character':
      cpp += `    PrimaryActorTick.bCanEverTick = true;\n`;
      break;
    case 'ActorComponent':
      cpp += `    PrimaryComponentTick.bCanEverTick = true;\n`;
      break;
  }

  if (includeComments) {
    cpp += `    // Initialize component with default values\n`;
  }
  
  cpp += `}\n\n`;

  // Implementation of virtual functions
  if (['Actor', 'Character', 'ActorComponent', 'PlayerController', 'Widget'].includes(scriptType)) {
    cpp += `void ${fullClassName}::BeginPlay()\n{\n`;
    cpp += `    Super::BeginPlay();\n\n`;
    if (includeComments) {
      cpp += `    // Custom initialization logic\n`;
    }
    cpp += `    ExecuteCustomLogic();\n`;
    cpp += `}\n\n`;
  }

  if (['Actor', 'Character'].includes(scriptType)) {
    cpp += `void ${fullClassName}::Tick(float DeltaTime)\n{\n`;
    cpp += `    Super::Tick(DeltaTime);\n\n`;
    if (includeComments) {
      cpp += `    // Custom tick logic\n`;
    }
    cpp += `}\n\n`;
  }

  if (scriptType === 'ActorComponent') {
    cpp += `void ${fullClassName}::TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction)\n{\n`;
    cpp += `    Super::TickComponent(DeltaTime, TickType, ThisTickFunction);\n\n`;
    if (includeComments) {
      cpp += `    // Custom component tick logic\n`;
    }
    cpp += `}\n\n`;
  }

  // Custom logic implementation
  cpp += `void ${fullClassName}::ExecuteCustomLogic()\n{\n`;
  cpp += `    if (!bIsEnabled)\n    {\n        return;\n    }\n\n`;
  if (includeComments) {
    cpp += `    // TODO: Implement custom logic based on requirements:\n    // ${functionality.replace(/\n/g, '\\n    // ')}\n\n`;
  }
  
  if (useUE5Features && renderingFeatures.lumen) {
    cpp += `    // Example UE5 Lumen integration\n`;
    cpp += `    UE_LOG(LogTemp, Warning, TEXT("Executing custom logic with UE5 features"));\n`;
  } else {
    cpp += `    UE_LOG(LogTemp, Warning, TEXT("Executing custom logic for %s"), *GetName());\n`;
  }
  
  cpp += `}\n`;

  return {
    header,
    cpp
  };
}

function getDefaultUnrealBaseClass(scriptType: string): string {
  const baseClasses: Record<string, string> = {
    'Actor': 'AActor',
    'ActorComponent': 'UActorComponent',
    'Pawn': 'APawn',
    'Character': 'ACharacter',
    'PlayerController': 'APlayerController',
    'GameMode': 'AGameModeBase',
    'Widget': 'UUserWidget',
    'Object': 'UObject',
    'Interface': 'UInterface',
    'Subsystem': 'UGameInstanceSubsystem'
  };
  return baseClasses[scriptType] || 'UObject';
}

function getUnrealClassPrefix(scriptType: string): string {
  const prefixes: Record<string, string> = {
    'Actor': 'A',
    'ActorComponent': 'U',
    'Pawn': 'A',
    'Character': 'A',
    'PlayerController': 'A',
    'GameMode': 'A',
    'Widget': 'U',
    'Object': 'U',
    'Interface': 'U',
    'Subsystem': 'U'
  };
  return prefixes[scriptType] || 'U';
}

async function generateUnrealBlueprintScript(config: any) {
  const { scriptName, scriptType, functionality, includeComments, projectName } = config;

  // Generate Blueprint metadata (simplified JSON representation)
  const blueprint = {
    Type: "Blueprint",
    Name: `BP_${scriptName}`,
    ParentClass: getDefaultUnrealBaseClass(scriptType),
    Description: includeComments ? functionality : "",
    Components: [
      {
        Name: "DefaultSceneRoot",
        Type: "USceneComponent",
        Transform: {
          Translation: { X: 0, Y: 0, Z: 0 },
          Rotation: { X: 0, Y: 0, Z: 0 },
          Scale: { X: 1, Y: 1, Z: 1 }
        }
      }
    ],
    Variables: [
      {
        Name: "bIsEnabled",
        Type: "bool",
        DefaultValue: true,
        Category: "Settings",
        IsEditAnywhere: true,
        IsBlueprintReadWrite: true
      }
    ],
    Functions: [
      {
        Name: "ExecuteCustomLogic",
        Category: "Custom",
        IsBlueprintCallable: true,
        Description: includeComments ? `Custom function: ${functionality}` : "",
        Nodes: [
          {
            Type: "Branch",
            InputPin: "bIsEnabled",
            TrueExecution: [
              {
                Type: "PrintString",
                String: `Executing custom logic for ${scriptName}`,
                Color: "White"
              }
            ]
          }
        ]
      }
    ],
    Events: scriptType === 'Actor' ? [
      {
        Name: "BeginPlay",
        Nodes: [
          {
            Type: "CallFunction",
            Function: "ExecuteCustomLogic"
          }
        ]
      }
    ] : []
  };

  return JSON.stringify(blueprint, null, 2);
}

export default router;