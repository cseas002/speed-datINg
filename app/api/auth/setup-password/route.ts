import { NextResponse } from 'next/server'
import { hashPassword, createEmailSession } from '@/lib/auth'
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

        if (!password || password.length < 4) {
            return NextResponse.json(
                { error: 'Password must be at least 4 characters' },
                { status: 400 }
            )
        }

        // Find participant
        const participant = await prisma.participant.findUnique({
            where: { email },
        })

        if (!participant) {
            return NextResponse.json(
                { error: 'User not found' },
                { status: 404 }
            )
        }

        // Hash password
        const hashedPassword = await hashPassword(password)

        // Update participant with password
        await prisma.participant.update({
            where: { email },
            data: { password: hashedPassword },
        })

        // Create session
        const session = await createEmailSession(email)

        return NextResponse.json({
            success: true,
            token: session.token,
            message: 'Password created successfully',
        })
    } catch (error) {
        console.error('Password setup error:', error)
        return NextResponse.json(
            { error: 'Failed to set password' },
            { status: 500 }
        )
    }
}
