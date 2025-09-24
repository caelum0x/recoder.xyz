import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import sharp from 'sharp'

export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    
    if (!session?.user?.id) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const formData = await request.formData()
    const file = formData.get('avatar') as File
    
    if (!file) {
      return Response.json({ error: 'No file provided' }, { status: 400 })
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      return Response.json({ error: 'File must be an image' }, { status: 400 })
    }

    // Validate file size (5MB limit)
    if (file.size > 5 * 1024 * 1024) {
      return Response.json({ error: 'File size must be less than 5MB' }, { status: 400 })
    }

    // Create uploads directory if it doesn't exist
    const uploadsDir = join(process.cwd(), 'public', 'uploads', 'avatars')
    try {
      await mkdir(uploadsDir, { recursive: true })
    } catch (error) {
      // Directory might already exist
    }

    // Generate unique filename
    const timestamp = Date.now()
    const extension = file.name.split('.').pop()
    const filename = `${session.user.id}-${timestamp}.${extension}`
    const filepath = join(uploadsDir, filename)

    // Convert file to buffer
    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)

    // Process image with sharp (resize, optimize)
    const processedImage = await sharp(buffer)
      .resize(200, 200, {
        fit: 'cover',
        position: 'center'
      })
      .jpeg({ quality: 85 })
      .toBuffer()

    // Save processed image
    await writeFile(filepath, processedImage)

    // Get current user data for logging
    const currentUser = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { image: true }
    })

    // Update user avatar in database
    const avatarUrl = `/uploads/avatars/${filename}`
    const updatedUser = await prisma.user.update({
      where: { id: session.user.id },
      data: { image: avatarUrl }
    })

    // Log avatar change
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'AVATAR_UPDATED',
          resource: 'system',
        platform: 'web',
        ip: request.headers.get('x-forwarded-for') || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown',
        success: true,
        metadata: {
          previousAvatar: currentUser?.image || null,
          newAvatar: avatarUrl,
          filename: filename,
          fileSize: file.size
        }
      }
    })

    return Response.json({
      success: true,
      avatarUrl: avatarUrl,
      message: 'Avatar uploaded successfully'
    })
  } catch (error) {
    console.error('Avatar upload error:', error)
    return Response.json(
      { error: 'Failed to upload avatar' },
      { status: 500 }
    )
  }
}
