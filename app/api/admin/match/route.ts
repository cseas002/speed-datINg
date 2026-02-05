import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import OpenAI from 'openai'
import { GoogleGenAI } from '@google/genai'
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
        const USE_GEMINI = true
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
        const GEMINI_API_KEY = process.env.GEMINI_API_KEY

        if (USE_GEMINI) {
            if (!GEMINI_API_KEY) {
                return NextResponse.json(
                    { error: 'Gemini API key not configured' },
                    { status: 500 }
                )
            }
        } else if (!DEEPSEEK_API_KEY) {
            return NextResponse.json(
                { error: 'DeepSeek API key not configured' },
                { status: 500 }
            )
        }

        const openai = !USE_GEMINI
            ? new OpenAI({
                apiKey: DEEPSEEK_API_KEY,
                baseURL: 'https://openrouter.ai/api/v1',
            })
            : null

        const gemini = USE_GEMINI ? new GoogleGenAI({ apiKey: GEMINI_API_KEY || '' }) : null

        // Process each participant
        let totalMatches = 0
        const matchResults: Array<{ name: string; matchCount: number; topMatch: string | null }> = []

        const processPerson = async (person: typeof participants[number]) => {
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
                return
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
            const prompt = `You are a speed dating expert. Match the following person with their top 5 most compatible matches from the list.

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

Rank the top 5 matches from 1 (best match) to 5 (least compatible of the top 5).
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
                const maxAttempts = 3
                let matches: Array<{ id: string; rank: number; reason: string }> = []

                for (let attempt = 1; attempt <= maxAttempts; attempt++) {
                    let content: string | null | undefined

                    if (USE_GEMINI && gemini) {
                        const response = await gemini.models.generateContent({
                            model: 'gemma-3-27b-it',
                            contents:
                                'You are a speed dating expert. Return only valid JSON array without code blocks or formatting. Use the IDs provided.\n\n' +
                                prompt,
                        })
                        content = response.text ?? undefined
                    } else if (openai) {
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

                        content = completion.choices[0].message?.content
                    }
                    if (!content) {
                        console.warn(`No response from AI for ${person.name} (attempt ${attempt})`)
                        continue
                    }

                    console.log(`Received AI response for ${person.name} (attempt ${attempt})`)

                    try {
                        const cleaned = cleanResponseContent(content)
                        const parsed = JSON.parse(cleaned)
                        // Handle case where response is wrapped in object
                        matches = Array.isArray(parsed) ? parsed : parsed.matches || parsed.recommendations || []
                    } catch {
                        console.error('Failed to parse AI response:', content)
                        matches = []
                    }

                    if (Array.isArray(matches) && matches.length >= 5) {
                        break
                    }

                    if (!Array.isArray(matches) || matches.length === 0) {
                        console.warn(`No valid matches found for ${person.name} (attempt ${attempt})`)
                    } else {
                        console.warn(`Only ${matches.length} matches found for ${person.name} (attempt ${attempt})`)
                    }
                }

                if (!Array.isArray(matches)) {
                    matches = []
                }

                const uniqueMatches: Array<{ id: string; rank: number; reason: string }> = []
                const seenIds = new Set<string>()
                for (const match of matches) {
                    if (!match?.id || seenIds.has(match.id)) continue
                    if (!idToParticipantMap[match.id]) continue
                    seenIds.add(match.id)
                    uniqueMatches.push(match)
                }

                if (uniqueMatches.length < 5) {
                    const fallbackIds = potentialMatchIds.filter(id => !seenIds.has(id))
                    for (const fallbackId of fallbackIds) {
                        if (uniqueMatches.length >= 5) break
                        uniqueMatches.push({
                            id: fallbackId,
                            rank: uniqueMatches.length + 1,
                            reason: 'Fallback selection based on mutual compatibility.',
                        })
                        seenIds.add(fallbackId)
                    }
                }

                if (uniqueMatches.length === 0) {
                    console.warn(`No valid matches found for ${person.name}`)
                    return
                }

                console.log(`Parsed ${uniqueMatches.length} matches for ${person.name}`)
                let personMatches = 0
                for (const [index, match] of uniqueMatches.slice(0, 5).entries()) {
                    const matchedParticipant = idToParticipantMap[match.id]

                    if (matchedParticipant) {
                        try {
                            const resolvedRank = Number.isFinite(match.rank) ? match.rank : index + 1
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
                                    rank: resolvedRank,
                                    reasoning: match.reason,
                                },
                            })
                            console.log(`✓ Created match: ${person.name} → ${matchedParticipant.name} (rank ${resolvedRank})`)
                            totalMatches++
                            personMatches++
                        } catch (matchError) {
                            console.error(`Failed to create match between ${person.name} and ${matchedParticipant.name}:`, matchError)
                            continue
                        }
                    }
                }

                if (personMatches > 0) {
                    const topMatchName = uniqueMatches[0] ? idToParticipantMap[uniqueMatches[0].id]?.name || 'unknown' : null
                    matchResults.push({
                        name: person.name,
                        matchCount: personMatches,
                        topMatch: topMatchName
                    })
                    console.log(`Summary: ${person.name} matched with ${personMatches} people (top match: ${topMatchName})`)
                }
            } catch (error) {
                console.error(`Error matching for ${person.name}:`, error)
                return
            }
        }

        if (USE_GEMINI) {
            const RATE_LIMIT_PER_MIN = 30
            const MIN_DELAY_MS = Math.ceil(60000 / RATE_LIMIT_PER_MIN)
            const tasks = participants.map((person, index) =>
                (async () => {
                    await new Promise(resolve => setTimeout(resolve, index * MIN_DELAY_MS))
                    await processPerson(person)
                })()
            )
            await Promise.all(tasks)
        } else {
            for (const person of participants) {
                await processPerson(person)
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
