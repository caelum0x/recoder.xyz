// Avatar upload API endpoint for user profile pictures
import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { userManager } from '@/lib/user-management';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import sharp from 'sharp';
import { randomBytes } from 'crypto';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const AVATAR_SIZE = 400; // 400x400 pixels

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    
    if (!session?.user?.id) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('avatar') as File;

    if (!file) {
      return Response.json({ error: 'No file provided' }, { status: 400 });
    }

    // Validate file type
    if (!ALLOWED_TYPES.includes(file.type)) {
      return Response.json({ 
        error: 'Invalid file type. Supported types: JPEG, PNG, WebP' 
      }, { status: 400 });
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return Response.json({ 
        error: 'File size too large. Maximum size: 5MB' 
      }, { status: 400 });
    }

    // Convert file to buffer
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Process image with Sharp
    try {
      const processedBuffer = await sharp(buffer)
        .resize(AVATAR_SIZE, AVATAR_SIZE, {
          fit: 'cover',
          position: 'center'
        })
        .jpeg({ quality: 90 })
        .toBuffer();

      // Generate unique filename
      const fileId = randomBytes(16).toString('hex');
      const filename = `${session.user.id}_${fileId}.jpg`;
      
      // Create upload directory if it doesn't exist
      const uploadDir = join(process.cwd(), 'public', 'uploads', 'avatars');
      try {
        await mkdir(uploadDir, { recursive: true });
      } catch (error) {
        // Directory might already exist, ignore error
      }

      // Save processed image
      const filePath = join(uploadDir, filename);
      await writeFile(filePath, processedBuffer);

      // Generate public URL
      const avatarUrl = `/uploads/avatars/${filename}`;

      // Update user profile with new avatar URL
      const updateSuccess = await userManager.updateUserProfile(session.user.id, {
        avatar_url: avatarUrl,
      });

      if (!updateSuccess) {
        return Response.json({ error: 'Failed to update profile with new avatar' }, { status: 500 });
      }

      return Response.json({ 
        success: true,
        avatarUrl,
        message: 'Avatar uploaded successfully' 
      });

    } catch (imageError) {
      console.error('Image processing error:', imageError);
      return Response.json({ error: 'Failed to process image' }, { status: 500 });
    }

  } catch (error) {
    console.error('Avatar upload error:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const session = await auth();
    
    if (!session?.user?.id) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Remove avatar from user profile
    const updateSuccess = await userManager.updateUserProfile(session.user.id, {
      avatar_url: undefined,
    });

    if (!updateSuccess) {
      return Response.json({ error: 'Failed to remove avatar' }, { status: 500 });
    }

    return Response.json({ 
      success: true,
      message: 'Avatar removed successfully' 
    });

  } catch (error) {
    console.error('Avatar removal error:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}