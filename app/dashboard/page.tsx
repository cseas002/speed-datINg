'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'

interface Participant {
    id: string
    name: string
    age: number
    sex: string
    partnerSexPref: string
    aboutMe: string
    lookingFor: string
    personality: string
}

interface Match {
    id: string
    toId: string
    to: Participant
    rank: number
    reasoning: string
}

interface UserRanking {
    id: string
    rankedId: string
    score: number
    note?: string | null
}

interface DateParticipant {
    id: string
    name: string
    age: number
    sex: string
}

interface DateEntry {
    id: string
    timeSlot: number
    participant1Id: string
    participant2Id: string
    participant1: DateParticipant
    participant2: DateParticipant
}

export default function Dashboard() {
    const router = useRouter()
    const [user, setUser] = useState<Participant | null>(null)
    const [matches, setMatches] = useState<Match[]>([])
    const [dates, setDates] = useState<DateEntry[]>([])
    const [rankings, setRankings] = useState<UserRanking[]>([])
    const [tab, setTab] = useState<'profile' | 'ranking' | 'ai' | 'results'>('profile')
    const [loading, setLoading] = useState(true)
    const [isSidebarOpen, setIsSidebarOpen] = useState(false)
    const [isPublished, setIsPublished] = useState(false)
    const [newRankings, setNewRankings] = useState<Record<string, number>>({})
    const [rankingNotes, setRankingNotes] = useState<Record<string, string>>({})
    const [savingRankings, setSavingRankings] = useState(false)

    useEffect(() => {
        const fetchData = async () => {
            try {
                // Fetch user profile
                const userRes = await fetch('/api/user/profile')
                if (!userRes.ok) {
                    router.push('/')
                    return
                }
                const userData = await userRes.json()
                setUser(userData.user)

                // Fetch matches
                const matchesRes = await fetch('/api/user/matches')
                const matchesData = await matchesRes.json()
                setMatches(matchesData.matches || [])
                setIsPublished(matchesData.isPublished || false)

                // Fetch dates
                const datesRes = await fetch('/api/user/dates')
                const datesData = await datesRes.json()
                setDates(datesData.dates || [])

                // Fetch rankings
                const rankingsRes = await fetch('/api/user/rankings')
                const rankingsData = await rankingsRes.json()
                setRankings(rankingsData.rankings || [])

                // Initialize newRankings with existing values
                const rankings_map: Record<string, number> = {}
                const notes_map: Record<string, string> = {}
                rankingsData.rankings?.forEach((r: UserRanking) => {
                    rankings_map[r.rankedId] = r.score
                    if (r.note) {
                        notes_map[r.rankedId] = r.note
                    }
                })
                setNewRankings(rankings_map)
                setRankingNotes(notes_map)
            } catch (err) {
                console.error('Failed to fetch data:', err)
            } finally {
                setLoading(false)
            }
        }

        fetchData()
    }, [router])

    const handleRankingChange = (rankedId: string, score: number) => {
        setNewRankings(prev => ({
            ...prev,
            [rankedId]: score
        }))
    }

    const handleNoteChange = (rankedId: string, note: string) => {
        setRankingNotes(prev => ({
            ...prev,
            [rankedId]: note
        }))
    }

    const getDatePartner = (date: DateEntry) => {
        if (!user) return null
        return date.participant1Id === user.id ? date.participant2 : date.participant1
    }

    const getTimeSlotLabel = (slot: number) => {
        const labels = ['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh']
        return labels[slot - 1] || `#${slot}`
    }

    const datedParticipants = dates
        .map(date => {
            const partner = getDatePartner(date)
            if (!partner) return null
            return {
                date,
                partner,
                score: newRankings[partner.id] ?? 5,
            }
        })
        .filter(Boolean) as Array<{ date: DateEntry; partner: DateParticipant; score: number }>

    const userRankingTable = [...datedParticipants]
        .sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score
            return a.date.timeSlot - b.date.timeSlot
        })
        .map((entry, index) => ({
            position: index + 1,
            name: entry.partner.name,
        }))

    const aiRankingTable = [...matches]
        .sort((a, b) => a.rank - b.rank)
        .map(match => ({
            position: match.rank,
            name: match.to.name,
        }))

    const handleSaveRankings = async () => {
        setSavingRankings(true)
        try {
            const payloadRankings = dates.reduce((acc, date) => {
                const partner = getDatePartner(date)
                if (!partner) return acc

                acc[partner.id] = {
                    score: newRankings[partner.id] ?? 5,
                    note: rankingNotes[partner.id] || undefined,
                }

                return acc
            }, {} as Record<string, { score: number; note?: string }>)

            const res = await fetch('/api/user/rank', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ rankings: payloadRankings }),
            })

            if (!res.ok) {
                console.error('Failed to save rankings')
                return
            }

            // Fetch updated rankings
            const rankingsRes = await fetch('/api/user/rankings')
            const rankingsData = await rankingsRes.json()
            setRankings(rankingsData.rankings || [])
        } catch (err) {
            console.error('Failed to save rankings:', err)
        } finally {
            setSavingRankings(false)
        }
    }

    const downloadResultsCSV = () => {
        // Create mapping of participant IDs to names for both rankings
        const userRankingMap: Record<string, number> = {}
        const aiRankingMap: Record<string, number> = {}
        const nameMap: Record<string, string> = {}

        // Build user ranking map
        datedParticipants.forEach(({ partner, score }) => {
            userRankingMap[partner.id] = score
            nameMap[partner.id] = partner.name
        })

        // Build AI ranking map
        matches.forEach(match => {
            aiRankingMap[match.toId] = match.rank
            nameMap[match.toId] = match.to.name
        })

        // Combine all participants
        const allIds = new Set([...Object.keys(userRankingMap), ...Object.keys(aiRankingMap)])
        const rows: string[] = []
        rows.push('Name,Your Ranking,Your Score,Your Description,AI Ranking,AI Description')

        // Sort by your ranking first, then by AI ranking
        const sortedIds = Array.from(allIds).sort((a, b) => {
            const yourRankA = userRankingMap[a]
            const yourRankB = userRankingMap[b]
            if (yourRankA !== undefined && yourRankB !== undefined) {
                return yourRankB - yourRankA // Higher score first
            }
            const aiRankA = aiRankingMap[a]
            const aiRankB = aiRankingMap[b]
            if (aiRankA !== undefined && aiRankB !== undefined) {
                return aiRankA - aiRankB // Lower rank number first
            }
            return 0
        })

        sortedIds.forEach(id => {
            const name = nameMap[id]
            const yourScore = userRankingMap[id]
            const yourRank = Object.values(userRankingMap)
                .sort((a, b) => b - a)
                .indexOf(yourScore) + 1
            const aiRank = aiRankingMap[id]
            const yourDesc = rankingNotes[id] || ''
            const aiMatch = matches.find(m => m.toId === id)
            const aiDesc = aiMatch?.reasoning || ''

            const yourRankStr = yourScore !== undefined ? yourRank.toString() : 'N/A'
            const yourScoreStr = yourScore !== undefined ? yourScore.toString() : 'N/A'
            const aiRankStr = aiRank !== undefined ? aiRank.toString() : 'N/A'

            const escapeCsv = (str: string) => `"${(str || '').replace(/"/g, '""')}"`
            rows.push(`${escapeCsv(name)},${yourRankStr},${yourScoreStr},${escapeCsv(yourDesc)},${aiRankStr},${escapeCsv(aiDesc)}`)
        })

        const csv = rows.join('\n')
        const blob = new Blob([csv], { type: 'text/csv' })
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `speed-dating-results-${new Date().toISOString().split('T')[0]}.csv`
        document.body.appendChild(a)
        a.click()
        window.URL.revokeObjectURL(url)
        document.body.removeChild(a)
    }

    if (loading) {
        return <div className="min-h-screen flex items-center justify-center">Loading...</div>
    }

    if (!user) {
        return <div className="min-h-screen flex items-center justify-center">Not authenticated</div>
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-rose-50 via-pink-50 to-fuchsia-100 flex flex-col md:flex-row">
            {/* Mobile Header */}
            <div className="md:hidden bg-white/90 backdrop-blur shadow p-4 flex justify-between items-center">
                <div className="flex items-center gap-2">
                    <Image
                        src="/IN-logo.png"
                        alt="International Committee"
                        width={30}
                        height={30}
                        className="object-contain"
                        priority
                    />
                    <Image
                        src="/speed-dating-logo.png"
                        alt="Speed Dating"
                        width={36}
                        height={36}
                        className="object-contain"
                        priority
                    />
                    <h1 className="text-2xl font-bold text-pink-600">Speed Dating</h1>
                </div>
                <button
                    onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                    className="text-pink-600 text-2xl"
                >
                    ☰
                </button>
            </div>

            {/* Sidebar */}
            <div
                className={`${isSidebarOpen ? 'block' : 'hidden'
                    } md:block md:w-64 bg-white/90 backdrop-blur shadow-lg p-6 md:min-h-screen`}
            >
                <div className="hidden md:flex flex-col gap-3 mb-8">
                    <div className="flex items-center gap-3">
                        <Image
                            src="/IN-logo.png"
                            alt="International Committee"
                            width={32}
                            height={32}
                            className="object-contain"
                            priority
                        />
                        <span className="text-sm font-semibold uppercase tracking-[0.2em] text-pink-500">
                            International Committee
                        </span>
                    </div>
                    <h2 className="text-2xl font-bold text-pink-600">Speed Dating</h2>
                    <p className="text-sm text-pink-500">Kindness first, sparks always 💗</p>
                </div>

                <nav className="space-y-2">
                    <button
                        onClick={() => {
                            setTab('profile')
                            setIsSidebarOpen(false)
                        }}
                        className={`w-full text-left px-4 py-3 rounded-lg font-medium transition ${tab === 'profile'
                            ? 'bg-pink-100 text-pink-700'
                            : 'text-gray-700 hover:bg-pink-50'
                            }`}
                    >
                        👤 About Me
                    </button>

                    {isPublished && (
                        <button
                            onClick={() => {
                                setTab('ai')
                                setIsSidebarOpen(false)
                            }}
                            className={`w-full text-left px-4 py-3 rounded-lg font-medium transition ${tab === 'ai'
                                ? 'bg-pink-100 text-pink-700'
                                : 'text-gray-700 hover:bg-pink-50'
                                }`}
                        >
                            🤖 AI Rankings
                        </button>
                    )}

                    {dates.length > 0 && (
                        <button
                            onClick={() => {
                                setTab('ranking')
                                setIsSidebarOpen(false)
                            }}
                            className={`w-full text-left px-4 py-3 rounded-lg font-medium transition ${tab === 'ranking'
                                ? 'bg-pink-100 text-pink-700'
                                : 'text-gray-700 hover:bg-pink-50'
                                }`}
                        >
                            ⭐ My Ranking
                        </button>
                    )}

                    {dates.length > 0 && isPublished && (
                        <button
                            onClick={() => {
                                setTab('results')
                                setIsSidebarOpen(false)
                            }}
                            className={`w-full text-left px-4 py-3 rounded-lg font-medium transition ${tab === 'results'
                                ? 'bg-pink-100 text-pink-700'
                                : 'text-gray-700 hover:bg-pink-50'
                                }`}
                        >
                            📊 Results
                        </button>
                    )}
                </nav>

                <div className="mt-8 pt-6 border-t border-pink-100">
                    <Link
                        href="/"
                        className="w-full block text-center bg-pink-500 hover:bg-pink-600 text-white font-bold py-2 px-4 rounded-lg transition"
                    >
                        Logout
                    </Link>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 p-4 md:p-8">
                {tab === 'profile' && (
                    <div className="max-w-2xl">
                        <h2 className="text-3xl font-bold text-gray-800 mb-2">About {user.name}</h2>
                        <p className="text-pink-600 mb-6">Your sweetest self, on display 💞</p>

                        <div className="bg-white/90 backdrop-blur rounded-2xl shadow-lg p-8 space-y-6 border border-pink-100">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <p className="text-sm text-gray-600">Name</p>
                                    <p className="text-lg font-semibold text-gray-800">{user.name}</p>
                                </div>
                                <div>
                                    <p className="text-sm text-gray-600">Age</p>
                                    <p className="text-lg font-semibold text-gray-800">{user.age}</p>
                                </div>
                                <div>
                                    <p className="text-sm text-gray-600">Gender</p>
                                    <p className="text-lg font-semibold text-gray-800 capitalize">{user.sex}</p>
                                </div>
                                <div>
                                    <p className="text-sm text-gray-600">Looking For</p>
                                    <p className="text-lg font-semibold text-gray-800 capitalize">{user.partnerSexPref}</p>
                                </div>
                            </div>

                            <div>
                                <p className="text-sm text-gray-600 mb-2">About Me</p>
                                <p className="text-gray-700 leading-relaxed">{user.aboutMe}</p>
                            </div>

                            <div>
                                <p className="text-sm text-gray-600 mb-2">What I'm Looking For</p>
                                <p className="text-gray-700 leading-relaxed">{user.lookingFor}</p>
                            </div>

                            <div>
                                <p className="text-sm text-gray-600 mb-2">Personality</p>
                                <p className="text-gray-700 leading-relaxed">{user.personality}</p>
                            </div>
                        </div>
                    </div>
                )}

                {tab === 'ai' && isPublished && (
                    <div className="max-w-4xl">
                        <h2 className="text-3xl font-bold text-gray-800 mb-2">AI Rankings</h2>
                        <p className="text-pink-600 mb-6">Thoughtful matches curated with care 💗</p>

                        {matches.length === 0 ? (
                            <div className="bg-white/90 backdrop-blur rounded-2xl shadow-lg p-8 text-center text-gray-600 border border-pink-100">
                                No AI rankings yet. Check back later!
                            </div>
                        ) : (
                            <div className="grid gap-4">
                                {matches.map((match) => (
                                    <div key={match.id} className="bg-white/90 backdrop-blur rounded-2xl shadow-lg p-6 border-l-4 border-pink-500">
                                        <div className="flex justify-between items-start mb-4">
                                            <div>
                                                <h3 className="text-2xl font-bold text-gray-800">{match.to.name}</h3>
                                                <p className="text-gray-600">{match.to.age} years old • {match.to.sex}</p>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-3xl font-bold text-pink-600">#{match.rank}</p>
                                                <p className="text-sm text-gray-600">Ranking</p>
                                            </div>
                                        </div>

                                        <div className="space-y-3">
                                            <div>
                                                <p className="text-sm text-gray-600 font-semibold mb-1">About</p>
                                                <p className="text-gray-700">{match.to.aboutMe}</p>
                                            </div>

                                            <div>
                                                <p className="text-sm text-gray-600 font-semibold mb-1">Why Selected</p>
                                                <p className="text-gray-700 italic">{match.reasoning}</p>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {tab === 'ranking' && (
                    <div className="max-w-4xl">
                        <h2 className="text-3xl font-bold text-gray-800 mb-2">Rate Your Dates</h2>
                        <p className="text-pink-600 mb-6">Rate the people you dated, with kindness.</p>

                        {datedParticipants.length === 0 ? (
                            <div className="bg-white/90 backdrop-blur rounded-2xl shadow-lg p-8 text-center text-gray-600 border border-pink-100">
                                No dates to rate yet.
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {datedParticipants.map(({ date, partner }) => (
                                    <div key={date.id} className="bg-white/90 backdrop-blur rounded-2xl shadow-lg p-6 border border-pink-100">
                                        <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4">
                                            <div>
                                                <p className="text-sm text-gray-500">Date {date.timeSlot}</p>
                                                <h3 className="text-xl font-bold text-gray-800">
                                                    {getTimeSlotLabel(date.timeSlot)} Date: {partner.name}
                                                </h3>
                                                <p className="text-gray-600">{partner.age} years old</p>
                                            </div>
                                            <div className="flex items-center gap-4">
                                                <span className="text-sm text-gray-600">Rating</span>
                                                <input
                                                    type="range"
                                                    min="1"
                                                    max="10"
                                                    value={newRankings[partner.id] || 5}
                                                    onChange={(e) =>
                                                        handleRankingChange(partner.id, parseInt(e.target.value))
                                                    }
                                                    className="w-32 accent-pink-500"
                                                />
                                                <span className="text-2xl font-bold text-pink-600 min-w-12">
                                                    {newRankings[partner.id] || 5}/10
                                                </span>
                                            </div>
                                        </div>

                                        <div className="mt-4">
                                            <label className="text-sm text-gray-600 font-semibold mb-1 block">
                                                Description (optional)
                                            </label>
                                            <textarea
                                                value={rankingNotes[partner.id] || ''}
                                                onChange={(e) => handleNoteChange(partner.id, e.target.value)}
                                                className="w-full border border-pink-200 rounded-lg p-3 text-gray-700 focus:outline-none focus:ring-2 focus:ring-pink-200"
                                                rows={3}
                                                placeholder="Add a short note about this date"
                                            />
                                        </div>
                                    </div>
                                ))}

                                <button
                                    onClick={handleSaveRankings}
                                    disabled={savingRankings}
                                    className="w-full bg-pink-600 hover:bg-pink-700 disabled:bg-gray-400 text-white font-bold py-3 px-6 rounded-lg transition mt-6"
                                >
                                    {savingRankings ? 'Saving...' : 'Save My Ratings 💖'}
                                </button>

                                <div className="mt-8 grid gap-6 md:grid-cols-2">
                                    <div className="bg-white/90 backdrop-blur rounded-2xl shadow-lg p-6 border border-pink-100">
                                        <h3 className="text-xl font-bold text-gray-800 mb-4">My Rankings</h3>
                                        {userRankingTable.length === 0 ? (
                                            <p className="text-gray-600">No rankings yet.</p>
                                        ) : (
                                            <div className="overflow-x-auto">
                                                <table className="min-w-full text-left">
                                                    <thead>
                                                        <tr className="border-b">
                                                            <th className="py-2 pr-4 text-sm text-gray-600">Position</th>
                                                            <th className="py-2 text-sm text-gray-600">Name</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {userRankingTable.map((row) => (
                                                            <tr key={row.name} className="border-b last:border-b-0">
                                                                <td className="py-2 pr-4 font-semibold text-gray-800">#{row.position}</td>
                                                                <td className="py-2 text-gray-700">{row.name}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        )}
                                    </div>

                                    {isPublished && (
                                        <div className="bg-white/90 backdrop-blur rounded-2xl shadow-lg p-6 border border-pink-100">
                                            <h3 className="text-xl font-bold text-gray-800 mb-4">AI Rankings</h3>
                                            {aiRankingTable.length === 0 ? (
                                                <p className="text-gray-600">AI rankings not available yet.</p>
                                            ) : (
                                                <div className="overflow-x-auto">
                                                    <table className="min-w-full text-left">
                                                        <thead>
                                                            <tr className="border-b">
                                                                <th className="py-2 pr-4 text-sm text-gray-600">Position</th>
                                                                <th className="py-2 text-sm text-gray-600">Name</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {aiRankingTable.map((row) => (
                                                                <tr key={row.name} className="border-b last:border-b-0">
                                                                    <td className="py-2 pr-4 font-semibold text-gray-800">#{row.position}</td>
                                                                    <td className="py-2 text-gray-700">{row.name}</td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {tab === 'results' && dates.length > 0 && isPublished && (
                    <div className="max-w-4xl">
                        <h2 className="text-3xl font-bold text-gray-800 mb-2">Your Results</h2>
                        <p className="text-pink-600 mb-6">See how your heart and the AI aligned 💕</p>

                        <div className="bg-white/90 backdrop-blur rounded-2xl shadow-lg p-8 border border-pink-100">
                            <div className="mb-6">
                                <button
                                    onClick={downloadResultsCSV}
                                    className="bg-pink-600 hover:bg-pink-700 text-white font-bold py-3 px-6 rounded-lg transition flex items-center gap-2"
                                >
                                    <span>📥 Download Results as CSV</span>
                                </button>
                            </div>

                            <div className="overflow-x-auto">
                                <table className="min-w-full text-left">
                                    <thead>
                                        <tr className="border-b border-pink-200">
                                            <th className="py-3 px-4 text-sm font-semibold text-gray-700">Name</th>
                                            <th className="py-3 px-4 text-sm font-semibold text-gray-700">Your Ranking</th>
                                            <th className="py-3 px-4 text-sm font-semibold text-gray-700">Your Score</th>
                                            <th className="py-3 px-4 text-sm font-semibold text-gray-700">Your Description</th>
                                            <th className="py-3 px-4 text-sm font-semibold text-gray-700">AI Ranking</th>
                                            <th className="py-3 px-4 text-sm font-semibold text-gray-700">AI Description</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {Array.from(new Set([...Object.keys(Object.fromEntries(datedParticipants.map(d => [d.partner.id, d.partner.name]))), ...matches.map(m => m.toId)]))
                                            .map(id => {
                                                const userEntry = datedParticipants.find(d => d.partner.id === id)
                                                const aiEntry = matches.find(m => m.toId === id)
                                                const name = userEntry?.partner.name || aiEntry?.to.name || ''
                                                const userScore = userEntry?.score
                                                const userRank = userScore !== undefined
                                                    ? [...new Set(datedParticipants.map(d => d.score))].sort((a, b) => b - a).indexOf(userScore) + 1
                                                    : undefined
                                                const aiRank = aiEntry?.rank

                                                return (
                                                    <tr key={id} className="border-b border-pink-100 hover:bg-pink-50">
                                                        <td className="py-3 px-4 font-medium text-gray-800">{name}</td>
                                                        <td className="py-3 px-4 text-gray-700">{userRank !== undefined ? `#${userRank}` : 'N/A'}</td>
                                                        <td className="py-3 px-4 text-gray-700">{userScore !== undefined ? `${userScore}/10` : 'N/A'}</td>
                                                        <td className="py-3 px-4 text-gray-700 text-sm italic">{rankingNotes[id] || '—'}</td>
                                                        <td className="py-3 px-4 text-gray-700">{aiRank !== undefined ? `#${aiRank}` : 'N/A'}</td>
                                                        <td className="py-3 px-4 text-gray-700 text-sm italic">{aiEntry?.reasoning || '—'}</td>
                                                    </tr>
                                                )
                                            })
                                        }
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
