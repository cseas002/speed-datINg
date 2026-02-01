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

        // Get all participants
        const participants = await prisma.participant.findMany({
            orderBy: { name: 'asc' }
        })

        if (participants.length < 2) {
            return NextResponse.json(
                { error: 'Need at least 2 participants to create dates.' },
                { status: 400 }
            )
        }

        // Clear existing dates
        await prisma.date.deleteMany({})
        console.log('Cleared existing dates from database')

        // Get the latest matching session
        const latestSession = await prisma.matchingSession.findFirst({
            orderBy: { createdAt: 'desc' },
        })

        const sessionId = latestSession?.id

        // Build preference lists from LLM matches (top 7 per participant)
        const matches = await prisma.match.findMany({
            orderBy: { rank: 'asc' },
        })

        const participantMap = new Map(participants.map(p => [p.id, p]))
        const normalizeSex = (value: string) => value.trim().toLowerCase()

        const isMutuallyCompatible = (aId: string, bId: string) => {
            const a = participantMap.get(aId)
            const b = participantMap.get(bId)
            if (!a || !b) return false
            const aSex = normalizeSex(a.sex)
            const bSex = normalizeSex(b.sex)
            const aPref = normalizeSex(a.partnerSexPref)
            const bPref = normalizeSex(b.partnerSexPref)
            return aPref === bSex && bPref === aSex
        }

        const preferences: Record<string, string[]> = {}
        for (const match of matches) {
            if (!isMutuallyCompatible(match.fromId, match.toId)) continue
            if (!preferences[match.fromId]) preferences[match.fromId] = []
            if (preferences[match.fromId].length < 7) {
                preferences[match.fromId].push(match.toId)
            }
        }

        const women = participants.filter(p => normalizeSex(p.sex) === 'female')
        const men = participants.filter(p => normalizeSex(p.sex) !== 'female')

        const buildRankingMap = (ids: string[]) => {
            const map: Record<string, Record<string, number>> = {}
            for (const id of ids) {
                const prefs = preferences[id] || []
                const rankMap: Record<string, number> = {}
                prefs.forEach((pid, index) => {
                    rankMap[pid] = index
                })
                map[id] = rankMap
            }
            return map
        }

        const menPreferenceRank = buildRankingMap(men.map(p => p.id))

        const usedPairs = new Set<string>()
        const pairKey = (a: string, b: string) =>
            a < b ? `${a}::${b}` : `${b}::${a}`

        const stableMatchForSlot = (timeSlot: number) => {
            const proposers = women.map(w => w.id)
            const receivers = new Set(men.map(m => m.id))

            const nextIndex: Record<string, number> = {}
            const engagedTo: Record<string, string> = {}
            const free: string[] = [...proposers]

            proposers.forEach(p => (nextIndex[p] = 0))

            while (free.length > 0) {
                const proposer = free.shift()
                if (!proposer) break

                const prefs = preferences[proposer] || []
                let proposed = false

                while (nextIndex[proposer] < prefs.length) {
                    const receiver = prefs[nextIndex[proposer]]
                    nextIndex[proposer] += 1

                    if (!receivers.has(receiver)) continue
                    if (!isMutuallyCompatible(proposer, receiver)) continue
                    if (usedPairs.has(pairKey(proposer, receiver))) continue

                    const receiverRank = menPreferenceRank[receiver] || {}
                    if (receiverRank[proposer] === undefined) {
                        continue
                    }

                    proposed = true

                    const current = engagedTo[receiver]
                    if (!current) {
                        engagedTo[receiver] = proposer
                        break
                    }

                    const currentRank = receiverRank[current]
                    const newRank = receiverRank[proposer]

                    const prefersNew =
                        newRank !== undefined &&
                        (currentRank === undefined || newRank < currentRank)

                    if (prefersNew) {
                        engagedTo[receiver] = proposer
                        free.push(current)
                        break
                    }
                }

                if (!proposed) {
                    // proposer exhausted options for this slot
                    continue
                }
            }

            const pairs: Array<[string, string]> = []
            for (const [receiver, proposer] of Object.entries(engagedTo)) {
                pairs.push([proposer, receiver])
            }

            return pairs
        }

        // Create dates using stable matching (women propose) per time slot
        let totalDates = 0
        const createdDates: Array<{ participant1: string; participant2: string; timeSlot: number }> = []

        for (let timeSlot = 1; timeSlot <= 7; timeSlot++) {
            console.log(`\n--- Time Slot ${timeSlot} ---`)

            const pairs = stableMatchForSlot(timeSlot)

            for (const [participant1Id, participant2Id] of pairs) {
                const p1 = participantMap.get(participant1Id)
                const p2 = participantMap.get(participant2Id)

                if (!p1 || !p2) continue

                const key = pairKey(participant1Id, participant2Id)
                if (usedPairs.has(key)) continue

                try {
                    await prisma.date.create({
                        data: {
                            participant1Id,
                            participant2Id,
                            timeSlot,
                            sessionId,
                        },
                    })

                    usedPairs.add(key)
                    console.log(`✓ Created date: ${p1.name} ↔ ${p2.name} (Slot ${timeSlot})`)
                    totalDates++
                    createdDates.push({
                        participant1: p1.name,
                        participant2: p2.name,
                        timeSlot,
                    })
                } catch (err) {
                    console.error(`Failed to create date:`, err)
                }
            }
        }

        console.log(`\n=== DATE GENERATION COMPLETE ===`)
        console.log(`Total dates created: ${totalDates}`)

        // Generate CSV content
        const csvHeaders = ['Time Slot', 'Participant 1', 'Participant 2']
        const csvRows = createdDates.map(d => [
            d.timeSlot,
            d.participant1,
            d.participant2
        ])
        const csvContent = [
            csvHeaders.join(','),
            ...csvRows.map(row => row.map(cell => `"${cell}"`).join(','))
        ].join('\n')

        return NextResponse.json({
            success: true,
            datesCreated: totalDates,
            message: `Successfully generated ${totalDates} dates!`,
            dates: createdDates,
            csvContent,
        })
    } catch (error) {
        console.error('Date generation error:', error)
        return NextResponse.json(
            { error: 'Failed to generate dates' },
            { status: 500 }
        )
    }
}
