import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { CampaignTemplateEngine } from '@/lib/media-processing/campaign-templates'

const templateEngine = new CampaignTemplateEngine()

export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      )
    }

    const url = new URL(request.url)
    const category = url.searchParams.get('category') // social, ads, presentations, etc.
    const platform = url.searchParams.get('platform') // instagram, tiktok, youtube, facebook, etc.
    const format = url.searchParams.get('format') // video, image, audio
    const page = parseInt(url.searchParams.get('page') || '1')
    const limit = parseInt(url.searchParams.get('limit') || '20')

    const where: any = {
      active: true
    }

    if (category) {
      where.category = category
    }

    if (platform) {
      where.platforms = {
        has: platform
      }
    }

    if (format) {
      where.format = format
    }

    const [templates, total] = await Promise.all([
      prisma.campaignTemplate.findMany({
        where,
        orderBy: [
          { featured: 'desc' },
          { popularity: 'desc' },
          { createdAt: 'desc' }
        ],
        skip: (page - 1) * limit,
        take: limit,
        include: {
          _count: {
            select: {
              usages: true
            }
          }
        }
      }),
      prisma.campaignTemplate.count({ where })
    ])

    return NextResponse.json({
      templates: templates.map(template => ({
        ...template,
        usageCount: template._count.usages
      })),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    })

  } catch (error) {
    console.error('Templates fetch error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch templates' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { 
      templateId, 
      fileIds, 
      customizations = {},
      projectId 
    } = body

    if (!templateId || !fileIds || !Array.isArray(fileIds)) {
      return NextResponse.json(
        { error: 'Template ID and file IDs are required' },
        { status: 400 }
      )
    }

    // Get template
    const template = await prisma.campaignTemplate.findUnique({
      where: { id: templateId }
    })

    if (!template) {
      return NextResponse.json(
        { error: 'Template not found' },
        { status: 404 }
      )
    }

    // Verify file ownership
    const files = await prisma.mediaFile.findMany({
      where: {
        id: { in: fileIds },
        userId: session.user.id,
        deleted: false
      }
    })

    if (files.length !== fileIds.length) {
      return NextResponse.json(
        { error: 'Some files not found or access denied' },
        { status: 404 }
      )
    }

    // Apply template to files
    const result = await templateEngine.applyTemplate({
      template,
      files,
      customizations,
      userId: session.user.id,
      projectId
    })

    // Track template usage
    await prisma.templateUsage.create({
      data: {
        userId: session.user.id,
        templateId: template.id,
        projectId,
        customizations,
        resultFileIds: result.outputFiles.map(f => f.id)
      }
    })

    // Update template popularity
    await prisma.campaignTemplate.update({
      where: { id: template.id },
      data: {
        popularity: {
          increment: 1
        }
      }
    })

    // Log analytics
    await prisma.analyticsEvent.create({
      data: {
        userId: session.user.id,
        type: 'template_applied',
        metadata: {
          templateId: template.id,
          fileIds,
          projectId,
          outputCount: result.outputFiles.length
        }
      }
    })

    return NextResponse.json({
      success: true,
      template: template.name,
      outputFiles: result.outputFiles,
      processingJobs: result.processingJobs,
      message: 'Template applied successfully'
    })

  } catch (error) {
    console.error('Template application error:', error)
    return NextResponse.json(
      { error: 'Failed to apply template' },
      { status: 500 }
    )
  }
}
