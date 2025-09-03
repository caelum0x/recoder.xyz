import { NextRequest, NextResponse } from 'next/server'
import { auth } from '../../../../../lib/auth'
import { prisma } from '../../../../../lib/prisma'
import { MediaUploadService, mediaUploadService } from '../../../../lib/media-processing/media-upload'
import { validateMediaFile } from '../../../../lib/media-processing/media-validator'
import { FFmpegProcessor } from '../../../../lib/media-processing/ffmpeg-processor'
import { rateLimit } from '../../../../lib/rate-limit'
import * as path from 'path'
import { v4 as uuidv4 } from 'uuid'

const UPLOAD_DIR = './public/uploads/media'
const MAX_FILE_SIZE = 500 * 1024 * 1024 // 500MB

export async function POST(request: NextRequest) {
  try {
    // Rate limiting
    const rateLimitResult = await rateLimit(request, 'media-upload', 10, 60000) // 10 uploads per minute
    if (!rateLimitResult.success) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please try again later.' },
        { status: 429 }
      )
    }

    // Authentication
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      )
    }

    // Parse form data
    const formData = await request.formData()
    const file = formData.get('file') as File
    const projectId = formData.get('projectId') as string
    const purpose = formData.get('purpose') as string || 'general' // general, campaign, template, etc.

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      )
    }

    // Validate file
    const validationResult = await validateMediaFile(file)
    if (!validationResult.valid) {
      return NextResponse.json(
        { error: validationResult.error },
        { status: 400 }
      )
    }

    // Check user quota
    const user = await prisma.user.findUnique({
      where: { id: session.user.id }
      // include: { subscription: true }  // Temporarily commented out
    })

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      )
    }

    // Upload and process file
    const uploadResult = await mediaUploadService.uploadFile({
      file,
      userId: user.id,
      projectId,
      purpose,
      metadata: {
        originalName: file.name,
        size: file.size,
        type: file.type,
        ...validationResult.metadata
      }
    })

    // Log analytics (commented out until AnalyticsEvent model is ready)
    // await prisma.analyticsEvent.create({
    //   data: {
    //     userId: user.id,
    //     type: 'media_upload',
    //     metadata: {
    //       fileId: uploadResult.id,
    //       fileSize: file.size,
    //       fileType: file.type,
    //       purpose,
    //       projectId
    //     }
    //   }
    // })

    return NextResponse.json({
      success: true,
      file: uploadResult,
      message: 'File uploaded successfully'
    })

  } catch (error) {
    console.error('Media upload error:', error)
    return NextResponse.json(
      { error: 'Failed to upload file' },
      { status: 500 }
    )
  }
}

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
    const projectId = url.searchParams.get('projectId')
    const purpose = url.searchParams.get('purpose')
    const page = parseInt(url.searchParams.get('page') || '1')
    const limit = parseInt(url.searchParams.get('limit') || '20')

    const where: any = {
      userId: session.user.id,
      deleted: false
    }

    if (projectId) {
      where.projectId = projectId
    }

    if (purpose) {
      where.purpose = purpose
    }

    const [files, total] = await Promise.all([
      // Temporarily use mock data until MediaFile model is ready
      // prisma.mediaFile.findMany({
      //   where,
      //   orderBy: { createdAt: 'desc' },
      //   skip: (page - 1) * limit,
      //   take: limit,
      //   include: {
      //     processingJobs: {
      //       orderBy: { createdAt: 'desc' },
      //       take: 1
      //     }
      //   }
      // }),
      // prisma.mediaFile.count({ where })
      Promise.resolve([]),
      Promise.resolve(0)
    ])

    return NextResponse.json({
      files,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    })

  } catch (error) {
    console.error('Media files fetch error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch files' },
      { status: 500 }
    )
  }
}
