import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/db'
import { verifyEmailSession } from '@/lib/auth'

export async function GET() {
    try {
        const cookieStore = await cookies()
        const sessionToken = cookieStore.get('sessionToken')

        if (!sessionToken?.value) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            )
        }

        const session = await verifyEmailSession(sessionToken.value)
        if (!session) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            )
        }

        const participant = await prisma.participant.findUnique({
            where: { email: session.email },
        })

        if (!participant) {
            return NextResponse.json(
                { error: 'Participant not found' },
                { status: 404 }
            )
        }

        const rankings = await prisma.userRanking.findMany({
            where: { rankerId: participant.id },
        })

        return NextResponse.json({
            rankings,
        })
    } catch (error) {
        console.error('Rankings fetch error:', error)
        return NextResponse.json(
            { error: 'Failed to fetch rankings' },
            { status: 500 }
        )
    }
}
