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
    const [tab, setTab] = useState<'profile' | 'ranking' | 'ai'>('profile')
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

    if (loading) {
        return <div className="min-h-screen flex items-center justify-center">Loading...</div>
    }

    if (!user) {
        return <div className="min-h-screen flex items-center justify-center">Not authenticated</div>
    }

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col md:flex-row">
            {/* Mobile Header */}
            <div className="md:hidden bg-white shadow p-4 flex justify-between items-center">
                <div className="flex items-center gap-2">
                    <Image
                        src="/speed-dating-logo.png"
                        alt="Speed Dating"
                        width={36}
                        height={36}
                        className="object-contain"
                        priority
                    />
                    <h1 className="text-2xl font-bold text-purple-600">Speed Dating</h1>
                </div>
                <button
                    onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                    className="text-gray-600 text-2xl"
                >
                    ☰
                </button>
            </div>

            {/* Sidebar */}
            <div
                className={`${isSidebarOpen ? 'block' : 'hidden'
                    } md:block md:w-64 bg-white shadow-lg p-6 md:min-h-screen`}
            >
                <div className="hidden md:flex items-center gap-3 mb-8">
                    <Image
                        src="/speed-dating-logo.png"
                        alt="Speed Dating"
                        width={40}
                        height={40}
                        className="object-contain"
                        priority
                    />
                    <h2 className="text-2xl font-bold text-purple-600">Speed Dating</h2>
                </div>

                <nav className="space-y-2">
                    <button
                        onClick={() => {
                            setTab('profile')
                            setIsSidebarOpen(false)
                        }}
                        className={`w-full text-left px-4 py-3 rounded-lg font-medium transition ${tab === 'profile'
                            ? 'bg-purple-100 text-purple-700'
                            : 'text-gray-700 hover:bg-gray-100'
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
                                ? 'bg-purple-100 text-purple-700'
                                : 'text-gray-700 hover:bg-gray-100'
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
                                ? 'bg-purple-100 text-purple-700'
                                : 'text-gray-700 hover:bg-gray-100'
                                }`}
                        >
                            ⭐ My Ranking
                        </button>
                    )}
                </nav>

                <div className="mt-8 pt-6 border-t border-gray-200">
                    <Link
                        href="/"
                        className="w-full block text-center bg-red-500 hover:bg-red-600 text-white font-bold py-2 px-4 rounded-lg transition"
                    >
                        Logout
                    </Link>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 p-4 md:p-8">
                {tab === 'profile' && (
                    <div className="max-w-2xl">
                        <h2 className="text-3xl font-bold text-gray-800 mb-6">About {user.name}</h2>

                        <div className="bg-white rounded-lg shadow-lg p-8 space-y-6">
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
                        <h2 className="text-3xl font-bold text-gray-800 mb-6">AI Rankings</h2>

                        {matches.length === 0 ? (
                            <div className="bg-white rounded-lg shadow-lg p-8 text-center text-gray-600">
                                No AI rankings yet. Check back later!
                            </div>
                        ) : (
                            <div className="grid gap-4">
                                {matches.map((match, index) => (
                                    <div key={match.id} className="bg-white rounded-lg shadow-lg p-6 border-l-4 border-purple-500">
                                        <div className="flex justify-between items-start mb-4">
                                            <div>
                                                <h3 className="text-2xl font-bold text-gray-800">{match.to.name}</h3>
                                                <p className="text-gray-600">{match.to.age} years old • {match.to.sex}</p>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-3xl font-bold text-purple-600">#{match.rank}</p>
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
                        <h2 className="text-3xl font-bold text-gray-800 mb-6">Rate Your Dates</h2>
                        <p className="text-gray-600 mb-6">Rate the people you dated in time-slot order.</p>

                        {datedParticipants.length === 0 ? (
                            <div className="bg-white rounded-lg shadow-lg p-8 text-center text-gray-600">
                                No dates to rate yet.
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {datedParticipants.map(({ date, partner }) => (
                                    <div key={date.id} className="bg-white rounded-lg shadow-lg p-6">
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
                                                    className="w-32"
                                                />
                                                <span className="text-2xl font-bold text-purple-600 min-w-12">
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
                                                className="w-full border border-gray-200 rounded-lg p-3 text-gray-700 focus:outline-none focus:ring-2 focus:ring-purple-200"
                                                rows={3}
                                                placeholder="Add a short note about this date"
                                            />
                                        </div>
                                    </div>
                                ))}

                                <button
                                    onClick={handleSaveRankings}
                                    disabled={savingRankings}
                                    className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 text-white font-bold py-3 px-6 rounded-lg transition mt-6"
                                >
                                    {savingRankings ? 'Saving...' : 'Save My Ratings'}
                                </button>

                                <div className="mt-8 grid gap-6 md:grid-cols-2">
                                    <div className="bg-white rounded-lg shadow-lg p-6">
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
                                        <div className="bg-white rounded-lg shadow-lg p-6">
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
            </div>
        </div>
    )
}
