import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { parse } from 'csv-parse/sync'
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
        // Verify admin
        const isAdmin = await verifyAdminCookie()
        if (!isAdmin) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            )
        }

        const formData = await request.formData()
        const file = formData.get('file') as File

        if (!file) {
            return NextResponse.json(
                { error: 'No file provided' },
                { status: 400 }
            )
        }

        // Read file
        const buffer = await file.arrayBuffer()
        const text = new TextDecoder().decode(buffer)
        const data = parse(text, {
            columns: true,
            skip_empty_lines: true,
        }) as {
            Name: string
            'Email Address': string
            Sex: string
            'Partner Sex Preference': string
            'About Me': string
            'Looking For': string
            Personality: string
            Arrived: string
        }[]

        if (!data || data.length === 0) {
            return NextResponse.json(
                { error: 'No data in CSV file' },
                { status: 400 }
            )
        }

        // Filter for arrived participants only
        const arrivedParticipants = data.filter(
            (row) => {
                if (typeof row.Arrived === 'string') {
                    return row.Arrived.toLowerCase() === 'yes'
                }
                return row.Arrived === true
            }
        )

        if (arrivedParticipants.length === 0) {
            return NextResponse.json(
                { error: 'No participants marked as arrived' },
                { status: 400 }
            )
        }

        // Clear existing participants
        await prisma.participant.deleteMany({})

        // Insert participants
        const created = await Promise.all(
            arrivedParticipants.map((row) => {
                // Parse sex preferences - handle "Male, Female" format
                const sexPrefStr = row['Partner Sex Preference'] || ''
                const sexPrefs = sexPrefStr
                    .split(',')
                    .map((s) => s.trim().toLowerCase())
                    .filter((s) => s)

                return prisma.participant.create({
                    data: {
                        name: row.Name || 'Unknown',
                        email: row['Email Address'],
                        sex: row.Sex?.toLowerCase() || 'other',
                        partnerSexPref: sexPrefs.length > 0 ? sexPrefs : ['other'],
                        aboutMe: row['About Me'] || '',
                        lookingFor: row['Looking For'] || '',
                        personality: row.Personality || '',
                        arrived: true,
                    },
                })
            })
        )

        return NextResponse.json({
            success: true,
            participantsCreated: created.length,
            message: `Successfully imported ${created.length} participants`,
        })
    } catch (error) {
        console.error('Upload error:', error)
        return NextResponse.json(
            { error: 'Failed to upload file' },
            { status: 500 }
        )
    }
}
