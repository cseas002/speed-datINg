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

export async function GET() {
    try {
        // Verify admin
        const isAdmin = await verifyAdminCookie()
        if (!isAdmin) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            )
        }

        // Get all participants
        const participants = await prisma.participant.findMany({
            select: {
                id: true,
                name: true,
                email: true,
                sex: true,
            },
            orderBy: {
                name: 'asc',
            },
        })

        return NextResponse.json({
            participants,
        })
    } catch (error) {
        console.error('Get participants error:', error)
        return NextResponse.json(
            { error: 'Failed to get participants' },
            { status: 500 }
        )
    }
}
