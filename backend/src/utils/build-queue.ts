import { prisma } from '../database/prisma';
import { BuildExecutor, BuildConfig } from './build-executor';
import path from 'path';
import { getErrorMessage } from './error-helpers';

// In-memory build queue (in production, use Redis or similar)
let buildQueue: Array<{ buildId: string; priority: number; timestamp: Date }> = [];

export async function enqueueBuildJob(buildId: string, priority: number): Promise<void> {
  buildQueue.push({
    buildId,
    priority,
    timestamp: new Date()
  });
  
  // Sort by priority (high to low) then by timestamp (first come, first served)
  buildQueue.sort((a, b) => {
    if (a.priority !== b.priority) {
      return b.priority - a.priority;
    }
    return a.timestamp.getTime() - b.timestamp.getTime();
  });
  
  // Process queue
  processBuildQueue();
}

export async function removeBuildFromQueue(buildId: string): Promise<void> {
  buildQueue = buildQueue.filter(item => item.buildId !== buildId);
}

export async function getBuildQueuePosition(buildId: string): Promise<number> {
  const position = buildQueue.findIndex(item => item.buildId === buildId);
  return position === -1 ? -1 : position + 1;
}

export async function getEstimatedWaitTime(buildId: string): Promise<number> {
  const position = await getBuildQueuePosition(buildId);
  if (position === -1) return 0;
  
  // Calculate estimated wait time based on queue position and average build time
  const averageBuildTime = 10; // minutes
  return (position - 1) * averageBuildTime;
}

export async function getBuildQueueStatus(userId: string): Promise<any> {
  try {
    // Get overall queue statistics
    const totalInQueue = buildQueue.length;
    const currentlyBuilding = await prisma.gameBuild.count({
      where: { status: 'building' }
    });

    // Get user's builds in queue
    const userQueuedBuilds = await prisma.gameBuild.findMany({
      where: { 
        userId,
        status: 'queued'
      },
      select: {
        id: true,
        platform: true,
        buildType: true,
        version: true,
        priority: true,
        queuedAt: true,
        project: {
          select: { name: true, framework: true }
        }
      },
      orderBy: { queuedAt: 'asc' }
    });

    // Add queue positions
    const userBuildsWithPosition = await Promise.all(
      userQueuedBuilds.map(async (build) => ({
        ...build,
        queuePosition: await getBuildQueuePosition(build.id),
        estimatedWaitTime: await getEstimatedWaitTime(build.id)
      }))
    );

    // Get recent build statistics
    const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentBuilds = await prisma.gameBuild.groupBy({
      by: ['status'],
      where: {
        queuedAt: { gte: last24Hours }
      },
      _count: { status: true }
    });

    const buildStats = recentBuilds.reduce((acc: any, item: any) => {
      acc[item.status] = item._count.status;
      return acc;
    }, {} as Record<string, number>);

    return {
      queue: {
        totalInQueue,
        currentlyBuilding,
        averageWaitTime: totalInQueue * 10 // rough estimate
      },
      userBuilds: userBuildsWithPosition,
      statistics: {
        last24Hours: buildStats,
        totalBuilds: Object.values(buildStats).reduce((sum: any, count: any) => sum + count, 0)
      }
    };

  } catch (error) {
    console.error('Failed to get build queue status:', error);
    throw error;
  }
}

export function getEstimatedBuildTime(framework: string, platform: string): number {
  // Estimated build times in minutes
  const buildTimes: Record<string, Record<string, number>> = {
    'Unity': {
      'Windows': 8,
      'Mac': 10,
      'Linux': 7,
      'iOS': 15,
      'Android': 12,
      'WebGL': 6
    },
    'Unreal Engine': {
      'Windows': 20,
      'Mac': 25,
      'Linux': 18,
      'iOS': 30,
      'Android': 28,
      'PlayStation': 35,
      'Xbox': 32
    }
  };

  return buildTimes[framework]?.[platform] || 10;
}

// Build processing system
let isProcessingQueue = false;
const MAX_CONCURRENT_BUILDS = 3;

export async function processBuildQueue(): Promise<void> {
  if (isProcessingQueue) return;
  isProcessingQueue = true;

  try {
    // Get currently building count
    const currentlyBuilding = await prisma.gameBuild.count({
      where: { status: 'building' }
    });

    // Process builds up to max concurrent limit
    const availableSlots = MAX_CONCURRENT_BUILDS - currentlyBuilding;
    
    if (availableSlots > 0 && buildQueue.length > 0) {
      const buildsToProcess = buildQueue.splice(0, availableSlots);
      
      for (const { buildId } of buildsToProcess) {
        // Start build processing (don't await - run concurrently)
        startBuildExecution(buildId).catch(error => {
          console.error(`Build execution failed for ${buildId}:`, error);
        });
      }
    }
  } catch (error) {
    console.error('Failed to process build queue:', error);
  } finally {
    isProcessingQueue = false;
  }
}

async function startBuildExecution(buildId: string): Promise<void> {
  try {
    // Update build status to building
    const build = await prisma.gameBuild.update({
      where: { id: buildId },
      data: {
        status: 'building',
        startedAt: new Date(),
        logs: [
          { timestamp: new Date(), message: 'Build started', level: 'info' }
        ]
      },
      include: {
        project: true
      }
    });

    console.log(`Starting build execution for ${buildId} - ${build.project?.name || 'Unknown'} (${build.platform || 'Unknown'})`);

    // Execute real build process using BuildExecutor
    await executeRealBuildProcess(build);

    console.log(`Build completed for ${buildId}`);

    // Process next builds in queue
    processBuildQueue();

  } catch (error) {
    console.error(`Build execution failed for ${buildId}:`, error);
    
    // Mark build as failed
    await prisma.gameBuild.update({
      where: { id: buildId },
      data: {
        status: 'failed',
        completedAt: new Date(),
        logs: [
          { timestamp: new Date(), message: `Build failed: ${getErrorMessage(error)}`, level: 'error' }
        ]
      }
    });

    // Process next builds in queue
    processBuildQueue();
  }
}

async function executeRealBuildProcess(build: any): Promise<void> {
  try {
    // Create build configuration for real BuildExecutor
    const buildConfig: BuildConfig = {
      buildId: build.id,
      projectPath: build.project.projectPath || `/tmp/projects/${build.project.id}`,
      framework: build.project.framework as 'Unity' | 'Unreal Engine',
      platform: build.platform,
      buildType: build.buildType as 'Debug' | 'Release' | 'Development',
      version: build.version,
      outputPath: `/tmp/builds/${build.id}`,
      configuration: build.project.configuration || {}
    };

    console.log(`Executing real build with config:`, buildConfig);

    // Initialize BuildExecutor
    const buildExecutor = new BuildExecutor(buildConfig);

    // Set up progress monitoring
    const progressInterval = setInterval(async () => {
      try {
        // Get current progress from build executor logs
        const currentLogs = await prisma.gameBuild.findUnique({
          where: { id: build.id },
          select: { logs: true }
        });

        // Update build status in database
        await buildExecutor.updateBuildStatus('building', 50); // Rough progress estimate
      } catch (error) {
        console.error('Failed to update build progress:', error);
      }
    }, 30000); // Update every 30 seconds

    try {
      // Execute the real build
      const buildResult = await buildExecutor.execute();

      // Clear progress monitoring
      clearInterval(progressInterval);

      if (buildResult.success) {
        // Mark build as completed with real results
        await prisma.gameBuild.update({
          where: { id: build.id },
          data: {
            status: 'completed',
            completedAt: new Date(),
            progress: 100,
            downloadUrl: buildResult.outputPath ? generateDownloadUrl(build, buildResult.outputPath) : undefined,
            artifactSize: buildResult.artifactSize ? Math.floor(buildResult.artifactSize / (1024 * 1024)) : undefined, // Convert to MB
            logs: buildResult.logs.map(log => ({
              timestamp: log.timestamp,
              message: log.message,
              level: log.level
            }))
          }
        });

        console.log(`Real build completed successfully for ${build.id}`);
      } else {
        throw new Error(buildResult.error || 'Build failed for unknown reason');
      }

    } catch (buildError) {
      // Clear progress monitoring
      clearInterval(progressInterval);

      console.error(`Real build execution failed for ${build.id}:`, buildError);

      // Mark build as failed with real error logs
      await prisma.gameBuild.update({
        where: { id: build.id },
        data: {
          status: 'failed',
          completedAt: new Date(),
          progress: 0,
          logs: (buildError as any)?.logs || [
            {
              timestamp: new Date(),
              message: `Build failed: ${buildError instanceof Error ? buildError.message : String(buildError)}`,
              level: 'error'
            }
          ]
        }
      });

      throw buildError;
    }

  } catch (error) {
    console.error(`Failed to execute real build process for ${build.id}:`, error);
    
    // Mark build as failed
    await prisma.gameBuild.update({
      where: { id: build.id },
      data: {
        status: 'failed',
        completedAt: new Date(),
        logs: [
          {
            timestamp: new Date(),
            message: `Build setup failed: ${error instanceof Error ? getErrorMessage(error) : String(error)}`,
            level: 'error'
          }
        ]
      }
    });

    throw error;
  }
}

function generateDownloadUrl(build: any, outputPath?: string): string {
  // In production, this would be a real S3/CDN URL
  const filename = `${build.project.name}_v${build.version}_${build.platform}_${build.buildType}.zip`;
  
  if (outputPath) {
    // Use real output path from BuildExecutor
    return `/downloads/builds/${build.id}/${path.basename(outputPath)}`;
  }
  
  // Fallback for legacy builds
  return `/downloads/builds/${build.id}/${filename}`;
}