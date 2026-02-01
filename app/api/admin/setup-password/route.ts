import { NextResponse } from 'next/server'
import { hashPassword, createAdminSession } from '@/lib/auth'
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

        // Find admin
        let admin = await prisma.admin.findUnique({
            where: { email },
        })

        if (!admin) {
            // Create new admin if doesn't exist
            admin = await prisma.admin.create({
                data: { email },
            })
        }

        // Hash password
        const hashedPassword = await hashPassword(password)

        // Update admin with password
        await prisma.admin.update({
            where: { email },
            data: { password: hashedPassword },
        })

        // Create session
        const session = await createAdminSession(admin.id)

        return NextResponse.json({
            success: true,
            token: session.token,
            message: 'Password created successfully',
        })
    } catch (error) {
        console.error('Admin password setup error:', error)
        return NextResponse.json(
            { error: 'Failed to set password' },
            { status: 500 }
        )
    }
}
