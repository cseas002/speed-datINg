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

        // Get all participants (not matches - we'll pair them for each time slot)
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

        // Create dates using round-robin scheduling
        // Each participant dates different people in each time slot
        let totalDates = 0
        const createdDates: Array<{ participant1: string; participant2: string; timeSlot: number }> = []

        // Round-robin pairing algorithm
        const participantIds = participants.map(p => p.id)
        const n = participantIds.length
        
        for (let timeSlot = 1; timeSlot <= 7; timeSlot++) {
            console.log(`\n--- Time Slot ${timeSlot} ---`)
            
            // Create rotation for this time slot
            // Rotate participants to create different pairings each round
            const rotated = [...participantIds]
            
            // Rotate array by (timeSlot - 1) positions
            for (let i = 0; i < timeSlot - 1; i++) {
                const last = rotated.pop()
                if (last) rotated.unshift(last)
            }
            
            // Pair participants: first with last, second with second-last, etc.
            for (let i = 0; i < Math.floor(n / 2); i++) {
                const participant1Id = rotated[i]
                const participant2Id = rotated[n - 1 - i]
                
                const p1 = participants.find(p => p.id === participant1Id)
                const p2 = participants.find(p => p.id === participant2Id)
                
                if (p1 && p2) {
                    try {
                        await prisma.date.create({
                            data: {
                                participant1Id,
                                participant2Id,
                                timeSlot,
                                sessionId,
                            },
                        })
                        
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
