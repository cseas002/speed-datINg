'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

interface Participant {
    id: string
    name: string
    email: string
    sex: string
}

interface CustomDatePair {
    participant1Id: string
    participant2Id: string
}

export default function AdminDashboard() {
    const router = useRouter()
    const [step, setStep] = useState<'upload' | 'passwords' | 'matching' | 'publish'>('upload')
    const [uploadLoading, setUploadLoading] = useState(false)
    const [passwordsLoading, setPasswordsLoading] = useState(false)
    const [matchesLoading, setMatchesLoading] = useState(false)
    const [publishLoading, setPublishLoading] = useState(false)
    const [datesLoading, setDatesLoading] = useState(false)
    const [message, setMessage] = useState('')
    const [error, setError] = useState('')
    const [isPublished, setIsPublished] = useState(false)
    const [participants, setParticipants] = useState<Participant[]>([])
    const [selectedParticipants, setSelectedParticipants] = useState<Set<string>>(new Set())
    const [customDates, setCustomDates] = useState<CustomDatePair[]>([])
    const [customDateP1, setCustomDateP1] = useState('')
    const [customDateP2, setCustomDateP2] = useState('')

    const handleFileUpload = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault()
        setUploadLoading(true)
        setMessage('')
        setError('')

        try {
            const formData = new FormData(e.currentTarget)
            const res = await fetch('/api/admin/upload', {
                method: 'POST',
                body: formData,
            })

            const data = await res.json()

            if (!res.ok) {
                setError(data.error || 'Upload failed')
                return
            }

            setMessage(`Successfully imported ${data.participantsCreated} participants!`)
            // Fetch participants after upload
            await fetchParticipants()
            setStep('passwords')
        } catch (err) {
            setError('Network error. Please try again.')
        } finally {
            setUploadLoading(false)
        }
    }

    const fetchParticipants = async () => {
        try {
            const res = await fetch('/api/admin/participants')
            const data = await res.json()
            if (res.ok) {
                setParticipants(data.participants)
            }
        } catch (err) {
            console.error('Failed to fetch participants:', err)
        }
    }

    const fetchPublishStatus = async () => {
        try {
            const res = await fetch('/api/admin/publish')
            const data = await res.json()
            if (res.ok) {
                setIsPublished(data.isPublished === true)
            }
        } catch (err) {
            console.error('Failed to fetch publish status:', err)
        }
    }

    useEffect(() => {
        fetchParticipants()
        fetchPublishStatus()
    }, [])

    const toggleParticipant = (id: string) => {
        const newSelected = new Set(selectedParticipants)
        if (newSelected.has(id)) {
            newSelected.delete(id)
        } else {
            newSelected.add(id)
        }
        setSelectedParticipants(newSelected)
    }

    const toggleAllParticipants = () => {
        if (selectedParticipants.size === participants.length) {
            setSelectedParticipants(new Set())
        } else {
            setSelectedParticipants(new Set(participants.map((p) => p.id)))
        }
    }

    const handleSendPasswords = async () => {
        if (selectedParticipants.size === 0) {
            setError('Please select at least one participant')
            return
        }

        setPasswordsLoading(true)
        setMessage('')
        setError('')

        try {
            const res = await fetch('/api/admin/send-passwords', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    participantIds: Array.from(selectedParticipants),
                }),
            })

            const data = await res.json()

            if (!res.ok) {
                setError(data.error || 'Failed to send passwords')
                return
            }

            setMessage(data.message)
            setSelectedParticipants(new Set())
            // Password sending is optional, don't force step progression
        } catch (err) {
            setError('Network error. Please try again.')
        } finally {
            setPasswordsLoading(false)
        }
    }

    const handleGenerateMatches = async () => {
        setMatchesLoading(true)
        setMessage('')
        setError('')

        try {
            const res = await fetch('/api/admin/match', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({}),
            })

            const data = await res.json()

            if (!res.ok) {
                setError(data.error || 'Matching failed')
                return
            }

            // Build detailed message with results
            let detailedMessage = `✓ Successfully created ${data.matchesCreated} matches!\n`
            if (data.results && data.results.length > 0) {
                detailedMessage += `\nMatches by participant:\n`
                data.results.forEach((result: any) => {
                    detailedMessage += `• ${result.name}: ${result.matchCount} match${result.matchCount !== 1 ? 'es' : ''} (top: ${result.topMatch})\n`
                })
            }
            setMessage(detailedMessage)
            setStep('publish')
        } catch (err) {
            setError('Network error. Please try again.')
        } finally {
            setMatchesLoading(false)
        }
    }

    const handleGenerateDates = async () => {
        setDatesLoading(true)
        setMessage('')
        setError('')

        try {
            const res = await fetch('/api/admin/dates', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    customDates,
                }),
            })

            const data = await res.json()

            if (!res.ok) {
                setError(data.error || 'Failed to generate dates')
                return
            }

            const customDateCount = Array.isArray(customDates) ? customDates.length : 0
            setMessage(
                `✓ Successfully generated ${data.datesCreated} dates!\n` +
                (customDateCount > 0
                    ? `✓ Guaranteed custom dates: ${customDateCount}\n\n`
                    : '\n') +
                'Dates have been saved to the database and are ready for the event.'
            )

            // Download CSV file
            if (data.csvContent) {
                const blob = new Blob([data.csvContent], { type: 'text/csv' })
                const url = window.URL.createObjectURL(blob)
                const link = document.createElement('a')
                link.href = url
                link.download = `speed-dating-dates-${new Date().toISOString().split('T')[0]}.csv`
                document.body.appendChild(link)
                link.click()
                document.body.removeChild(link)
                window.URL.revokeObjectURL(url)
            }
        } catch (err) {
            setError('Network error. Please try again.')
        } finally {
            setDatesLoading(false)
        }
    }

    const handlePublish = async (publish: boolean) => {
        setPublishLoading(true)
        setMessage('')
        setError('')

        try {
            const res = await fetch('/api/admin/publish', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ publish }),
            })

            const data = await res.json()

            if (!res.ok) {
                setError(data.error || 'Publish failed')
                return
            }

            setIsPublished(publish)
            setMessage(data.message)
        } catch (err) {
            setError('Network error. Please try again.')
        } finally {
            setPublishLoading(false)
        }
    }

    const addCustomDate = () => {
        setError('')
        if (!customDateP1 || !customDateP2) {
            setError('Please select two participants for custom date')
            return
        }
        if (customDateP1 === customDateP2) {
            setError('A custom date needs two different participants')
            return
        }

        const exists = customDates.some(
            (d) =>
                (d.participant1Id === customDateP1 && d.participant2Id === customDateP2) ||
                (d.participant1Id === customDateP2 && d.participant2Id === customDateP1)
        )

        if (exists) {
            setError('This custom date pair already exists')
            return
        }

        setCustomDates((prev) => [
            ...prev,
            { participant1Id: customDateP1, participant2Id: customDateP2 },
        ])
        setCustomDateP1('')
        setCustomDateP2('')
    }

    const removeCustomDate = (index: number) => {
        setCustomDates((prev) => prev.filter((_, i) => i !== index))
    }

    const getParticipantName = (id: string) =>
        participants.find((p) => p.id === id)?.name || id

    return (
        <main className="min-h-screen bg-gray-50 py-8">
            <div className="max-w-4xl mx-auto px-4">
                {/* Header */}
                <div className="flex justify-between items-center mb-8">
                    <h1 className="text-4xl font-bold text-gray-800">🔐 Admin Dashboard</h1>
                    <Link
                        href="/"
                        className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-2 px-4 rounded-lg transition"
                    >
                        Logout
                    </Link>
                </div>

                {/* Steps */}
                <div className="grid gap-6 mb-8">
                    {/* Step 1: Upload Excel */}
                    <div className={`rounded-lg shadow-lg overflow-hidden ${step === 'upload' ? 'ring-2 ring-blue-500' : ''}`}>
                        <div className="bg-blue-500 text-white p-4">
                            <h2 className="text-2xl font-bold">1. Upload Event Data</h2>
                        </div>
                        <div className="p-6 bg-white">
                            <p className="text-black mb-4">
                                Upload the CSV file with participant data and attendance status. Only participants marked as "arrived"
                                will be included in matching.
                            </p>

                            <form onSubmit={handleFileUpload} className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-black mb-2">
                                        CSV File (.csv)
                                    </label>
                                    <input
                                        type="file"
                                        name="file"
                                        accept=".csv"
                                        required={step === 'upload'}
                                        className="w-full px-4 py-2 border border-gray-300 rounded-lg text-black file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-purple-500 file:text-white file:cursor-pointer hover:file:bg-purple-600"
                                    />
                                </div>

                                <button
                                    type="submit"
                                    disabled={uploadLoading || step !== 'upload'}
                                    className="bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 text-white font-bold py-2 px-6 rounded-lg transition"
                                >
                                    {uploadLoading ? 'Uploading...' : 'Upload File'}
                                </button>
                            </form>
                        </div>
                    </div>

                    {/* Step 2: Send Passwords */}
                    <div className={`rounded-lg shadow-lg overflow-hidden ${step === 'passwords' ? 'ring-2 ring-blue-500' : ''}`}>
                        <div className="bg-yellow-500 text-white p-4">
                            <h2 className="text-2xl font-bold">2. Send Login Passwords</h2>
                        </div>
                        <div className="p-6 bg-white">
                            <p className="text-black mb-4">
                                Select participants and send them their login passwords via email. They'll be able to log in with their email and the password you send.
                            </p>

                            {participants.length > 0 ? (
                                <>
                                    <div className="mb-4 flex items-center gap-3 p-3 bg-gray-100 rounded-lg">
                                        <input
                                            type="checkbox"
                                            checked={selectedParticipants.size === participants.length && participants.length > 0}
                                            onChange={toggleAllParticipants}
                                            className="w-4 h-4 cursor-pointer"
                                        />
                                        <label className="text-black font-medium cursor-pointer">
                                            Select All ({selectedParticipants.size}/{participants.length})
                                        </label>
                                    </div>

                                    <div className="max-h-64 overflow-y-auto border border-gray-300 rounded-lg mb-4">
                                        {participants.map((participant) => (
                                            <div
                                                key={participant.id}
                                                className="flex items-center gap-3 p-3 border-b border-gray-200 hover:bg-gray-50"
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={selectedParticipants.has(participant.id)}
                                                    onChange={() => toggleParticipant(participant.id)}
                                                    className="w-4 h-4 cursor-pointer"
                                                />
                                                <div className="flex-1">
                                                    <p className="text-black font-medium">{participant.name}</p>
                                                    <p className="text-gray-600 text-sm">{participant.email}</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    <button
                                        onClick={handleSendPasswords}
                                        disabled={passwordsLoading || selectedParticipants.size === 0}
                                        className="bg-yellow-500 hover:bg-yellow-600 disabled:bg-gray-400 text-white font-bold py-2 px-6 rounded-lg transition"
                                    >
                                        {passwordsLoading ? 'Sending...' : `Send Passwords (${selectedParticipants.size})`}
                                    </button>
                                </>
                            ) : (
                                <p className="text-gray-600">No participants uploaded yet. Upload a CSV file first.</p>
                            )}
                        </div>
                    </div>

                    {/* Step 3: Generate Matches */}
                    <div className={`rounded-lg shadow-lg overflow-hidden ${step === 'matching' ? 'ring-2 ring-blue-500' : ''}`}>
                        <div className="bg-green-500 text-white p-4">
                            <h2 className="text-2xl font-bold">3. Generate Matches</h2>
                        </div>
                        <div className="p-6 bg-white">
                            <p className="text-black mb-4">
                                Use AI to match participants based on their personality and preferences. This will generate the top 7
                                matches for each participant.
                            </p>

                            <div className="space-y-4">
                                <div className="border border-indigo-200 rounded-lg p-4 bg-indigo-50">
                                    <h3 className="text-lg font-bold text-indigo-700 mb-2">Add Custom Dates (Guaranteed)</h3>
                                    <p className="text-sm text-indigo-700 mb-3">
                                        These pairs are guaranteed when you press Generate Dates.
                                    </p>

                                    <div className="grid md:grid-cols-3 gap-2 mb-3">
                                        <select
                                            value={customDateP1}
                                            onChange={(e) => setCustomDateP1(e.target.value)}
                                            className="px-3 py-2 border border-gray-300 rounded-lg text-black bg-white"
                                        >
                                            <option value="">Select participant 1</option>
                                            {participants.map((participant) => (
                                                <option key={`p1-${participant.id}`} value={participant.id}>
                                                    {participant.name}
                                                </option>
                                            ))}
                                        </select>

                                        <select
                                            value={customDateP2}
                                            onChange={(e) => setCustomDateP2(e.target.value)}
                                            className="px-3 py-2 border border-gray-300 rounded-lg text-black bg-white"
                                        >
                                            <option value="">Select participant 2</option>
                                            {participants.map((participant) => (
                                                <option key={`p2-${participant.id}`} value={participant.id}>
                                                    {participant.name}
                                                </option>
                                            ))}
                                        </select>

                                        <button
                                            onClick={addCustomDate}
                                            disabled={datesLoading || participants.length < 2}
                                            className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 text-white font-bold py-2 px-4 rounded-lg transition"
                                        >
                                            + Add Custom Date
                                        </button>
                                    </div>

                                    {customDates.length > 0 && (
                                        <div className="space-y-2">
                                            {customDates.map((pair, index) => (
                                                <div
                                                    key={`${pair.participant1Id}-${pair.participant2Id}-${index}`}
                                                    className="flex items-center justify-between bg-white border border-indigo-100 rounded-lg px-3 py-2"
                                                >
                                                    <span className="text-black text-sm">
                                                        {getParticipantName(pair.participant1Id)} ↔ {getParticipantName(pair.participant2Id)}
                                                    </span>
                                                    <button
                                                        onClick={() => removeCustomDate(index)}
                                                        className="text-red-600 hover:text-red-700 font-semibold text-sm"
                                                    >
                                                        Remove
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                <button
                                    onClick={handleGenerateMatches}
                                    disabled={matchesLoading || participants.length === 0}
                                    className="w-full bg-green-500 hover:bg-green-600 disabled:bg-gray-400 text-white font-bold py-2 px-6 rounded-lg transition"
                                >
                                    {matchesLoading ? 'Generating Matches...' : 'Generate Matches with AI'}
                                </button>

                                <button
                                    onClick={handleGenerateDates}
                                    disabled={datesLoading || participants.length === 0}
                                    className="w-full bg-indigo-500 hover:bg-indigo-600 disabled:bg-gray-400 text-white font-bold py-2 px-6 rounded-lg transition"
                                >
                                    {datesLoading ? 'Generating Dates...' : '📅 Generate Dates'}
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Step 4: Publish Rankings */}
                    <div className={`rounded-lg shadow-lg overflow-hidden ${step === 'publish' ? 'ring-2 ring-blue-500' : ''}`}>
                        <div className="bg-purple-500 text-white p-4">
                            <h2 className="text-2xl font-bold">4. Publish Rankings</h2>
                        </div>
                        <div className="p-6 bg-white">
                            <p className="text-black mb-4">
                                Control when participants see the AI reasoning for matches. Once published, users will see why they were
                                matched with each person.
                            </p>

                            <div className={`mb-4 rounded-lg px-4 py-3 text-sm font-medium ${isPublished
                                ? 'bg-green-100 text-green-800'
                                : 'bg-yellow-100 text-yellow-800'
                                }`}>
                                {isPublished ? 'Results are currently published.' : 'Results are not published yet.'}
                            </div>

                            <div className="flex gap-4">
                                <button
                                    onClick={() => handlePublish(true)}
                                    disabled={publishLoading}
                                    className={`font-bold py-2 px-6 rounded-lg transition ${isPublished
                                        ? 'bg-green-500 text-white'
                                        : 'bg-gray-200 text-gray-800 hover:bg-gray-300'
                                        }`}
                                >
                                    {publishLoading ? 'Publishing...' : '✓ Publish Rankings'}
                                </button>

                                <button
                                    onClick={() => handlePublish(false)}
                                    disabled={publishLoading}
                                    className={`font-bold py-2 px-6 rounded-lg transition ${!isPublished
                                        ? 'bg-red-500 text-white'
                                        : 'bg-gray-200 text-gray-800 hover:bg-gray-300'
                                        }`}
                                >
                                    {publishLoading ? 'Hiding...' : '✕ Hide Rankings'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Messages */}
                {message && (
                    <div className="p-4 bg-green-100 text-green-700 rounded-lg mb-4 whitespace-pre-wrap font-mono text-sm">
                        {message}
                    </div>
                )}

                {error && (
                    <div className="p-4 bg-red-100 text-red-700 rounded-lg mb-4">
                        {error}
                    </div>
                )}
            </div>
        </main>
    )
}
