import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import OpenAI from 'openai'
import { prisma } from '@/lib/db'
import { verifyAdminSession } from '@/lib/auth'

async function verifyAdminCookie() {
    const cookieStore = await cookies()
    const adminToken = cookieStore.get('adminToken')
    if (!adminToken?.value) return false
    const session = await verifyAdminSession(adminToken.value)
    return !!session
}

function cleanResponseContent(content: string): string {
    try {
        let cleaned = content.trim()
        let boxedRemoved = false

        if (/^\\boxed\s*{/.test(cleaned)) {
            cleaned = cleaned.replace(/^\\boxed\s*{[\r\n]*/, '')
            boxedRemoved = true
        }
        if (boxedRemoved) {
            cleaned = cleaned.replace(/[\r\n]*\s*}$/, '')
        }
        cleaned = cleaned.replace(/^```json[\r\n]*/, '').replace(/[\r\n]*```$/, '')
        cleaned = cleaned.replace(/^```[\r\n]*/, '').replace(/[\r\n]*```$/, '')

        // Try to find JSON array or object
        const jsonMatch = cleaned.match(/\[[\s\S]*\]|\{[\s\S]*\}/)
        if (!jsonMatch || !jsonMatch[0]) {
            throw new Error('Could not find JSON structure')
        }

        const potentialJson = jsonMatch[0]
        JSON.parse(potentialJson)
        return potentialJson
    } catch (error) {
        console.error('Error cleaning response:', error)
        throw error
    }
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
        const participants = await prisma.participant.findMany()
        console.log(`Starting match generation for ${participants.length} participants`)

        if (participants.length < 2) {
            return NextResponse.json(
                { error: 'Not enough participants for matching' },
                { status: 400 }
            )
        }

        // Clear existing matches
        await prisma.match.deleteMany({})
        console.log('Cleared existing matches from database')

        const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY
        if (!DEEPSEEK_API_KEY) {
            return NextResponse.json(
                { error: 'DeepSeek API key not configured' },
                { status: 500 }
            )
        }

        const openai = new OpenAI({
            apiKey: DEEPSEEK_API_KEY,
            baseURL: 'https://openrouter.ai/api/v1',
        })

        // Process each participant
        let totalMatches = 0
        const matchResults: Array<{ name: string; matchCount: number; topMatch: string | null }> = []

        for (const person of participants) {
            console.log(`\n--- Generating matches for ${person.name} ---`)

            // Find potential matches based on sex preference
            const potentialMatches = participants.filter(
                (p) =>
                    p.id !== person.id &&
                    p.partnerSexPref.includes(person.sex) && // They want your sex
                    person.partnerSexPref.includes(p.sex) // You want their sex
            )

            if (potentialMatches.length === 0) {
                console.log(`No compatible potential matches for ${person.name}`)
                continue
            }

            console.log(`Found ${potentialMatches.length} potential matches for ${person.name}`)

            // Create anonymous mapping for privacy (don't send names to API)
            const personId = `person_${person.id}`
            const idToParticipantMap: { [key: string]: typeof person } = {
                [personId]: person,
            }
            const potentialMatchIds = potentialMatches.map((m, idx) => `match_${idx}`)
            potentialMatches.forEach((m, idx) => {
                idToParticipantMap[potentialMatchIds[idx]] = m
            })

            // Create prompt for matching with anonymized IDs
            const prompt = `You are a speed dating expert. Match the following person with their top 7 most compatible matches from the list.

PERSON TO MATCH:
ID: ${personId}
About: ${person.aboutMe}
What they want: ${person.lookingFor}
Personality: ${person.personality}

POTENTIAL MATCHES (${potentialMatches.length} available):
${potentialMatches
                    .map(
                        (m, idx) => `
ID: ${potentialMatchIds[idx]}
About: ${m.aboutMe}
What they want: ${m.lookingFor}
Personality: ${m.personality}
`
                    )
                    .join('\n')}

Rank the top 7 matches from 1 (best match) to 7 (least compatible of the top 7).
For each match, provide a brief reason focusing on specific compatibility points.

Return as JSON array:
[
  {
    "id": "match_0",
    "rank": 1,
    "reason": "specific compatibility reason"
  },
  ...
]`

            try {
                const completion = await openai.chat.completions.create({
                    model: 'tngtech/deepseek-r1t2-chimera:free',
                    messages: [
                        {
                            role: 'system',
                            content:
                                'You are a speed dating expert. Return only valid JSON array without code blocks or formatting. Use the IDs provided.',
                        },
                        {
                            role: 'user',
                            content: prompt,
                        },
                    ],
                    response_format: { type: 'json_object' },
                })

                const content = completion.choices[0].message?.content
                if (!content) {
                    console.warn(`No response from AI for ${person.name}`)
                    continue
                }

                console.log(`Received AI response for ${person.name}`)

                let matches: Array<{ id: string; rank: number; reason: string }>
                try {
                    const cleaned = cleanResponseContent(content)
                    const parsed = JSON.parse(cleaned)
                    // Handle case where response is wrapped in object
                    matches = Array.isArray(parsed) ? parsed : parsed.matches || parsed.recommendations || []
                } catch {
                    console.error('Failed to parse AI response:', content)
                    continue
                }

                if (!Array.isArray(matches) || matches.length === 0) {
                    console.warn(`No valid matches found for ${person.name}`)
                    continue
                }

                console.log(`Parsed ${matches.length} matches for ${person.name}`)
                let personMatches = 0
                for (const match of matches.slice(0, 7)) {
                    const matchedParticipant = idToParticipantMap[match.id]

                    if (matchedParticipant) {
                        try {
                            // Verify both participants still exist before creating match
                            const fromExists = await prisma.participant.findUnique({
                                where: { id: person.id }
                            })
                            const toExists = await prisma.participant.findUnique({
                                where: { id: matchedParticipant.id }
                            })

                            if (!fromExists || !toExists) {
                                console.warn(`Skipping match: participant not found (from: ${fromExists ? 'ok' : 'missing'}, to: ${toExists ? 'ok' : 'missing'})`)
                                continue
                            }

                            // Check if match already exists to avoid duplicate key error
                            const existingMatch = await prisma.match.findUnique({
                                where: {
                                    fromId_toId: {
                                        fromId: person.id,
                                        toId: matchedParticipant.id
                                    }
                                }
                            })

                            if (existingMatch) {
                                console.warn(`Match already exists between ${person.name} and ${matchedParticipant.name}`)
                                continue
                            }

                            await prisma.match.create({
                                data: {
                                    fromId: person.id,
                                    toId: matchedParticipant.id,
                                    rank: match.rank,
                                    reasoning: match.reason,
                                },
                            })
                            console.log(`✓ Created match: ${person.name} → ${matchedParticipant.name} (rank ${match.rank})`)
                            totalMatches++
                            personMatches++
                        } catch (matchError) {
                            console.error(`Failed to create match between ${person.name} and ${matchedParticipant.name}:`, matchError)
                            continue
                        }
                    }
                }

                if (personMatches > 0) {
                    const topMatchName = matches[0] ? idToParticipantMap[matches[0].id]?.name || 'unknown' : null
                    matchResults.push({
                        name: person.name,
                        matchCount: personMatches,
                        topMatch: topMatchName
                    })
                    console.log(`Summary: ${person.name} matched with ${personMatches} people (top match: ${topMatchName})`)
                }
            } catch (error) {
                console.error(`Error matching for ${person.name}:`, error)
                continue
            }
        }

        console.log(`\n=== MATCHING COMPLETE ===`)
        console.log(`Total matches created: ${totalMatches}`)
        console.log(`People with matches: ${matchResults.length}`)
        matchResults.forEach(result => {
            console.log(`  • ${result.name}: ${result.matchCount} matches (top: ${result.topMatch})`)
        })

        return NextResponse.json({
            success: true,
            matchesCreated: totalMatches,
            message: `Successfully created ${totalMatches} matches for ${matchResults.length} participants`,
            results: matchResults,
        })
    } catch (error) {
        console.error('Matching error:', error)
        return NextResponse.json(
            { error: 'Failed to generate matches' },
            { status: 500 }
        )
    }
}
