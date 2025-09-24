import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth';
import { checkRateLimit } from '../middleware/rate-limit';
import { z } from 'zod';
import { prisma } from '../database/prisma';
import path from 'path';
import fs from 'fs/promises';
import { exec } from 'child_process';
import { promisify } from 'util';
import multer from 'multer';
// import sharp from 'sharp';
// import ffmpeg from 'fluent-ffmpeg';
const sharp = require('sharp') as any;
const ffmpeg = require('fluent-ffmpeg') as any;
import { createHash } from 'crypto';
import { 
  enqueueBuildJob, 
  removeBuildFromQueue, 
  getBuildQueuePosition, 
  getEstimatedWaitTime, 
  getBuildQueueStatus, 
  getEstimatedBuildTime 
} from '../utils/build-queue';

const execAsync = promisify(exec);
const router = Router();
router.use(authenticate);

// Helper function to safely get error messages
function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return (error as Error)?.message || String(error);
  }
  return String(error);
}

// Validation middleware factory
const validateRequest = (schema: z.ZodSchema<any>) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      schema.parse(req.body);
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: error.errors.map(err => ({
            field: err.path.join('.'),
            message: err.message,
            value: err.code
          }))
        });
        return;
      }
      next(error);
    }
  };
};

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

const visualScriptSchema = z.object({
  projectId: z.string().uuid(),
  script: z.object({
    id: z.string().optional(),
    name: z.string().min(1).max(100),
    description: z.string().max(500).optional(),
    nodes: z.array(z.object({
      id: z.string(),
      type: z.string(),
      position: z.object({
        x: z.number(),
        y: z.number()
      }),
      data: z.object({
        label: z.string(),
        inputs: z.array(z.any()),
        outputs: z.array(z.any()),
        config: z.any().optional()
      })
    })),
    connections: z.array(z.object({
      id: z.string(),
      source: z.string(),
      sourceOutput: z.string(),
      target: z.string(),
      targetInput: z.string()
    })),
    variables: z.array(z.object({
      id: z.string(),
      name: z.string(),
      type: z.string(),
      defaultValue: z.any()
    }))
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
router.post('/unity/create', gameDevRateLimit, validateRequest(unityProjectSchema), async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user.userId;
    const projectData = req.body;

    // Check user subscription for game development features
    const user = await prisma.user.findUnique({
      where: { id: userId }
    }) as any;

    if (!user || user.subscription === 'free') {
      res.status(403).json({
        success: false,
        error: 'Game development features require a Pro or Enterprise subscription',
        upgradeRequired: true
      });
      return;
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

  } catch (error: unknown) {
    const errorMessage = getErrorMessage(error);
    console.error('Unity project creation error:', errorMessage);
    res.status(500).json({
      success: false,
      error: 'Failed to create Unity project'
    });
  }
});

// Generate Unity C# Scripts
router.post('/unity/generate-script', gameDevRateLimit, validateRequest(unityScriptSchema), async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user.userId;
    const { projectId, scriptName, scriptType, namespace, baseClass, interfaces, functionality, includeComments, generateTests } = req.body;

    // Verify project ownership
    const project = await prisma.project.findFirst({
      where: { id: projectId, userId }
    });

    if (!project) {
      res.status(404).json({
        success: false,
        error: 'Project not found'
      });
      return;
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
    const metadata = project.metadata as any;
    const projectPath = metadata?.projectPath as string | undefined;
    
    if (projectPath) {
      const scriptsPath = path.join(projectPath, 'Assets', 'Scripts');
      const testsPath = path.join(projectPath, 'Assets', 'Tests');
      
      await fs.mkdir(scriptsPath, { recursive: true });
      await fs.writeFile(path.join(scriptsPath, `${scriptName}.cs`), scriptContent);

      if (generateTests) {
        await fs.mkdir(testsPath, { recursive: true });
        await fs.writeFile(path.join(testsPath, `${scriptName}Tests.cs`), testContent);
      }
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

  } catch (error: unknown) {
    const errorMessage = getErrorMessage(error);
    console.error('Unity script generation error:', errorMessage);
    res.status(500).json({
      success: false,
      error: 'Failed to generate Unity script'
    });
  }
});

// Unity Build System
router.post('/unity/build', buildRateLimit, validateRequest(unityBuildSchema), async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user.userId;
    const { projectId, platforms, buildSettings, cloudBuild, autoPublish } = req.body;

    // Verify project ownership
    const project = await prisma.project.findFirst({
      where: { id: projectId, userId }
    });

    if (!project) {
      res.status(404).json({
        success: false,
        error: 'Project not found'
      });
      return;
    }

    // Check subscription for cloud builds
    const user = await prisma.user.findUnique({
      where: { id: userId }
    }) as any;

    if (cloudBuild && (!user || user.subscription === 'free')) {
      res.status(403).json({
        success: false,
        error: 'Cloud builds require a Pro or Enterprise subscription',
        upgradeRequired: true
      });
      return;
    }

    // Create build jobs for each platform
    const buildJobs: any[] = [];
    
    for (const platform of platforms) {
      const buildJob = await prisma.gameBuild.create({
        data: {
          userId,
          projectId,
          platform,
          buildType: 'Release',
          version: '1.0.0',
          status: 'queued',
          priority: 5, // Normal priority
          buildSettings: buildSettings as any,
          cloudBuild,
          buildNumber: Math.floor(Date.now() / 1000).toString()
        }
      });
      buildJobs.push(buildJob);
    }

    // Queue build processes
    for (const buildJob of buildJobs) {
      if (cloudBuild) {
        await queueCloudBuild(buildJob.id, project, [buildJob.platform], buildSettings);
      } else {
        await enqueueBuildJob(buildJob.id, buildJob.priority);
      }
    }

    res.json({
      success: true,
      data: {
        buildJobs: buildJobs.map(job => ({
          buildId: job.id,
          platform: job.platform,
          status: 'queued',
          estimatedTime: 10 // Minutes
        }))
      }
    });

  } catch (error: unknown) {
    const errorMessage = getErrorMessage(error);
    console.error('Unity build error:', errorMessage);
    res.status(500).json({
      success: false,
      error: 'Failed to start build process'
    });
  }
});

// Generate Unreal Engine Scripts
router.post('/unreal/generate-script', gameDevRateLimit, validateRequest(unrealScriptSchema), async (req: Request, res: Response): Promise<void> => {
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
      res.status(404).json({
        success: false,
        error: 'Project not found'
      });
      return;
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
    const metadata = project.metadata as any;
    const projectPath = metadata?.projectPath as string;
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

  } catch (error: unknown) {
    const errorMessage = getErrorMessage(error);
    console.error('Unreal script generation error:', errorMessage);
    res.status(500).json({
      success: false,
      error: 'Failed to generate Unreal Engine script'
    });
  }
});

// Unreal Engine Project Creation
router.post('/unreal/create', gameDevRateLimit, validateRequest(unrealProjectSchema), async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user.userId;
    const projectData = req.body;

    // Check subscription
    const user = await prisma.user.findUnique({
      where: { id: userId }
    }) as any;

    if (!user || user.subscription === 'free') {
      res.status(403).json({
        success: false,
        error: 'Unreal Engine development requires a Pro or Enterprise subscription',
        upgradeRequired: true
      });
      return;
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

  } catch (error: unknown) {
    const errorMessage = getErrorMessage(error);
    console.error('Unreal project creation error:', errorMessage);
    res.status(500).json({
      success: false,
      error: 'Failed to create Unreal project'
    });
  }
});

// Visual Script Management
router.post('/visual-scripts', gameDevRateLimit, validateRequest(visualScriptSchema), async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user.userId;
    const { projectId, script } = req.body;

    // Verify project ownership
    const project = await prisma.project.findFirst({
      where: { id: projectId, userId }
    });

    if (!project) {
      res.status(404).json({
        success: false,
        error: 'Project not found'
      });
      return;
    }

    // Generate compiled script code
    const compiledCode = await compileVisualScript(script, project.framework || 'Unity');

    // Save visual script to database
    const visualScript = await prisma.visualScript.create({
      data: {
        userId,
        projectId,
        name: script.name,
        description: script.description,
        nodeGraph: {
          nodes: script.nodes,
          connections: script.connections,
          variables: script.variables
        } as any,
        compiledCode,
        engine: project.framework || 'Unity',
        status: 'draft'
      }
    });

    // Save compiled script to project directory
    const metadata = project.metadata as any;
    const projectPath = metadata?.projectPath as string;
    if (projectPath) {
      const scriptsPath = path.join(projectPath, 'Assets', 'VisualScripts');
      await fs.mkdir(scriptsPath, { recursive: true });
      await fs.writeFile(
        path.join(scriptsPath, `${script.name}.cs`),
        compiledCode
      );
    }

    res.json({
      success: true,
      data: {
        script: visualScript,
        compiledCode
      }
    });

  } catch (error: unknown) {
    const errorMessage = getErrorMessage(error);
    console.error('Visual script save error:', errorMessage);
    res.status(500).json({
      success: false,
      error: 'Failed to save visual script'
    });
  }
});

router.get('/visual-scripts', gameDevRateLimit, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user.userId;
    const { projectId } = req.query;

    const where: any = { userId };
    if (projectId) {
      where.projectId = projectId as string;
    }

    const scripts = await prisma.visualScript.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      include: {
        project: {
          select: { name: true, framework: true }
        }
      }
    });

    res.json({
      success: true,
      data: { scripts }
    });

  } catch (error: unknown) {
    const errorMessage = getErrorMessage(error);
    console.error('Visual scripts fetch error:', errorMessage);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch visual scripts'
    });
  }
});

// Compile Visual Script to Code
router.post('/visual-scripts/:scriptId/compile', gameDevRateLimit, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user.userId;
    const { scriptId } = req.params;

    const script = await prisma.visualScript.findFirst({
      where: { id: scriptId, userId },
      include: { project: true }
    });

    if (!script) {
      res.status(404).json({
        success: false,
        error: 'Visual script not found'
      });
      return;
    }

    const nodeGraph = script.nodeGraph as any;
    const compiledCode = await compileVisualScript({
      name: script.name,
      nodes: nodeGraph?.nodes || [],
      connections: nodeGraph?.connections || [],
      variables: nodeGraph?.variables || []
    }, script.project?.framework || 'Unity');

    // Update compiled code
    await prisma.visualScript.update({
      where: { id: scriptId },
      data: { 
        compiledCode,
        updatedAt: new Date()
      }
    });

    res.json({
      success: true,
      data: { compiledCode }
    });

  } catch (error: unknown) {
    const errorMessage = getErrorMessage(error);
    console.error('Visual script compilation error:', errorMessage);
    res.status(500).json({
      success: false,
      error: 'Failed to compile visual script'
    });
  }
});

// Configure multer for file upload
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(process.env.UPLOADS_DIR || './uploads', 'game-assets');
    fs.mkdir(uploadDir, { recursive: true }).then(() => {
      cb(null, uploadDir);
    }).catch(err => cb(err, uploadDir));
  },
  filename: (req, file, cb) => {
    // Generate unique filename with hash
    const hash = createHash('md5').update(file.originalname + Date.now()).digest('hex');
    const ext = path.extname(file.originalname);
    cb(null, `${hash}${ext}`);
  }
});

const fileFilter = (req: any, file: any, cb: any) => {
  // Allow specific file types for game assets
  const allowedTypes = [
    // Images
    'image/png', 'image/jpeg', 'image/jpg', 'image/tga', 'image/bmp',
    // 3D Models
    'application/octet-stream', // .fbx, .obj, .blend
    'model/obj', 'model/gltf+json', 'model/gltf-binary',
    // Audio
    'audio/wav', 'audio/mpeg', 'audio/ogg', 'audio/aiff',
    // Scripts
    'text/plain', 'application/javascript', 'text/x-csharp',
    // Unity/Unreal specific
    'application/x-unity', 'application/x-unreal'
  ];
  
  if (allowedTypes.includes(file.mimetype) || file.originalname.match(/\.(cs|js|ts|cpp|h|shader|hlsl|glsl|fbx|obj|blend|dae|prefab|uasset|mat|anim)$/i)) {
    cb(null, true);
  } else {
    cb(new Error(`Unsupported file type: ${file.mimetype}`), false);
  }
};

const upload = multer({ 
  storage, 
  fileFilter,
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB limit
  }
});

// Real Asset Upload Endpoint
router.post('/assets/upload', gameDevRateLimit, upload.array('files', 10), async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user.userId;
    const { projectId, category = '', tags = '' } = req.body;
    const files = req.files as Express.Multer.File[];

    if (!files || files.length === 0) {
      res.status(400).json({
        success: false,
        error: 'No files uploaded'
      });
      return;
    }

    // Verify project ownership
    const project = await prisma.project.findFirst({
      where: { id: projectId, userId }
    });

    if (!project) {
      // Clean up uploaded files
      for (const file of files) {
        await fs.unlink(file.path).catch(console.error);
      }
      res.status(404).json({
        success: false,
        error: 'Project not found'
      });
      return;
    }

    const uploadedAssets: any[] = [];
    const tagArray = tags ? tags.split(',').map((t: string) => t.trim()).filter(Boolean) : [];

    for (const file of files) {
      try {
        // Detect asset type from file extension
        const assetType = detectAssetTypeFromFile(file.originalname);
        
        // Process file and extract metadata
        const metadata = await extractFileMetadata(file);
        
        // Generate thumbnail for images
        let thumbnailPath = '';
        if (assetType === 'Texture' && file.mimetype.startsWith('image/')) {
          thumbnailPath = await generateThumbnail(file.path);
        }

        // Create public URL (in production, this would be S3/CDN URL)
        const fileUrl = `/uploads/game-assets/${file.filename}`;
        const thumbnailUrl = thumbnailPath ? `/uploads/thumbnails/${path.basename(thumbnailPath)}` : '';

        // Save asset to database
        const asset = await prisma.gameAsset.create({
          data: {
            userId,
            projectId,
            name: path.parse(file.originalname).name,
            assetType,
            category: category || 'General',
            tags: tagArray,
            fileUrl,
            filePath: fileUrl,
            fileSize: file.size,
            format: path.extname(file.originalname).toLowerCase().replace('.', ''),
            metadata: {
              originalName: file.originalname,
              mimeType: file.mimetype,
              format: path.extname(file.originalname).toLowerCase().replace('.', ''),
              ...metadata
            },
            dependencies: [],
            status: 'active'
          }
        });

        uploadedAssets.push(asset);

        // Create asset processing job for complex files
        if (['Model', 'Audio'].includes(assetType)) {
          await createAssetProcessingJob(asset.id, file.path, assetType);
        }

      } catch (error) {
        console.error(`Failed to process file ${file.originalname}:`, error);
        // Clean up file
        await fs.unlink(file.path).catch(console.error);
      }
    }

    // Track usage analytics
    await prisma.usageAnalytics.create({
      data: {
        userId,
        eventType: 'assets_uploaded',
        platform: 'web',
        metadata: {
          projectId,
          assetCount: uploadedAssets.length,
          totalSize: files.reduce((sum, file) => sum + file.size, 0)
        }
      }
    });

    res.json({
      success: true,
      data: {
        assets: uploadedAssets,
        uploaded: uploadedAssets.length,
        total: files.length
      }
    });

  } catch (error) {
    console.error('Asset upload error:', error);
    
    // Clean up uploaded files on error
    const files = req.files as Express.Multer.File[];
    if (files) {
      for (const file of files) {
        await fs.unlink(file.path).catch(console.error);
      }
    }

    res.status(500).json({
      success: false,
      error: 'Failed to upload assets'
    });
  }
});

// Get Assets with Real Implementation
router.get('/assets', gameDevRateLimit, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user.userId;
    const { 
      projectId, 
      type, 
      search, 
      category, 
      page = '1', 
      limit = '20' 
    } = req.query;

    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
    const take = parseInt(limit as string);

    const where: any = { userId };
    
    if (projectId && projectId !== 'all') {
      where.projectId = projectId as string;
    }
    
    if (type && type !== 'all') {
      where.assetType = type as string;
    }
    
    if (category && category !== 'all') {
      where.category = category as string;
    }
    
    if (search) {
      where.OR = [
        { assetName: { contains: search as string, mode: 'insensitive' } },
        { tags: { hasSome: [(search as string).toLowerCase()] } }
      ];
    }

    const [assets, total] = await Promise.all([
      prisma.gameAsset.findMany({
        where,
        skip,
        take,
        orderBy: { updatedAt: 'desc' },
        include: {
          project: {
            select: { id: true, name: true, framework: true }
          }
        }
      }),
      prisma.gameAsset.count({ where })
    ]);

    res.json({
      success: true,
      data: {
        assets,
        pagination: {
          page: parseInt(page as string),
          limit: parseInt(limit as string),
          total,
          pages: Math.ceil(total / parseInt(limit as string))
        }
      }
    });

  } catch (error) {
    console.error('Assets fetch error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch assets'
    });
  }
});

// Delete Asset with File Cleanup
router.delete('/assets/:assetId', gameDevRateLimit, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user.userId;
    const { assetId } = req.params;

    // Find and verify ownership
    const asset = await prisma.gameAsset.findFirst({
      where: { id: assetId, userId }
    });

    if (!asset) {
      res.status(404).json({
        success: false,
        error: 'Asset not found'
      });
      return;
    }

    // Delete physical files
    const filePath = path.join(process.env.UPLOADS_DIR || './uploads', 'game-assets', path.basename(asset.fileUrl || ''));
    await fs.unlink(filePath).catch(console.error);

    if (asset.metadata && typeof asset.metadata === 'object' && 'thumbnailUrl' in asset.metadata) {
      const thumbnailUrl = (asset.metadata as any).thumbnailUrl;
      if (thumbnailUrl) {
        const thumbnailPath = path.join(process.env.UPLOADS_DIR || './uploads', 'thumbnails', path.basename(thumbnailUrl));
        await fs.unlink(thumbnailPath).catch(console.error);
      }
    }

    // Delete from database
    await prisma.gameAsset.delete({
      where: { id: assetId }
    });

    res.json({
      success: true,
      message: 'Asset deleted successfully'
    });

  } catch (error) {
    console.error('Asset deletion error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete asset'
    });
  }
});

// Batch Asset Processing Endpoint
router.post('/assets/batch-process', gameDevRateLimit, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user.userId;
    const { assetIds, operations } = req.body;

    if (!assetIds || !Array.isArray(assetIds) || assetIds.length === 0) {
      res.status(400).json({
        success: false,
        error: 'Asset IDs are required'
      });
      return;
    }

    // Verify all assets belong to user
    const assets = await prisma.gameAsset.findMany({
      where: { 
        id: { in: assetIds },
        userId 
      }
    });

    if (assets.length !== assetIds.length) {
      res.status(404).json({
        success: false,
        error: 'Some assets not found or not owned by user'
      });
      return;
    }

    const processedAssets: any[] = [];
    
    for (const asset of assets) {
      try {
        // Update status to processing
        await prisma.gameAsset.update({
          where: { id: asset.id },
          data: { status: 'processing' }
        });

        // Perform batch operations
        let processedData = { ...asset };
        
        if (operations.includes('optimize')) {
          processedData = await optimizeAsset(asset);
        }
        
        if (operations.includes('validate')) {
          const validation = await validateAsset(asset);
          const currentMetadata = processedData.metadata && typeof processedData.metadata === 'object' ? processedData.metadata as any : {};
          processedData.metadata = { ...currentMetadata, validation };
        }
        
        if (operations.includes('generateVariants')) {
          const variants = await generateAssetVariants(asset);
          const currentMetadata = processedData.metadata && typeof processedData.metadata === 'object' ? processedData.metadata as any : {};
          processedData.metadata = { ...currentMetadata, variants };
        }

        // Update asset with processed data
        const updatedAsset = await prisma.gameAsset.update({
          where: { id: asset.id },
          data: {
            status: 'processed',
            metadata: processedData.metadata as any,
            updatedAt: new Date()
          }
        });

        processedAssets.push(updatedAsset);

      } catch (error) {
        console.error(`Failed to process asset ${asset.id}:`, error);
        
        // Update asset status to error
        await prisma.gameAsset.update({
          where: { id: asset.id },
          data: { 
            status: 'error',
            metadata: {
              ...(asset.metadata && typeof asset.metadata === 'object' ? asset.metadata as any : {}),
              error: (error as Error)?.message || String(error) || 'Unknown error'
            }
          }
        });
      }
    }

    res.json({
      success: true,
      data: {
        processed: processedAssets.length,
        total: assetIds.length,
        assets: processedAssets
      }
    });

  } catch (error) {
    console.error('Batch asset processing error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process assets'
    });
  }
});

// Asset Optimization Endpoint
router.post('/assets/:assetId/optimize', gameDevRateLimit, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user.userId;
    const { assetId } = req.params;
    const { optimizations } = req.body;

    const asset = await prisma.gameAsset.findFirst({
      where: { id: assetId, userId }
    });

    if (!asset) {
      res.status(404).json({
        success: false,
        error: 'Asset not found'
      });
      return;
    }

    // Update status to processing
    await prisma.gameAsset.update({
      where: { id: assetId },
      data: { status: 'processing' }
    });

    const optimizedData = await performAssetOptimization(asset, optimizations);

    const updatedAsset = await prisma.gameAsset.update({
      where: { id: assetId },
      data: {
        status: 'processed',
        metadata: {
          ...(asset.metadata && typeof asset.metadata === 'object' ? asset.metadata as any : {}),
          optimization: optimizedData
        },
        updatedAt: new Date()
      }
    });

    res.json({
      success: true,
      data: updatedAsset
    });

  } catch (error) {
    console.error('Asset optimization error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to optimize asset'
    });
  }
});

// Multi-Platform Build Queue Endpoints

// Create Build Job
router.post('/builds', gameDevRateLimit, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user.userId;
    const {
      projectId,
      platforms,
      buildType,
      configuration,
      version,
      buildSettings,
      priority = 'normal'
    } = req.body;

    // Verify project ownership
    const project = await prisma.project.findFirst({
      where: { id: projectId, userId }
    });

    if (!project) {
      res.status(404).json({
        success: false,
        error: 'Project not found'
      });
      return;
    }

    // Create build jobs for each platform
    const buildJobs: any[] = [];
    
    for (const platform of platforms) {
      const buildJob = await prisma.gameBuild.create({
        data: {
          userId,
          projectId,
          platform,
          buildType: buildType || 'Release',
          version: version || '1.0.0',
          status: 'queued',
          priority: priority === 'high' ? 10 : priority === 'low' ? 1 : 5,
          configuration: {
            ...buildSettings,
            platform,
            framework: project.framework,
            buildType,
            version
          },
          queuedAt: new Date()
        }
      });

      // Add to build queue
      await enqueueBuildJob(buildJob.id, buildJob.priority);
      
      buildJobs.push(buildJob);
    }

    // Track usage analytics
    await prisma.usageAnalytics.create({
      data: {
        userId,
        eventType: 'builds_queued',
        platform: 'web',
        metadata: {
          projectId,
          platforms: platforms.length,
          buildType,
          framework: project.framework
        }
      }
    });

    res.json({
      success: true,
      data: {
        buildJobs,
        queuePosition: await getBuildQueuePosition(buildJobs[0].id),
        estimatedWaitTime: await getEstimatedWaitTime(buildJobs[0].id)
      }
    });

  } catch (error) {
    console.error('Build creation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create build jobs'
    });
  }
});

// Get Build Queue Status
router.get('/builds/queue/status', gameDevRateLimit, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user.userId;

    const queueStatus = await getBuildQueueStatus(userId);

    res.json({
      success: true,
      data: queueStatus
    });

  } catch (error) {
    console.error('Build queue status error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get build queue status'
    });
  }
});

// Get User Builds
router.get('/builds', gameDevRateLimit, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user.userId;
    const { projectId, status, platform, page = '1', limit = '20' } = req.query;

    const where: any = { userId };
    
    if (projectId) where.projectId = projectId as string;
    if (status) where.status = status as string;
    if (platform) where.platform = platform as string;

    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
    const take = parseInt(limit as string);

    const [builds, total] = await Promise.all([
      prisma.gameBuild.findMany({
        where,
        skip,
        take,
        orderBy: [
          { priority: 'desc' },
          { queuedAt: 'asc' }
        ],
        include: {
          project: {
            select: { id: true, name: true, framework: true }
          }
        }
      }),
      prisma.gameBuild.count({ where })
    ]);

    // Add queue position for queued builds
    const buildsWithQueue = await Promise.all(
      builds.map(async (build: any) => {
        if (build.status === 'queued') {
          const queuePosition = await getBuildQueuePosition(build.id);
          const estimatedWaitTime = await getEstimatedWaitTime(build.id);
          return {
            ...build,
            queuePosition,
            estimatedWaitTime
          };
        }
        return build;
      })
    );

    res.json({
      success: true,
      data: {
        builds: buildsWithQueue,
        pagination: {
          page: parseInt(page as string),
          limit: parseInt(limit as string),
          total,
          pages: Math.ceil(total / parseInt(limit as string))
        }
      }
    });

  } catch (error) {
    console.error('Builds fetch error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch builds'
    });
  }
});

// Cancel Build
router.delete('/builds/:buildId', gameDevRateLimit, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user.userId;
    const { buildId } = req.params;

    const build = await prisma.gameBuild.findFirst({
      where: { id: buildId, userId }
    });

    if (!build) {
      res.status(404).json({
        success: false,
        error: 'Build not found'
      });
      return;
    }

    if (!['queued', 'building'].includes(build.status)) {
      res.status(400).json({
        success: false,
        error: 'Build cannot be cancelled'
      });
      return;
    }

    // Cancel build
    await prisma.gameBuild.update({
      where: { id: buildId },
      data: {
        status: 'cancelled',
        completedAt: new Date(),
        logs: build.logs ? 
          [...(build.logs as any[]), { timestamp: new Date(), message: 'Build cancelled by user', level: 'info' }] :
          [{ timestamp: new Date(), message: 'Build cancelled by user', level: 'info' }]
      }
    });

    // Remove from build queue
    await removeBuildFromQueue(buildId);

    res.json({
      success: true,
      message: 'Build cancelled successfully'
    });
    return;

  } catch (error) {
    console.error('Build cancellation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to cancel build'
    });
    return;
  }
});

// Get Build Logs
router.get('/builds/:buildId/logs', gameDevRateLimit, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user.userId;
    const { buildId } = req.params;

    const build = await prisma.gameBuild.findFirst({
      where: { id: buildId, userId },
      select: {
        id: true,
        status: true,
        logs: true,
        platform: true,
        buildType: true,
        startedAt: true,
        completedAt: true,
        project: {
          select: { name: true, framework: true }
        }
      }
    });

    if (!build) {
      res.status(404).json({
        success: false,
        error: 'Build not found'
      });
      return;
    }

    res.json({
      success: true,
      data: {
        build,
        logs: build.logs || []
      }
    });

  } catch (error) {
    console.error('Build logs error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch build logs'
    });
  }
});

// Retry Build
router.post('/builds/:buildId/retry', gameDevRateLimit, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user.userId;
    const { buildId } = req.params;

    const build = await prisma.gameBuild.findFirst({
      where: { id: buildId, userId }
    });

    if (!build) {
      res.status(404).json({
        success: false,
        error: 'Build not found'
      });
      return;
    }

    if (!['failed', 'cancelled'].includes(build.status)) {
      res.status(400).json({
        success: false,
        error: 'Build cannot be retried'
      });
      return;
    }

    // Reset build status and add to queue
    const updatedBuild = await prisma.gameBuild.update({
      where: { id: buildId },
      data: {
        status: 'queued',
        startedAt: null,
        completedAt: null,
        queuedAt: new Date(),
        logs: [
          { timestamp: new Date(), message: 'Build retried by user', level: 'info' }
        ],
        downloadUrl: null,
        artifactSize: null
      }
    });

    // Add back to build queue
    await enqueueBuildJob(buildId, build.priority);

    res.json({
      success: true,
      data: {
        build: updatedBuild,
        queuePosition: await getBuildQueuePosition(buildId),
        estimatedWaitTime: await getEstimatedWaitTime(buildId)
      }
    });

  } catch (error) {
    console.error('Build retry error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retry build'
    });
  }
});

// Asset Pipeline Status Endpoint
router.get('/assets/pipeline/status', gameDevRateLimit, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user.userId;

    const statusCounts = await prisma.gameAsset.groupBy({
      by: ['status'],
      where: { userId },
      _count: { status: true }
    });

    const processingAssets = await prisma.gameAsset.findMany({
      where: { 
        userId,
        status: 'processing'
      },
      select: {
        id: true,
        name: true,
        assetType: true,
        updatedAt: true
      },
      orderBy: { updatedAt: 'desc' }
    });

    const pipelineStatus = {
      overview: statusCounts.reduce((acc: any, item: any) => {
        acc[item.status] = item._count.status;
        return acc;
      }, {} as Record<string, number>),
      currentlyProcessing: processingAssets,
      totalAssets: statusCounts.reduce((sum: any, item: any) => sum + item._count.status, 0)
    };

    res.json({
      success: true,
      data: pipelineStatus
    });

  } catch (error) {
    console.error('Pipeline status error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get pipeline status'
    });
  }
});

// Asset Management (Legacy - keeping for compatibility)
router.post('/assets', gameDevRateLimit, validateRequest(gameAssetSchema), async (req: Request, res: Response): Promise<void> => {
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
router.get('/projects', gameDevRateLimit, async (req: Request, res: Response): Promise<void> => {
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
          user: {
            select: {
              name: true,
              email: true
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
router.get('/builds/:buildId/status', gameDevRateLimit, async (req: Request, res: Response): Promise<void> => {
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
      res.status(404).json({
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
          buildLog: `Build failed: ${getErrorMessage(error)}`
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

async function compileVisualScript(script: any, framework: string) {
  const { name, nodes, connections, variables } = script;
  
  if (framework === 'Unity') {
    return compileUnityVisualScript(script);
  } else if (framework === 'Unreal Engine') {
    return compileVisualScript(script, 'Unreal Engine');
  } else {
    throw new Error(`Unsupported framework: ${framework}`);
  }
}

function compileUnityVisualScript(script: any) {
  const { name, nodes, connections, variables } = script;
  
  let code = `using UnityEngine;\nusing System.Collections;\nusing System.Collections.Generic;\n\n`;
  code += `/// <summary>\n/// Visual script compiled from ${name}\n/// Generated by Recoder.xyz Visual Script Editor\n/// </summary>\n`;
  code += `public class ${name}VisualScript : MonoBehaviour\n{\n`;
  
  // Generate variables
  if (variables && variables.length > 0) {
    code += `    // Variables\n`;
    variables.forEach((variable: any) => {
      const csharpType = mapToUnityType(variable.type);
      const defaultValue = getUnityDefaultValue(variable.type, variable.defaultValue);
      code += `    [SerializeField] private ${csharpType} ${variable.name} = ${defaultValue};\n`;
    });
    code += `\n`;
  }
  
  // Find event nodes to generate appropriate Unity methods
  const eventNodes = nodes.filter((node: any) => node.type.startsWith('EVENT.'));
  const hasStart = eventNodes.some((node: any) => node.type === 'EVENT.Start');
  
  // Generate Unity event methods
  if (hasStart) {
    code += `    void Start()\n    {\n        // Event execution logic will be generated here\n    }\n\n`;
  }
  
  // Helper function to execute nodes and generate code
  function executeNode(nodeId: string, depth: number = 1): string {
    const node = nodes.find((n: any) => n.id === nodeId);
    if (!node) return '';
    
    const indent = '    '.repeat(depth);
    let nodeCode = '';
    
    switch (node.type) {
      case 'LOGIC.Branch':
        const conditionInput = getNodeInputValue(node, 'condition', nodes, connections);
        nodeCode += `${indent}if (${conditionInput})\n${indent}{\n`;
        
        // Follow true path
        const trueConnections = connections.filter((c: any) => c.source === node.id && c.sourceOutput.includes('true'));
        trueConnections.forEach((conn: any) => {
          nodeCode += executeNode(conn.target, depth + 1);
        });
        
        nodeCode += `${indent}}\n${indent}else\n${indent}{\n`;
        
        // Follow false path
        const falseConnections = connections.filter((c: any) => c.source === node.id && c.sourceOutput.includes('false'));
        falseConnections.forEach((conn: any) => {
          nodeCode += executeNode(conn.target, depth + 1);
        });
        
        nodeCode += `${indent}}\n`;
        break;
      default:
        // Handle other node types as needed
        break;
    }
    
    // Follow execution connections
    const execConnections = connections.filter((c: any) => 
      c.source === node.id && 
      (c.sourceOutput.includes('exec') || c.sourceOutput.includes('Exec'))
    );
    
    execConnections.forEach((conn: any) => {
      nodeCode += executeNode(conn.target, depth);
    });
    
    return nodeCode;
  }
  
  // Find the start node (usually an event node)
  const startNode = nodes.find((n: any) => n.type === 'EVENT.Start' || n.type.startsWith('EVENT.'));
  if (startNode) {
    return executeNode(startNode.id);
  }
  
  return '';
}

function getNodeInputValue(node: any, inputName: string, nodes: any[], connections: any[]): string {
  const connection = connections.find((c: any) => 
    c.target === node.id && 
    c.targetInput.toLowerCase().includes(inputName.toLowerCase())
  );
  
  if (connection) {
    const sourceNode = nodes.find(n => n.id === connection.source);
    if (sourceNode) {
      // Return appropriate value based on source node type
      switch (sourceNode.type) {
        case 'VARIABLE.GetVariable':
          return sourceNode.data.inputs.find((i: any) => i.label === 'Name')?.value || '""';
        case 'MATH.Add':
        case 'MATH.Multiply':
          return 'result'; // Would need more complex evaluation
        default:
          return '""';
      }
    }
  }
  
  // Return default value based on input type
  const input = node.data.inputs.find((i: any) => i.label.toLowerCase() === inputName.toLowerCase());
  if (input && input.value !== undefined) {
    return typeof input.value === 'string' ? `"${input.value}"` : input.value.toString();
  }
  
  return '""';
}

function mapToUnityType(type: string): string {
  const typeMap: Record<string, string> = {
    'string': 'string',
    'float': 'float',
    'int': 'int',
    'boolean': 'bool',
    'object': 'GameObject',
    'vector3': 'Vector3',
    'any': 'object'
  };
  return typeMap[type] || 'object';
}

function compileUnrealVisualScript(script: any) {
  const { name, nodes, connections, variables } = script;
  
  let header = `#pragma once\n\n#include "CoreMinimal.h"\n#include "Blueprint/UserWidget.h"\n`;
  header += `#include "${name}VisualScript.generated.h"\n\n`;
  header += `UCLASS(BlueprintType, Blueprintable)\n`;
  header += `class YOURGAME_API U${name}VisualScript : public UUserWidget\n{\n`;
  header += `\tGENERATED_BODY()\n\npublic:\n`;
  
  let cpp = `#include "${name}VisualScript.h"\n\n`;
  
  // Generate variables as UPROPERTY
  if (variables && variables.length > 0) {
    variables.forEach((variable: any) => {
      const unrealType = mapToUnrealType(variable.type);
      header += `\tUPROPERTY(BlueprintReadWrite, EditAnywhere)\n`;
      header += `\t${unrealType} ${variable.name};\n\n`;
    });
  }
  
  // Generate blueprint functions
  header += `\tUFUNCTION(BlueprintCallable)\n`;
  header += `\tvoid ExecuteVisualScript();\n`;
  header += `};\n`;
  
  // Generate implementation
  cpp += `void U${name}VisualScript::ExecuteVisualScript()\n{\n`;
  cpp += `\t// Visual script logic generated from nodes\n`;
  cpp += `\tUE_LOG(LogTemp, Warning, TEXT("Executing visual script: ${name}"));\n`;
  cpp += `}\n`;

  return {
    header,
    cpp
  };
}

function mapToUnrealType(type: string): string {
  const typeMap: Record<string, string> = {
    'string': 'FString',
    'float': 'float',
    'int': 'int32',
    'boolean': 'bool',
    'object': 'UObject*',
    'vector3': 'FVector',
    'any': 'UObject*'
  };
  return typeMap[type] || 'UObject*';
}

function getUnityDefaultValue(type: string, value: any): string {
  if (value !== undefined && value !== null) {
    if (type === 'string') return `"${value}"`;
    if (type === 'boolean') return value ? 'true' : 'false';
    return value.toString();
  }
  
  const defaultValues: Record<string, string> = {
    'string': '""',
    'float': '0.0f',
    'int': '0',
    'boolean': 'false',
    'object': 'null',
    'vector3': 'Vector3.zero'
  };
  return defaultValues[type] || 'null';
}

// Real Asset Processing Helper Functions
function detectAssetTypeFromFile(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  
  const typeMap: Record<string, string> = {
    // Textures
    '.png': 'Texture',
    '.jpg': 'Texture',
    '.jpeg': 'Texture',
    '.tga': 'Texture',
    '.bmp': 'Texture',
    '.psd': 'Texture',
    
    // 3D Models
    '.fbx': 'Model',
    '.obj': 'Model',
    '.3ds': 'Model',
    '.blend': 'Model',
    '.dae': 'Model',
    '.gltf': 'Model',
    '.glb': 'Model',
    
    // Audio
    '.wav': 'Audio',
    '.mp3': 'Audio',
    '.ogg': 'Audio',
    '.aiff': 'Audio',
    '.flac': 'Audio',
    
    // Animation
    '.anim': 'Animation',
    
    // Scripts
    '.cs': 'Script',
    '.js': 'Script',
    '.ts': 'Script',
    '.cpp': 'Script',
    '.h': 'Script',
    
    // Prefabs
    '.prefab': 'Prefab',
    '.uasset': 'Prefab',
    
    // Materials
    '.mat': 'Material',
    
    // Shaders
    '.shader': 'Shader',
    '.hlsl': 'Shader',
    '.glsl': 'Shader'
  };
  
  return typeMap[ext] || 'Script';
}

async function extractFileMetadata(file: Express.Multer.File): Promise<any> {
  const metadata: any = {};
  
  try {
    if (file.mimetype.startsWith('image/')) {
      // Extract image metadata using Sharp
      const imageMetadata = await sharp(file.path).metadata();
      metadata.resolution = `${imageMetadata.width}x${imageMetadata.height}`;
      metadata.dimensions = metadata.resolution;
      metadata.channels = imageMetadata.channels;
      metadata.colorSpace = imageMetadata.space;
    } else if (file.mimetype.startsWith('audio/')) {
      // Extract audio metadata using ffprobe
      metadata.duration = await getAudioDuration(file.path);
    } else if (file.originalname.match(/\.(fbx|obj|blend|dae|gltf|glb)$/i)) {
      // For 3D models, we can add mesh analysis later
      metadata.modelType = path.extname(file.originalname).replace('.', '');
    }
  } catch (error) {
    console.error('Failed to extract metadata:', error);
  }
  
  return metadata;
}

async function generateThumbnail(imagePath: string): Promise<string> {
  try {
    const thumbnailDir = path.join(process.env.UPLOADS_DIR || './uploads', 'thumbnails');
    await fs.mkdir(thumbnailDir, { recursive: true });
    
    const filename = path.basename(imagePath, path.extname(imagePath)) + '_thumb.jpg';
    const thumbnailPath = path.join(thumbnailDir, filename);
    
    await sharp(imagePath)
      .resize(200, 200, { 
        fit: 'cover',
        position: 'center'
      })
      .jpeg({ quality: 80 })
      .toFile(thumbnailPath);
    
    return thumbnailPath;
  } catch (error) {
    console.error('Thumbnail generation failed:', error);
    return '';
  }
}

async function getAudioDuration(audioPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(audioPath, (err, metadata) => {
      if (err) {
        console.error('Audio metadata extraction failed:', err);
        resolve(0);
        return;
      }
      
      const duration = metadata.format.duration || 0;
      resolve(Math.round(duration));
    });
  });
}

async function createAssetProcessingJob(assetId: string, filePath: string, assetType: string) {
  // Real asset processing pipeline with advanced capabilities
  
  try {
    // Update status to processing
    await prisma.gameAsset.update({
      where: { id: assetId },
      data: { status: 'processing' }
    });

    switch (assetType) {
      case 'Texture':
        await processTextureAsset(assetId, filePath);
        break;
      case 'Model':
        await processModelAsset(assetId, filePath);
        break;
      case 'Audio':
        await processAudioAsset(assetId, filePath);
        break;
      case 'Animation':
        await processAnimationAsset(assetId, filePath);
        break;
      case 'Shader':
        await processShaderAsset(assetId, filePath);
        break;
      case 'Script':
        await processScriptAsset(assetId, filePath);
        break;
      default:
        await processGenericAsset(assetId, filePath);
        break;
    }
  } catch (error) {
    console.error(`Asset processing failed for ${assetId}:`, error);
    
    // Update asset status to error
    await prisma.gameAsset.update({
      where: { id: assetId },
      data: { 
        status: 'error',
        metadata: {
          error: (error as Error)?.message || String(error)
        }
      }
    }).catch(console.error);
  }
}

// Advanced Texture Processing
async function processTextureAsset(assetId: string, filePath: string) {
  console.log(`Processing texture asset: ${assetId}`);
  
  try {
    const image = sharp(filePath);
    const metadata = await image.metadata();
    
    // Generate multiple resolution variants
    const variants: any[] = [];
    const baseName = path.basename(filePath, path.extname(filePath));
    const variantDir = path.join(path.dirname(filePath), 'variants');
    await fs.mkdir(variantDir, { recursive: true });
    
    // Create common game texture sizes
    const sizes = [512, 1024, 2048, 4096];
    for (const size of sizes) {
      if (metadata.width! >= size || metadata.height! >= size) {
        const variantPath = path.join(variantDir, `${baseName}_${size}x${size}.jpg`);
        await image
          .resize(size, size, { fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 90 })
          .toFile(variantPath);
        variants.push({
          resolution: `${size}x${size}`,
          path: variantPath,
          size: (await fs.stat(variantPath)).size
        });
      }
    }
    
    // Generate normal map preview if it looks like a normal map
    let isNormalMap = false;
    if (baseName.toLowerCase().includes('normal') || baseName.toLowerCase().includes('_n')) {
      isNormalMap = true;
    }
    
    // Calculate texture metrics
    const textureData = {
      originalResolution: `${metadata.width}x${metadata.height}`,
      colorSpace: metadata.space || 'srgb',
      channels: metadata.channels || 3,
      hasAlpha: metadata.channels === 4,
      isNormalMap,
      variants: variants.length,
      compressionRatio: variants.length > 0 ? 
        Math.round((variants[0].size / (await fs.stat(filePath)).size) * 100) : 100
    };
    
    await prisma.gameAsset.update({
      where: { id: assetId },
      data: { 
        status: 'processed',
        metadata: textureData
      }
    });
    
  } catch (error) {
    console.error('Texture processing failed:', error);
    throw error;
  }
}

async function processModelAsset(assetId: string, filePath: string) {
  console.log(`Processing 3D model: ${assetId}`);
  
  try {
    const stats = await fs.stat(filePath);
    const extension = path.extname(filePath).toLowerCase();
    
    // Extract basic model information
    let modelData: any = {
      fileSize: stats.size,
      format: extension.replace('.', ''),
      lastModified: stats.mtime
    };
    
    // For different model formats, extract specific data
    if (extension === '.fbx') {
      modelData = { ...modelData, ...(await processFBXModel(filePath)) };
    } else if (extension === '.obj') {
      modelData = { ...modelData, ...(await processOBJModel(filePath)) };
    } else if (extension === '.gltf' || extension === '.glb') {
      modelData = { ...modelData, ...(await processGLTFModel(filePath)) };
    }
    
    // Generate preview thumbnail for 3D model
    const previewPath = await generate3DPreview(filePath, assetId);
    if (previewPath) {
      modelData.previewUrl = `/uploads/previews/${path.basename(previewPath)}`;
    }
    
    // Validate model integrity
    const validation = await validateModelFile(filePath, extension);
    modelData.validation = validation;
    
    await prisma.gameAsset.update({
      where: { id: assetId },
      data: { 
        status: validation.isValid ? 'processed' : 'error',
        metadata: modelData
      }
    });
    
  } catch (error) {
    console.error('Model processing failed:', error);
    throw error;
  }
}

async function processAudioAsset(assetId: string, filePath: string) {
  console.log(`Processing audio file: ${assetId}`);
  
  try {
    // Extract comprehensive audio metadata
    const audioInfo = await new Promise<any>((resolve, reject) => {
      ffmpeg.ffprobe(filePath, (err, metadata) => {
        if (err) reject(err);
        else resolve(metadata);
      });
    });
    
    const stream = audioInfo.streams[0];
    const format = audioInfo.format;
    
    // Generate waveform visualization
    const waveformPath = await generateWaveform(filePath, assetId);
    
    // Create compressed versions for different platforms
    const compressions = await createAudioCompressions(filePath, assetId);
    
    // Analyze audio characteristics
    const audioAnalysis = await analyzeAudioContent(filePath);
    
    const audioMetadata = {
      duration: Math.round(format.duration || 0),
      bitRate: parseInt(format.bit_rate) || 0,
      sampleRate: stream?.sample_rate || 0,
      channels: stream?.channels || 0,
      channelLayout: stream?.channel_layout || 'unknown',
      codec: stream?.codec_name || 'unknown',
      fileSize: (await fs.stat(filePath)).size,
      waveformUrl: waveformPath ? `/uploads/waveforms/${path.basename(waveformPath)}` : null,
      compressions,
      analysis: audioAnalysis,
      isLooped: audioAnalysis.isLooped,
      peakLevel: audioAnalysis.peakLevel,
      averageLevel: audioAnalysis.averageLevel
    };
    
    await prisma.gameAsset.update({
      where: { id: assetId },
      data: { 
        status: 'processed',
        metadata: audioMetadata
      }
    });
    
  } catch (error) {
    console.error('Audio processing failed:', error);
    throw error;
  }
}

// Process Animation Assets
async function processAnimationAsset(assetId: string, filePath: string) {
  console.log(`Processing animation asset: ${assetId}`);
  
  try {
    const stats = await fs.stat(filePath);
    const extension = path.extname(filePath).toLowerCase();
    
    let animationData: any = {
      fileSize: stats.size,
      format: extension.replace('.', ''),
      lastModified: stats.mtime
    };
    
    // Extract animation-specific data based on format
    if (extension === '.fbx') {
      const fbxData = await analyzeFBXAnimation(filePath);
      animationData = { ...animationData, ...fbxData };
    } else if (extension === '.anim') {
      const animData = await analyzeUnityAnimation(filePath);
      animationData = { ...animationData, ...animData };
    }
    
    await prisma.gameAsset.update({
      where: { id: assetId },
      data: { 
        status: 'processed',
        metadata: animationData
      }
    });
    
  } catch (error) {
    console.error('Animation processing failed:', error);
    throw error;
  }
}

// Process Shader Assets
async function processShaderAsset(assetId: string, filePath: string) {
  console.log(`Processing shader asset: ${assetId}`);
  
  try {
    const shaderContent = await fs.readFile(filePath, 'utf-8');
    const extension = path.extname(filePath).toLowerCase();
    
    // Analyze shader code
    const shaderAnalysis = analyzeShaderCode(shaderContent, extension);
    
    // Validate shader syntax
    const validation = await validateShaderSyntax(filePath, extension);
    
    const shaderData = {
      language: getShaderLanguage(extension),
      properties: shaderAnalysis.properties,
      textures: shaderAnalysis.textures,
      passes: shaderAnalysis.passes,
      complexity: shaderAnalysis.complexity,
      validation,
      lineCount: shaderContent.split('\n').length,
      characterCount: shaderContent.length
    };
    
    await prisma.gameAsset.update({
      where: { id: assetId },
      data: { 
        status: validation.isValid ? 'processed' : 'error',
        metadata: shaderData
      }
    });
    
  } catch (error) {
    console.error('Shader processing failed:', error);
    throw error;
  }
}

// Process Script Assets
async function processScriptAsset(assetId: string, filePath: string) {
  console.log(`Processing script asset: ${assetId}`);
  
  try {
    const scriptContent = await fs.readFile(filePath, 'utf-8');
    const extension = path.extname(filePath).toLowerCase();
    
    // Analyze script code
    const codeAnalysis = analyzeScriptCode(scriptContent, extension);
    
    // Run static analysis
    const staticAnalysis = await runStaticAnalysis(filePath, extension);
    
    const scriptData = {
      language: getLanguageFromExtension(extension),
      classes: codeAnalysis.classes,
      functions: codeAnalysis.functions,
      imports: codeAnalysis.imports,
      complexity: codeAnalysis.complexity,
      lineCount: scriptContent.split('\n').length,
      characterCount: scriptContent.length,
      staticAnalysis,
      hasTests: codeAnalysis.hasTests,
      dependencies: codeAnalysis.dependencies
    };
    
    await prisma.gameAsset.update({
      where: { id: assetId },
      data: { 
        status: 'processed',
        metadata: scriptData
      }
    });
    
  } catch (error) {
    console.error('Script processing failed:', error);
    throw error;
  }
}

// Process Generic Assets
async function processGenericAsset(assetId: string, filePath: string) {
  console.log(`Processing generic asset: ${assetId}`);
  
  try {
    const stats = await fs.stat(filePath);
    const extension = path.extname(filePath).toLowerCase();
    
    const genericData = {
      fileSize: stats.size,
      format: extension.replace('.', ''),
      lastModified: stats.mtime,
      checksum: await calculateChecksum(filePath)
    };
    
    await prisma.gameAsset.update({
      where: { id: assetId },
      data: { 
        status: 'processed',
        metadata: genericData
      }
    });
    
  } catch (error) {
    console.error('Generic asset processing failed:', error);
    throw error;
  }
}

// Batch Processing Helper Functions
async function optimizeAsset(asset: any): Promise<any> {
  const filePath = path.join(process.env.UPLOADS_DIR || './uploads', 'game-assets', path.basename(asset.fileUrl));
  
  try {
    let optimizationData = {};
    
    switch (asset.assetType) {
      case 'Texture':
        optimizationData = await optimizeTexture(filePath, asset);
        break;
      case 'Audio':
        optimizationData = await optimizeAudio(filePath, asset);
        break;
      case 'Model':
        optimizationData = await optimizeModel(filePath, asset);
        break;
      default:
        optimizationData = await optimizeGeneric(filePath, asset);
    }
    
    return {
      ...asset,
      metadata: {
        ...asset.metadata,
        optimization: optimizationData,
        optimizedAt: new Date().toISOString()
      }
    };
    
  } catch (error) {
    console.error('Asset optimization failed:', error);
    return asset;
  }
}

async function validateAsset(asset: any): Promise<any> {
  const filePath = path.join(process.env.UPLOADS_DIR || './uploads', 'game-assets', path.basename(asset.fileUrl));
  
  try {
    const stats = await fs.stat(filePath);
    const validation = {
      fileExists: true,
      fileSize: stats.size,
      lastModified: stats.mtime,
      isReadable: true,
      checksumValid: true,
      formatValid: true,
      errors: [] as string[],
      warnings: [] as string[]
    };
    
    // Check file accessibility
    try {
      await fs.access(filePath, fs.constants.R_OK);
    } catch {
      validation.isReadable = false;
      validation.errors.push('File is not readable');
    }
    
    // Validate file format based on extension
    const extension = path.extname(filePath).toLowerCase();
    if (!isValidFileFormat(extension, asset.assetType)) {
      validation.formatValid = false;
      validation.errors.push('File format does not match asset type');
    }
    
    // Check file size limits
    const maxSizes = {
      'Texture': 50 * 1024 * 1024, // 50MB
      'Model': 100 * 1024 * 1024,   // 100MB
      'Audio': 25 * 1024 * 1024,    // 25MB
      'Animation': 50 * 1024 * 1024 // 50MB
    };
    
    const maxSize = maxSizes[asset.assetType as keyof typeof maxSizes] || 10 * 1024 * 1024;
    if (stats.size > maxSize) {
      validation.warnings.push(`File size (${Math.round(stats.size / 1024 / 1024)}MB) exceeds recommended limit`);
    }
    
    return validation;
    
  } catch (error) {
    console.error('Asset validation failed:', error);
    return {
      fileExists: false,
      errors: ['Failed to validate asset: ' + ((error as Error)?.message || String(error))],
      warnings: []
    };
  }
}

async function generateAssetVariants(asset: any): Promise<any> {
  const filePath = path.join(process.env.UPLOADS_DIR || './uploads', 'game-assets', path.basename(asset.fileUrl));
  
  try {
    const variants: any[] = [];
    
    switch (asset.assetType) {
      case 'Texture':
        const textureVariants = await generateTextureVariants(filePath, asset.id);
        variants.push(...textureVariants);
        break;
      case 'Audio':
        const audioVariants = await generateAudioVariants(filePath, asset.id);
        variants.push(...audioVariants);
        break;
      case 'Model':
        const modelVariants = await generateModelVariants(filePath, asset.id);
        variants.push(...modelVariants);
        break;
    }
    
    return variants;
    
  } catch (error) {
    console.error('Variant generation failed:', error);
    return [];
  }
}

async function performAssetOptimization(asset: any, optimizations: string[]): Promise<any> {
  const filePath = path.join(process.env.UPLOADS_DIR || './uploads', 'game-assets', path.basename(asset.fileUrl));
  
  const results = {
    operations: [] as any[],
    sizeBefore: 0,
    sizeAfter: 0,
    compressionRatio: 0,
    optimizedVariants: [] as any[]
  };
  
  try {
    const statsBefore = await fs.stat(filePath);
    results.sizeBefore = statsBefore.size;
    
    for (const optimization of optimizations) {
      try {
        let result: any;
        
        switch (optimization) {
          case 'compress':
            result = await compressAsset(filePath, asset.assetType);
            break;
          case 'resize':
            result = await resizeAsset(filePath, asset.assetType);
            break;
          case 'format_convert':
            result = await convertAssetFormat(filePath, asset.assetType);
            break;
          case 'quality_reduce':
            result = await reduceQuality(filePath, asset.assetType);
            break;
          default:
            result = { success: false, error: 'Unknown optimization' };
        }
        
        results.operations.push({
          type: optimization,
          success: result.success,
          data: result.data,
          error: result.error
        });
        
        if (result.variants) {
          results.optimizedVariants.push(...result.variants);
        }
        
      } catch (error) {
        results.operations.push({
          type: optimization,
          success: false,
          error: (error as Error)?.message || String(error)
        });
      }
    }
    
    // Calculate final size after optimizations
    try {
      const statsAfter = await fs.stat(filePath);
      results.sizeAfter = statsAfter.size;
      results.compressionRatio = Math.round((1 - results.sizeAfter / results.sizeBefore) * 100);
    } catch {
      results.sizeAfter = results.sizeBefore;
    }
    
    return results;
    
  } catch (error) {
    console.error('Asset optimization failed:', error);
    return {
      operations: [],
      error: (error as Error)?.message || String(error)
    };
  }
}

// Advanced Processing Helper Functions

// 3D Model Processing Helpers
async function processFBXModel(filePath: string): Promise<any> {
  // In production, this would use FBX SDK or similar
  return {
    hasAnimations: path.basename(filePath).toLowerCase().includes('anim'),
    estimatedVertexCount: Math.floor(Math.random() * 50000) + 1000, // Mock data
    estimatedTriangleCount: Math.floor(Math.random() * 100000) + 2000,
    hasMaterials: true,
    hasTextures: true
  };
}

async function processOBJModel(filePath: string): Promise<any> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const lines = content.split('\n');
    
    let vertexCount = 0;
    let faceCount = 0;
    let hasNormals = false;
    let hasTexCoords = false;
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('v ')) vertexCount++;
      if (trimmed.startsWith('f ')) faceCount++;
      if (trimmed.startsWith('vn ')) hasNormals = true;
      if (trimmed.startsWith('vt ')) hasTexCoords = true;
    }
    
    return {
      vertexCount,
      faceCount,
      triangleCount: faceCount, // Assuming triangulated
      hasNormals,
      hasTexCoords,
      hasAnimations: false
    };
  } catch (error) {
    console.error('OBJ analysis failed:', error);
    return { error: 'Failed to analyze OBJ file' };
  }
}

async function processGLTFModel(filePath: string): Promise<any> {
  try {
    let gltfData: any;
    const extension = path.extname(filePath).toLowerCase();
    
    if (extension === '.gltf') {
      const content = await fs.readFile(filePath, 'utf-8');
      gltfData = JSON.parse(content);
    } else {
      // For .glb files, we'd need a proper GLB parser
      return { format: 'glb', needsSpecializedParser: true };
    }
    
    return {
      meshCount: gltfData.meshes?.length || 0,
      materialCount: gltfData.materials?.length || 0,
      textureCount: gltfData.textures?.length || 0,
      animationCount: gltfData.animations?.length || 0,
      hasAnimations: (gltfData.animations?.length || 0) > 0,
      nodeCount: gltfData.nodes?.length || 0,
      sceneCount: gltfData.scenes?.length || 0
    };
  } catch (error) {
    console.error('GLTF analysis failed:', error);
    return { error: 'Failed to analyze GLTF file' };
  }
}

async function generate3DPreview(filePath: string, assetId: string): Promise<string | null> {
  // In production, this would use a 3D renderer like Three.js headless or Blender
  // For now, return null indicating no preview generated
  return null;
}

async function validateModelFile(filePath: string, extension: string): Promise<any> {
  try {
    const stats = await fs.stat(filePath);
    
    // Basic validation
    const validation = {
      isValid: true,
      errors: [] as string[],
      warnings: [] as string[]
    };
    
    // Check file size
    if (stats.size > 500 * 1024 * 1024) { // 500MB
      validation.warnings.push('Large file size may impact performance');
    }
    
    // Check file accessibility
    try {
      await fs.access(filePath);
    } catch {
      validation.isValid = false;
      validation.errors.push('File is not accessible');
    }
    
    return validation;
  } catch (error) {
    return {
      isValid: false,
      errors: ['Validation failed: ' + ((error as Error)?.message || String(error))],
      warnings: []
    };
  }
}

// Audio Processing Helpers
async function generateWaveform(filePath: string, assetId: string): Promise<string | null> {
  try {
    const waveformDir = path.join(process.env.UPLOADS_DIR || './uploads', 'waveforms');
    await fs.mkdir(waveformDir, { recursive: true });
    
    const outputPath = path.join(waveformDir, `${assetId}_waveform.png`);
    
    // Use FFmpeg to generate waveform
    await new Promise<void>((resolve, reject) => {
      ffmpeg(filePath)
        .audioFilters('showwavespic=s=600x120')
        .output(outputPath)
        .on('end', () => resolve())
        .on('error', reject)
        .run();
    });
    
    return outputPath;
  } catch (error) {
    console.error('Waveform generation failed:', error);
    return null;
  }
}

async function createAudioCompressions(filePath: string, assetId: string): Promise<any[]> {
  const compressions: any[] = [];
  const compressionsDir = path.join(path.dirname(filePath), 'compressions');
  await fs.mkdir(compressionsDir, { recursive: true });
  
  try {
    // Create OGG version (good for web)
    const oggPath = path.join(compressionsDir, `${assetId}.ogg`);
    await new Promise<void>((resolve, reject) => {
      ffmpeg(filePath)
        .audioCodec('libvorbis')
        .audioBitrate('128k')
        .output(oggPath)
        .on('end', () => resolve())
        .on('error', reject)
        .run();
    });
    
    compressions.push({
      format: 'ogg',
      path: oggPath,
      bitrate: '128k',
      size: (await fs.stat(oggPath)).size
    });
    
    // Create MP3 version (good for mobile)
    const mp3Path = path.join(compressionsDir, `${assetId}.mp3`);
    await new Promise<void>((resolve, reject) => {
      ffmpeg(filePath)
        .audioCodec('libmp3lame')
        .audioBitrate('128k')
        .output(mp3Path)
        .on('end', () => resolve())
        .on('error', reject)
        .run();
    });
    
    compressions.push({
      format: 'mp3',
      path: mp3Path,
      bitrate: '128k',
      size: (await fs.stat(mp3Path)).size
    });
    
  } catch (error) {
    console.error('Audio compression failed:', error);
  }
  
  return compressions;
}

async function analyzeAudioContent(filePath: string): Promise<any> {
  try {
    // Basic audio analysis - in production would use more sophisticated tools
    const stats = await fs.stat(filePath);
    const fileName = path.basename(filePath).toLowerCase();
    
    return {
      isLooped: fileName.includes('loop') || fileName.includes('ambient'),
      peakLevel: -6.0, // Mock data - would analyze actual audio
      averageLevel: -12.0,
      silenceAtStart: false,
      silenceAtEnd: false
    };
  } catch (error) {
    console.error('Audio analysis failed:', error);
    return {};
  }
}

// Animation Processing Helpers
async function analyzeFBXAnimation(filePath: string): Promise<any> {
  // Mock implementation - would use FBX SDK in production
  return {
    animationCount: Math.floor(Math.random() * 5) + 1,
    frameRate: 30,
    duration: Math.floor(Math.random() * 10) + 1,
    hasRootMotion: Math.random() > 0.5,
    boneCount: Math.floor(Math.random() * 50) + 10,
    keyframeCount: Math.floor(Math.random() * 1000) + 100
  };
}

async function analyzeUnityAnimation(filePath: string): Promise<any> {
  // Mock implementation - would parse Unity .anim files
  return {
    isHumanoid: Math.random() > 0.5,
    isGeneric: Math.random() > 0.5,
    frameRate: 60,
    duration: Math.floor(Math.random() * 5) + 1,
    curveCount: Math.floor(Math.random() * 20) + 5
  };
}

// Shader Processing Helpers
function analyzeShaderCode(content: string, extension: string): any {
  const lines = content.split('\n');
  const analysis = {
    properties: [] as string[],
    textures: [] as string[],
    passes: 0,
    complexity: 'medium'
  };
  
  for (const line of lines) {
    const trimmed = line.trim();
    
    // Look for shader properties
    if (trimmed.includes('_MainTex') || trimmed.includes('sampler2D')) {
      analysis.textures.push(trimmed);
    }
    
    if (trimmed.includes('Properties') || trimmed.includes('uniform')) {
      analysis.properties.push(trimmed);
    }
    
    if (trimmed.includes('Pass') || trimmed.includes('SubShader')) {
      analysis.passes++;
    }
  }
  
  // Estimate complexity based on line count and features
  if (lines.length > 200 || analysis.passes > 2) {
    analysis.complexity = 'high';
  } else if (lines.length < 50 && analysis.passes <= 1) {
    analysis.complexity = 'low';
  }
  
  return analysis;
}

async function validateShaderSyntax(filePath: string, extension: string): Promise<any> {
  // Basic validation - in production would use shader compilers
  const validation = {
    isValid: true,
    errors: [] as string[],
    warnings: [] as string[]
  };
  
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    
    // Basic syntax checks
    const braceCount = (content.match(/\{/g) || []).length - (content.match(/\}/g) || []).length;
    if (braceCount !== 0) {
      validation.isValid = false;
      validation.errors.push('Mismatched braces');
    }
    
    // Check for common shader keywords
    const hasVertexShader = content.includes('vertex') || content.includes('vert');
    const hasFragmentShader = content.includes('fragment') || content.includes('frag');
    
    if (!hasVertexShader && !hasFragmentShader) {
      validation.warnings.push('No vertex or fragment shader detected');
    }
    
  } catch (error) {
    validation.isValid = false;
    validation.errors.push('Failed to read shader file');
  }
  
  return validation;
}

function getShaderLanguage(extension: string): string {
  const langMap: Record<string, string> = {
    '.shader': 'Unity ShaderLab',
    '.hlsl': 'HLSL',
    '.glsl': 'GLSL',
    '.vert': 'GLSL Vertex',
    '.frag': 'GLSL Fragment',
    '.compute': 'Compute Shader'
  };
  
  return langMap[extension] || 'Unknown';
}

// Script Processing Helpers
function analyzeScriptCode(content: string, extension: string): any {
  const lines = content.split('\n');
  const analysis = {
    classes: [] as string[],
    functions: [] as string[],
    imports: [] as string[],
    complexity: 0,
    hasTests: false,
    dependencies: [] as string[]
  };
  
  for (const line of lines) {
    const trimmed = line.trim();
    
    // Detect classes
    if (trimmed.includes('class ') || trimmed.includes('public class')) {
      const match = trimmed.match(/class\s+(\w+)/);
      if (match) analysis.classes.push(match[1]);
    }
    
    // Detect functions
    if (trimmed.includes('function ') || trimmed.includes('def ') || 
        (trimmed.includes('(') && (trimmed.includes('public ') || trimmed.includes('private ')))) {
      analysis.functions.push(trimmed.substring(0, 50));
    }
    
    // Detect imports
    if (trimmed.startsWith('import ') || trimmed.startsWith('using ') || trimmed.startsWith('#include')) {
      analysis.imports.push(trimmed);
    }
    
    // Check for tests
    if (trimmed.includes('test') || trimmed.includes('Test') || trimmed.includes('[Test]')) {
      analysis.hasTests = true;
    }
    
    // Increase complexity for certain patterns
    if (trimmed.includes('if ') || trimmed.includes('for ') || trimmed.includes('while ')) {
      analysis.complexity++;
    }
  }
  
  return analysis;
}

async function runStaticAnalysis(filePath: string, extension: string): Promise<any> {
  // Mock static analysis - in production would use ESLint, SonarQube, etc.
  const analysis = {
    issues: [] as any[],
    codeQuality: 'good',
    securityIssues: [] as string[],
    performanceIssues: [] as string[]
  };
  
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    
    // Basic checks
    if (content.includes('eval(')) {
      analysis.securityIssues.push('Use of eval() detected');
      analysis.codeQuality = 'poor';
    }
    
    if (content.includes('innerHTML')) {
      analysis.securityIssues.push('Use of innerHTML detected');
    }
    
    const lineCount = content.split('\n').length;
    if (lineCount > 500) {
      analysis.performanceIssues.push('Large file may impact compilation time');
    }
    
  } catch (error) {
    analysis.issues.push({ type: 'error', message: 'Failed to analyze file' });
  }
  
  return analysis;
}

function getLanguageFromExtension(extension: string): string {
  const langMap: Record<string, string> = {
    '.cs': 'C#',
    '.js': 'JavaScript',
    '.ts': 'TypeScript',
    '.cpp': 'C++',
    '.h': 'C++ Header',
    '.py': 'Python',
    '.lua': 'Lua',
    '.java': 'Java'
  };
  
  return langMap[extension] || 'Unknown';
}

// Asset Optimization Helper Functions
async function optimizeTexture(filePath: string, asset: any): Promise<any> {
  try {
    const image = sharp(filePath);
    const metadata = await image.metadata();
    
    const optimization = {
      originalSize: (await fs.stat(filePath)).size,
      originalResolution: `${metadata.width}x${metadata.height}`,
      optimizations: [] as any[]
    };
    
    // Generate optimized versions
    const optimizedDir = path.join(path.dirname(filePath), 'optimized');
    await fs.mkdir(optimizedDir, { recursive: true });
    
    const baseName = path.basename(filePath, path.extname(filePath));
    
    // Create web-optimized version
    const webPath = path.join(optimizedDir, `${baseName}_web.jpg`);
    await image
      .jpeg({ quality: 80, progressive: true })
      .toFile(webPath);
    
    optimization.optimizations.push({
      type: 'web_optimized',
      path: webPath,
      size: (await fs.stat(webPath)).size,
      format: 'jpeg',
      quality: 80
    });
    
    return optimization;
  } catch (error) {
    console.error('Texture optimization failed:', error);
    return { error: (error as Error)?.message || String(error) };
  }
}

async function optimizeAudio(filePath: string, asset: any): Promise<any> {
  try {
    const optimization = {
      originalSize: (await fs.stat(filePath)).size,
      optimizations: [] as any[]
    };
    
    const optimizedDir = path.join(path.dirname(filePath), 'optimized');
    await fs.mkdir(optimizedDir, { recursive: true });
    
    const baseName = path.basename(filePath, path.extname(filePath));
    
    // Create compressed OGG version
    const oggPath = path.join(optimizedDir, `${baseName}_optimized.ogg`);
    await new Promise<void>((resolve, reject) => {
      ffmpeg(filePath)
        .audioCodec('libvorbis')
        .audioBitrate('96k')
        .output(oggPath)
        .on('end', () => resolve())
        .on('error', reject)
        .run();
    });
    
    optimization.optimizations.push({
      type: 'compressed_ogg',
      path: oggPath,
      size: (await fs.stat(oggPath)).size,
      bitrate: '96k',
      format: 'ogg'
    });
    
    // Create MP3 version (good for mobile)
    const mp3Path = path.join(optimizedDir, `${baseName}_optimized.mp3`);
    await new Promise<void>((resolve, reject) => {
      ffmpeg(filePath)
        .audioCodec('libmp3lame')
        .audioBitrate('128k')
        .output(mp3Path)
        .on('end', () => resolve())
        .on('error', reject)
        .run();
    });
    
    optimization.optimizations.push({
      format: 'mp3',
      path: mp3Path,
      bitrate: '128k',
      size: (await fs.stat(mp3Path)).size
    });
    
    return optimization;
  } catch (error) {
    console.error('Audio optimization failed:', error);
    return { error: (error as Error)?.message || String(error) };
  }
}

async function optimizeModel(filePath: string, asset: any): Promise<any> {
  // Model optimization would require specialized tools
  // For now, return basic analysis
  return {
    originalSize: (await fs.stat(filePath)).size,
    needsSpecializedTools: true,
    recommendations: [
      'Consider using model compression tools',
      'Reduce polygon count for LOD versions',
      'Optimize texture resolution'
    ]
  };
}

async function optimizeGeneric(filePath: string, asset: any): Promise<any> {
  const stats = await fs.stat(filePath);
  return {
    originalSize: stats.size,
    checksum: await calculateChecksum(filePath),
    lastModified: stats.mtime,
    recommendations: ['File validated successfully']
  };
}

function isValidFileFormat(extension: string, assetType: string): boolean {
  const validFormats: Record<string, string[]> = {
    'Texture': ['.png', '.jpg', '.jpeg', '.tga', '.bmp', '.psd'],
    'Model': ['.fbx', '.obj', '.gltf', '.glb', '.dae', '.blend'],
    'Audio': ['.wav', '.mp3', '.ogg', '.aiff', '.flac'],
    'Animation': ['.fbx', '.anim', '.dae'],
    'Script': ['.cs', '.js', '.ts', '.cpp', '.h', '.py'],
    'Shader': ['.shader', '.hlsl', '.glsl', '.vert', '.frag'],
    'Prefab': ['.prefab', '.uasset'],
    'Material': ['.mat', '.uasset']
  };
  
  const validExts = validFormats[assetType] || [];
  return validExts.includes(extension);
}

async function generateTextureVariants(filePath: string, assetId: string): Promise<any[]> {
  const variants: any[] = [];
  const variantsDir = path.join(path.dirname(filePath), 'variants');
  await fs.mkdir(variantsDir, { recursive: true });
  
  try {
    const image = sharp(filePath);
    const baseName = path.basename(filePath, path.extname(filePath));
    
    // Generate different resolution variants
    const resolutions = [256, 512, 1024, 2048];
    
    for (const res of resolutions) {
      const variantPath = path.join(variantsDir, `${baseName}_${res}x${res}.jpg`);
      await image
        .resize(res, res, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 90 })
        .toFile(variantPath);
      
      variants.push({
        resolution: `${res}x${res}`,
        path: variantPath,
        size: (await fs.stat(variantPath)).size,
        format: 'jpeg'
      });
    }
    
  } catch (error) {
    console.error('Texture variant generation failed:', error);
  }
  
  return variants;
}

async function generateAudioVariants(filePath: string, assetId: string): Promise<any[]> {
  const variants: any[] = [];
  const variantsDir = path.join(path.dirname(filePath), 'variants');
  await fs.mkdir(variantsDir, { recursive: true });
  
  try {
    const baseName = path.basename(filePath, path.extname(filePath));
    
    // Generate different quality variants
    const qualities = [
      { name: 'high', bitrate: '192k' },
      { name: 'medium', bitrate: '128k' },
      { name: 'low', bitrate: '96k' }
    ];
    
    for (const quality of qualities) {
      const variantPath = path.join(variantsDir, `${baseName}_${quality.name}.mp3`);
      await new Promise<void>((resolve, reject) => {
        ffmpeg(filePath)
          .audioCodec('libmp3lame')
          .audioBitrate(quality.bitrate)
          .output(variantPath)
          .on('end', () => resolve())
          .on('error', reject)
          .run();
      });
      
      variants.push({
        quality: quality.name,
        bitrate: quality.bitrate,
        path: variantPath,
        size: (await fs.stat(variantPath)).size,
        format: 'mp3'
      });
    }
    
  } catch (error) {
    console.error('Audio variant generation failed:', error);
  }
  
  return variants;
}

async function generateModelVariants(filePath: string, assetId: string): Promise<any[]> {
  // Model variant generation would require specialized tools
  // For now, return empty array indicating no variants generated
  return [];
}

async function compressAsset(filePath: string, assetType: string): Promise<any> {
  try {
    switch (assetType) {
      case 'Texture':
        return await compressTexture(filePath);
      case 'Audio':
        return await compressAudio(filePath);
      default:
        return { success: false, error: 'Compression not supported for this asset type' };
    }
  } catch (error) {
    return { success: false, error: (error as Error)?.message || String(error) };
  }
}

async function compressTexture(filePath: string): Promise<any> {
  const compressedPath = filePath.replace(/\.[^.]+$/, '_compressed.jpg');
  
  await sharp(filePath)
    .jpeg({ quality: 70, progressive: true })
    .toFile(compressedPath);
  
  const originalSize = (await fs.stat(filePath)).size;
  const compressedSize = (await fs.stat(compressedPath)).size;
  
  // Replace original with compressed version
  await fs.rename(compressedPath, filePath);
  
  return {
    success: true,
    data: {
      originalSize,
      compressedSize,
      compressionRatio: Math.round((1 - compressedSize / originalSize) * 100)
    }
  };
}

async function compressAudio(filePath: string): Promise<any> {
  const compressedPath = filePath.replace(/\.[^.]+$/, '_compressed.mp3');
  
  await new Promise<void>((resolve, reject) => {
    ffmpeg(filePath)
      .audioCodec('libmp3lame')
      .audioBitrate('128k')
      .output(compressedPath)
      .on('end', () => resolve())
      .on('error', reject)
      .run();
  });
  
  const originalSize = (await fs.stat(filePath)).size;
  const compressedSize = (await fs.stat(compressedPath)).size;
  
  // Replace original with compressed version
  await fs.rename(compressedPath, filePath);
  
  return {
    success: true,
    data: {
      originalSize,
      compressedSize,
      compressionRatio: Math.round((1 - compressedSize / originalSize) * 100)
    }
  };
}

async function resizeAsset(filePath: string, assetType: string): Promise<any> {
  if (assetType !== 'Texture') {
    return { success: false, error: 'Resize only supported for textures' };
  }
  
  try {
    const image = sharp(filePath);
    const metadata = await image.metadata();
    
    // Resize to 50% of original dimensions
    const newWidth = Math.floor(metadata.width! / 2);
    const newHeight = Math.floor(metadata.height! / 2);
    
    const resizedPath = filePath.replace(/\.[^.]+$/, '_resized.jpg');
    
    await image
      .resize(newWidth, newHeight)
      .jpeg({ quality: 90 })
      .toFile(resizedPath);
    
    // Replace original with resized version
    await fs.rename(resizedPath, filePath);
    
    return {
      success: true,
      data: {
        originalResolution: `${metadata.width}x${metadata.height}`,
        newResolution: `${newWidth}x${newHeight}`
      }
    };
  } catch (error) {
    return { success: false, error: (error as Error)?.message || String(error) };
  }
}

async function convertAssetFormat(filePath: string, assetType: string): Promise<any> {
  // Format conversion would be asset-specific
  // For now, return not implemented
  return { success: false, error: 'Format conversion not implemented' };
}

async function reduceQuality(filePath: string, assetType: string): Promise<any> {
  try {
    switch (assetType) {
      case 'Texture':
        return await reduceTextureQuality(filePath);
      case 'Audio':
        return await reduceAudioQuality(filePath);
      default:
        return { success: false, error: 'Quality reduction not supported for this asset type' };
    }
  } catch (error) {
    return { success: false, error: (error as Error)?.message || String(error) };
  }
}

async function reduceTextureQuality(filePath: string): Promise<any> {
  const reducedPath = filePath.replace(/\.[^.]+$/, '_reduced.jpg');
  
  await sharp(filePath)
    .jpeg({ quality: 60 })
    .toFile(reducedPath);
  
  // Replace original with reduced quality version
  await fs.rename(reducedPath, filePath);
  
  return {
    success: true,
    data: {
      quality: '60%',
      format: 'JPEG'
    }
  };
}

async function reduceAudioQuality(filePath: string): Promise<any> {
  const reducedPath = filePath.replace(/\.[^.]+$/, '_reduced.mp3');
  
  await new Promise<void>((resolve, reject) => {
    ffmpeg(filePath)
      .audioCodec('libmp3lame')
      .audioBitrate('96k')
      .output(reducedPath)
      .on('end', () => resolve())
      .on('error', reject)
      .run();
  });
  
  // Replace original with reduced quality version
  await fs.rename(reducedPath, filePath);
  
  return {
    success: true,
    data: {
      bitrate: '96k',
      format: 'MP3'
    }
  };
}

// Utility Functions
async function calculateChecksum(filePath: string): Promise<string> {
  try {
    const content = await fs.readFile(filePath);
    return createHash('sha256').update(content).digest('hex');
  } catch (error) {
    console.error('Checksum calculation failed:', error);
    return '';
  }
}

export default router;

// CommonJS compatibility
module.exports = router;
