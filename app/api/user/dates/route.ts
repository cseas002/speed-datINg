import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/db'
import { verifyEmailSession } from '@/lib/auth'

export async function GET() {
    try {
        const cookieStore = await cookies()
        const sessionToken = cookieStore.get('sessionToken') || cookieStore.get('token')

        if (!sessionToken?.value) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const session = await verifyEmailSession(sessionToken.value)
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const participant = await prisma.participant.findUnique({
            where: { email: session.email },
        })

        if (!participant) {
            return NextResponse.json({ error: 'Participant not found' }, { status: 404 })
        }

        const dates = await prisma.date.findMany({
            where: {
                OR: [{ participant1Id: participant.id }, { participant2Id: participant.id }],
            },
            include: {
                participant1: {
                    select: {
                        id: true,
                        name: true,
                    },
                },
                participant2: {
                    select: {
                        id: true,
                        name: true,
                    },
                },
            },
            orderBy: { timeSlot: 'asc' },
        })

        return NextResponse.json({
            dates,
        })
    } catch (error) {
        console.error('Dates fetch error:', error)
        return NextResponse.json({ error: 'Failed to fetch dates' }, { status: 500 })
    }
}
