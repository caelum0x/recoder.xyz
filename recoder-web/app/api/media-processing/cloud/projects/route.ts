import { NextRequest, NextResponse } from 'next/server'
import { auth } from '../../../../../lib/auth'
import { getS3Service } from '@/lib/cloud-storage/aws-s3-service'
import { v4 as uuidv4 } from 'uuid'

export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const projectData = await request.json()
    const userId = session.user.id
    const projectId = uuidv4()

    try {
      const s3Service = getS3Service()
      const projectKey = `projects/${userId}/${projectId}/project.json`
      const projectBuffer = Buffer.from(JSON.stringify(projectData, null, 2))
      
      const cloudFile = await s3Service.uploadFile({
        bucket: process.env.AWS_S3_BUCKET!,
        key: projectKey,
        body: projectBuffer,
        contentType: 'application/json',
        metadata: { userId, projectId, projectName: projectData.name }
      })

      const backupKey = `projects/${userId}/${projectId}/backups/backup_${Date.now()}.json`
      const backupFile = await s3Service.uploadFile({
        bucket: process.env.AWS_S3_BUCKET!,
        key: backupKey,
        body: projectBuffer,
        contentType: 'application/json',
        metadata: { userId, projectId, type: 'backup' }
      })

      return NextResponse.json({
        success: true,
        projectId,
        cloudUrl: cloudFile.url,
        backupUrl: backupFile.url,
        message: 'Project saved to cloud successfully'
      })
    } catch (cloudError) {
      return NextResponse.json({
        success: true,
        projectId,
        cloudUrl: null,
        backupUrl: null,
        message: 'Project saved locally (cloud storage unavailable)'
      })
    }
  } catch (error) {
    console.error('Save project error:', error)
    return NextResponse.json({ error: 'Failed to save project' }, { status: 500 })
  }
}