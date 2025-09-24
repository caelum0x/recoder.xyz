/**
 * Auth utilities and exports
 */

//export { auth, signIn, signOut } from './unified-auth'
export { ServerAuth } from './server-auth'
export * from './types'

import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
//import { authOptions } from './unified-auth'
import { prisma } from '@/lib/prisma'
import { authOptions } from '../auth'

/**
 * Verify authentication for API routes
 * Returns the authenticated user ID
 */
export async function verifyAuth(request: NextRequest): Promise<{ userId: string }> {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.email) {
      throw new Error('Unauthorized')
    }

    // Get user ID from database
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true }
    })

    if (!user) {
      throw new Error('User not found')
    }

    return { userId: user.id }
  } catch (error) {
    throw new Error('Authentication failed')
  }
}