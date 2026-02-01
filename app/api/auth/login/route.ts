import { NextResponse } from 'next/server'
import { createEmailSession, verifyPassword } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function POST(request: Request) {
    try {
        const { email, password } = await request.json()

        if (!email || !email.includes('@')) {
            return NextResponse.json(
                { error: 'Invalid email' },
                { status: 400 }
            )
        }

        // Find participant
        const participant = await prisma.participant.findUnique({
            where: { email },
        })

        if (!participant) {
            return NextResponse.json(
                { error: 'User not found. Please ensure your email was submitted in the form.' },
                { status: 404 }
            )
        }

        // Check if password is set
        if (!participant.password) {
            // User needs to create a password
            return NextResponse.json({
                success: false,
                needsPasswordSetup: true,
                message: 'Please set a password to continue',
            }, { status: 200 })
        }

        // Verify password
        if (!password) {
            return NextResponse.json(
                { error: 'Password required' },
                { status: 400 }
            )
        }

        const isValidPassword = await verifyPassword(password, participant.password)
        if (!isValidPassword) {
            return NextResponse.json(
                { error: 'Invalid email or password' },
                { status: 401 }
            )
        }

        // Create session
        const session = await createEmailSession(email)

        return NextResponse.json({
            success: true,
            token: session.token,
        })
    } catch (error) {
        console.error('Login error:', error)
        return NextResponse.json(
            { error: 'Failed to login' },
            { status: 500 }
        )
    }
}
