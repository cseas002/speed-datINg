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
        const totalSlots = 5
        const normalizeSex = (value: string | null | undefined) =>
            (value || '').trim().toLowerCase()

        const normalizeSexList = (values: string[] | null | undefined) =>
            (values || []).map(normalizeSex).filter(Boolean)

        const isMutuallyCompatible = (aId: string, bId: string) => {
            const a = participantMap.get(aId)
            const b = participantMap.get(bId)
            if (!a || !b) return false
            const aSex = normalizeSex(a.sex)
            const bSex = normalizeSex(b.sex)
            const aPrefs = normalizeSexList(a.partnerSexPref)
            const bPrefs = normalizeSexList(b.partnerSexPref)
            return aPrefs.includes(bSex) && bPrefs.includes(aSex)
        }

        const preferences: Record<string, string[]> = {}
        for (const match of matches) {
            if (!isMutuallyCompatible(match.fromId, match.toId)) continue
            if (!preferences[match.fromId]) preferences[match.fromId] = []
            if (preferences[match.fromId].length < 7) {
                preferences[match.fromId].push(match.toId)
            }
        }

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
        const participantPreferenceRank = buildRankingMap(participants.map(p => p.id))

        const usedPairs = new Set<string>()
        const pairKey = (a: string, b: string) =>
            a < b ? `${a}::${b}` : `${b}::${a}`

        const totalCompatibleCounts: Record<string, number> = {}
        for (const p of participants) {
            let count = 0
            for (const other of participants) {
                if (other.id === p.id) continue
                if (isMutuallyCompatible(p.id, other.id)) count += 1
            }
            totalCompatibleCounts[p.id] = count
        }

        const earliestAllowedSlot = (id: string) => {
            const compatibleCount = Math.min(totalCompatibleCounts[id] || 0, totalSlots)
            return Math.max(1, totalSlots - compatibleCount + 1)
        }

        const isAllowedInSlot = (id: string, timeSlot: number) =>
            timeSlot >= earliestAllowedSlot(id)

        const getRemainingOptionsCount = (id: string, eligibleIds: Set<string>) => {
            let count = 0
            for (const other of participants) {
                if (other.id === id) continue
                if (!eligibleIds.has(other.id)) continue
                if (!isMutuallyCompatible(id, other.id)) continue
                if (usedPairs.has(pairKey(id, other.id))) continue
                count += 1
            }
            return count
        }

        const buildPairsForSlot = (timeSlot: number, dateCounts: Record<string, number>) => {
            const eligibleIds = new Set(
                participants
                    .map(p => p.id)
                    .filter(id => isAllowedInSlot(id, timeSlot))
            )

            const eligibleList = [...eligibleIds]

            const sortedIds = [...eligibleList].sort((a, b) => {
                const aDates = dateCounts[a] || 0
                const bDates = dateCounts[b] || 0
                if (aDates !== bDates) return aDates - bDates

                const aCompat = totalCompatibleCounts[a] || 0
                const bCompat = totalCompatibleCounts[b] || 0
                if (timeSlot >= 4 && aCompat !== bCompat) return aCompat - bCompat
                if (timeSlot < 4 && aCompat !== bCompat) return bCompat - aCompat

                const aOptions = getRemainingOptionsCount(a, eligibleIds)
                const bOptions = getRemainingOptionsCount(b, eligibleIds)
                return timeSlot >= 4 ? aOptions - bOptions : bOptions - aOptions
            })

            const usedThisSlot = new Set<string>()
            const pairs: Array<[string, string]> = []

            const priorityIds = sortedIds.filter(
                id => earliestAllowedSlot(id) === timeSlot
            )

            const getCandidates = (a: string) =>
                sortedIds.filter(b =>
                    b !== a &&
                    !usedThisSlot.has(b) &&
                    isMutuallyCompatible(a, b) &&
                    !usedPairs.has(pairKey(a, b))
                )

            const choosePartner = (a: string) => {
                const candidates = getCandidates(a)
                    .sort((b1, b2) => {
                        const rankMap = participantPreferenceRank[a] || {}
                        const r1 = rankMap[b1] ?? Number.MAX_SAFE_INTEGER
                        const r2 = rankMap[b2] ?? Number.MAX_SAFE_INTEGER
                        if (r1 !== r2) return r1 - r2

                        const b1Dates = dateCounts[b1] || 0
                        const b2Dates = dateCounts[b2] || 0
                        if (b1Dates !== b2Dates) return b1Dates - b2Dates

                        const b1Compat = totalCompatibleCounts[b1] || 0
                        const b2Compat = totalCompatibleCounts[b2] || 0
                        return timeSlot >= 4 ? b1Compat - b2Compat : b2Compat - b1Compat
                    })

                return candidates[0]
            }

            const singletonPriorityIds = priorityIds.filter(id => {
                if (usedThisSlot.has(id)) return false
                return getCandidates(id).length === 1
            })

            for (const a of singletonPriorityIds) {
                if (usedThisSlot.has(a)) continue
                const onlyPartner = getCandidates(a)[0]
                if (!onlyPartner || usedThisSlot.has(onlyPartner)) continue
                pairs.push([a, onlyPartner])
                usedThisSlot.add(a)
                usedThisSlot.add(onlyPartner)
            }

            for (const a of priorityIds) {
                if (usedThisSlot.has(a)) continue
                const b = choosePartner(a)
                if (!b) continue
                pairs.push([a, b])
                usedThisSlot.add(a)
                usedThisSlot.add(b)
            }

            for (const a of sortedIds) {
                if (usedThisSlot.has(a)) continue

                const b = choosePartner(a)
                if (!b) continue

                pairs.push([a, b])
                usedThisSlot.add(a)
                usedThisSlot.add(b)
            }

            return pairs
        }

        const addFallbackPairs = (
            existingPairs: Array<[string, string]>,
            dateCounts: Record<string, number>,
            timeSlot: number
        ) => {
            const matchedIds = new Set<string>()
            existingPairs.forEach(([a, b]) => {
                matchedIds.add(a)
                matchedIds.add(b)
            })

            const remaining = participants
                .map(p => p.id)
                .filter(id => !matchedIds.has(id))
                .filter(id => isAllowedInSlot(id, timeSlot))
                .sort((a, b) => (dateCounts[a] || 0) - (dateCounts[b] || 0))

            const newPairs: Array<[string, string]> = []
            const usedInFallback = new Set<string>()

            for (let i = 0; i < remaining.length; i++) {
                const a = remaining[i]
                if (usedInFallback.has(a)) continue

                const candidates = remaining
                    .slice(i + 1)
                    .filter(b =>
                        !usedInFallback.has(b) &&
                        isMutuallyCompatible(a, b) &&
                        !usedPairs.has(pairKey(a, b))
                    )
                    .sort((b1, b2) => {
                        const b1Dates = dateCounts[b1] || 0
                        const b2Dates = dateCounts[b2] || 0
                        if (b1Dates !== b2Dates) return b1Dates - b2Dates
                        const b1Compat = totalCompatibleCounts[b1] || 0
                        const b2Compat = totalCompatibleCounts[b2] || 0
                        return timeSlot >= 4 ? b1Compat - b2Compat : b2Compat - b1Compat
                    })

                const b = candidates[0]
                if (!b) continue

                newPairs.push([a, b])
                usedInFallback.add(a)
                usedInFallback.add(b)
            }

            return [...existingPairs, ...newPairs]
        }

        // Create dates using stable matching (women propose) per time slot
        let totalDates = 0
        const createdDates: Array<{ participant1: string; participant2: string; timeSlot: number; participant1Id: string; participant2Id: string }> = []
        const unmatchedBySlot: Record<number, string[]> = {}

        const dateCounts: Record<string, number> = {}
        participants.forEach(p => {
            dateCounts[p.id] = 0
        })

        for (let timeSlot = 1; timeSlot <= totalSlots; timeSlot++) {
            console.log(`\n--- Time Slot ${timeSlot} ---`)

            const pairs = addFallbackPairs(buildPairsForSlot(timeSlot, dateCounts), dateCounts, timeSlot)

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
                    dateCounts[participant1Id] = (dateCounts[participant1Id] || 0) + 1
                    dateCounts[participant2Id] = (dateCounts[participant2Id] || 0) + 1
                    createdDates.push({
                        participant1: p1.name,
                        participant2: p2.name,
                        timeSlot,
                        participant1Id,
                        participant2Id,
                    })
                } catch (err) {
                    console.error(`Failed to create date:`, err)
                }
            }

            const matchedIds = new Set<string>()
            pairs.forEach(([participant1Id, participant2Id]) => {
                matchedIds.add(participant1Id)
                matchedIds.add(participant2Id)
            })
            unmatchedBySlot[timeSlot] = participants
                .filter(p => !matchedIds.has(p.id))
                .map(p => p.name)
        }

        console.log(`\n=== DATE GENERATION COMPLETE ===`)
        console.log(`Total dates created: ${totalDates}`)

        // Identify unmatched participants
        const unmatchedParticipants = participants
            .filter(p => (dateCounts[p.id] || 0) === 0)
            .map(p => p.name)

        // Generate CSV content
        const csvHeaders = ['Time Slot', 'Participant 1', 'Participant 2']
        const csvRows = createdDates.map(d => [
            d.timeSlot,
            d.participant1,
            d.participant2
        ])
        const csvLines = [
            csvHeaders.join(','),
            ...csvRows.map(row => row.map(cell => `"${cell}"`).join(','))
        ]
        if (unmatchedParticipants.length > 0) {
            csvLines.push('')
            csvLines.push('Unmatched Participants (All Slots)')
            unmatchedParticipants.forEach(name => {
                csvLines.push(`"${name}"`)
            })
        }

        csvLines.push('')
        csvLines.push('Unmatched Participants By Time Slot')
        for (let timeSlot = 1; timeSlot <= totalSlots; timeSlot++) {
            csvLines.push(`Time Slot ${timeSlot}`)
            const names = unmatchedBySlot[timeSlot] || []
            if (names.length === 0) {
                csvLines.push('"(none)"')
                continue
            }
            names.forEach(name => {
                csvLines.push(`"${name}"`)
            })
        }
        const csvContent = csvLines.join('\n')

        return NextResponse.json({
            success: true,
            datesCreated: totalDates,
            message: `Successfully generated ${totalDates} dates!`,
            dates: createdDates,
            unmatchedParticipants,
            unmatchedBySlot,
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
