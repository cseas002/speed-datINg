import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/db'
import { verifyAdminSession } from '@/lib/auth'

async function verifyAdminCookie() {
    const cookieStore = await cookies()
    const adminToken = cookieStore.get('adminToken')
    if (!adminToken?.value) return false
    const session = await verifyAdminSession(adminToken.value)
    return !!session
}

export async function POST(request: Request) {
    try {
        const isAdmin = await verifyAdminCookie()
        if (!isAdmin) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            )
        }

        const { publish } = await request.json()

        // Get or create matching session
        let session = await prisma.matchingSession.findFirst()
        if (!session) {
            session = await prisma.matchingSession.create({
                data: {},
            })
        }

        // Update publish status
        const updated = await prisma.matchingSession.update({
            where: { id: session.id },
            data: { isPublished: publish === true },
        })

        return NextResponse.json({
            success: true,
            isPublished: updated.isPublished,
            message: publish ? 'Rankings published' : 'Rankings hidden',
        })
    } catch (error) {
        console.error('Publish error:', error)
        return NextResponse.json(
            { error: 'Failed to update publish status' },
            { status: 500 }
        )
    }
}

export async function GET() {
    try {
        const isAdmin = await verifyAdminCookie()
        if (!isAdmin) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            )
        }

        const latestSession = await prisma.matchingSession.findFirst({
            orderBy: { createdAt: 'desc' },
        })

        return NextResponse.json({
            isPublished: latestSession?.isPublished || false,
        })
    } catch (error) {
        console.error('Publish status error:', error)
        return NextResponse.json(
            { error: 'Failed to fetch publish status' },
            { status: 500 }
        )
    }
}
