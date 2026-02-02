import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verifyEmailSession } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function GET(request: Request) {
    try {
        const cookieStore = await cookies()
        const sessionToken = cookieStore.get('sessionToken') || cookieStore.get('token')

        if (!sessionToken?.value) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            )
        }

        const session = await verifyEmailSession(sessionToken.value)
        if (!session) {
            return NextResponse.json(
                { error: 'Invalid session' },
                { status: 401 }
            )
        }

        // Get participant by email
        const participant = await prisma.participant.findUnique({
            where: { email: session.email },
        })

        if (!participant) {
            return NextResponse.json(
                { error: 'Participant not found' },
                { status: 404 }
            )
        }

        // Get the latest matching session to check if published
        const latestSession = await prisma.matchingSession.findFirst({
            orderBy: { createdAt: 'desc' },
        })

        const isPublished = latestSession?.isPublished || false

        // Get matches for this participant (ordered by rank)
        const matches = await prisma.match.findMany({
            where: { fromId: participant.id },
            include: { to: true },
            orderBy: { rank: 'asc' },
        })

        return NextResponse.json({
            matches,
            isPublished,
        })
    } catch (error) {
        console.error('Get matches error:', error)
        return NextResponse.json(
            { error: 'Failed to fetch matches' },
            { status: 500 }
        )
    }
}
