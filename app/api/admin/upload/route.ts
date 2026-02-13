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
        }) as Record<string, string>[]

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

        const getField = (row: Record<string, string>, keys: string[]) => {
            for (const key of keys) {
                const value = row[key]
                if (typeof value === 'string' && value.trim()) {
                    return value.trim()
                }
            }
            return ''
        }

        const normalizeSex = (value: string) => {
            const v = value.toLowerCase()
            if (/\b(woman|female|women)\b/.test(v)) return 'female'
            if (/\b(man|male|men)\b/.test(v)) return 'male'
            return 'other'
        }

        const parsePartnerPrefs = (value: string) => {
            const tokens = value
                .split(',')
                .map((s) => s.trim().toLowerCase())
                .filter((s) => s)

            const prefs = new Set<string>()
            for (const token of tokens) {
                if (/\b(woman|female|women)\b/.test(token)) prefs.add('female')
                if (/\b(man|male|men)\b/.test(token)) prefs.add('male')
            }

            return prefs.size > 0 ? Array.from(prefs) : ['other']
        }

        const parseTimestamp = (value: string) => {
            const time = Date.parse(value)
            return Number.isNaN(time) ? 0 : time
        }

        const uniqueByEmail = new Map<string, Record<string, string>>()
        for (const row of arrivedParticipants) {
            const email = getField(row, ['Email Address', 'Email'])
            if (!email) continue

            const key = email.toLowerCase()
            const existing = uniqueByEmail.get(key)

            if (!existing) {
                uniqueByEmail.set(key, row)
                continue
            }

            const currentTime = parseTimestamp(getField(row, ['Timestamp']))
            const existingTime = parseTimestamp(getField(existing, ['Timestamp']))

            if (currentTime >= existingTime) {
                uniqueByEmail.set(key, row)
            }
        }

        const rows = Array.from(uniqueByEmail.values())

        // Insert participants
        const created = await Promise.all(
            rows.map((row) => {
                const name = getField(row, ['Name', '❤️ Name ❤️'])
                const email = getField(row, ['Email Address', 'Email'])
                const sexRaw = getField(row, ['Sex', '❤️ Gender ❤️'])
                const partnerPrefRaw = getField(row, [
                    'Partner Sex Preference',
                    'Partner sex preference',
                    '❤️ Preference in Partners ❤️',
                ])
                const aboutMe = getField(row, ['About Me', '❤️ About You ❤️'])
                const lookingFor = getField(row, ['Looking For', '❤️ Looking For ❤️'])
                const personality = getField(row, ['Personality', '❤️ Personality ❤️'])

                const sexPrefs = parsePartnerPrefs(partnerPrefRaw)

                return prisma.participant.create({
                    data: {
                        name: name || 'Unknown',
                        email,
                        sex: normalizeSex(sexRaw),
                        partnerSexPref: sexPrefs.length > 0 ? sexPrefs : ['other'],
                        aboutMe,
                        lookingFor,
                        personality,
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
