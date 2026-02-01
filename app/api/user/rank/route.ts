import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verifyEmailSession } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function POST(request: Request) {
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
                { error: 'Invalid session' },
                { status: 401 }
            )
        }

        const body = await request.json()
        const rankedId = body?.rankedId
        const score = body?.score
        const note = body?.note
        const rankings = body?.rankings

        // Get participant
        const participant = await prisma.participant.findUnique({
            where: { email: session.email },
        })

        if (!participant) {
            return NextResponse.json(
                { error: 'Participant not found' },
                { status: 404 }
            )
        }

        if (rankings && typeof rankings === 'object') {
            const entries = Object.entries(rankings as Record<string, { score?: number; note?: string }>)

            if (entries.length === 0) {
                return NextResponse.json(
                    { error: 'No rankings provided' },
                    { status: 400 }
                )
            }

            const saved = await Promise.all(
                entries.map(([rankedId, value]) => {
                    const entryScore = value?.score
                    const entryNote = value?.note
                    if (entryScore === undefined || entryScore === null) return null

                    return prisma.userRanking.upsert({
                        where: {
                            rankerId_rankedId: {
                                rankerId: participant.id,
                                rankedId,
                            },
                        },
                        update: {
                            score: entryScore,
                            note: entryNote ?? null,
                        },
                        create: {
                            rankerId: participant.id,
                            rankedId,
                            score: entryScore,
                            note: entryNote ?? null,
                        },
                    })
                })
            )

            return NextResponse.json({
                success: true,
                rankings: saved.filter(Boolean),
            })
        }

        if (!rankedId || score === undefined) {
            return NextResponse.json(
                { error: 'Missing rankedId or score' },
                { status: 400 }
            )
        }

        // Upsert single ranking
        const ranking = await prisma.userRanking.upsert({
            where: {
                rankerId_rankedId: {
                    rankerId: participant.id,
                    rankedId,
                },
            },
            update: {
                score,
                note: note ?? null,
            },
            create: {
                rankerId: participant.id,
                rankedId,
                score,
                note: note ?? null,
            },
        })

        return NextResponse.json({
            success: true,
            ranking,
        })
    } catch (error) {
        console.error('Rank error:', error)
        return NextResponse.json(
            { error: 'Failed to save ranking' },
            { status: 500 }
        )
    }
}
