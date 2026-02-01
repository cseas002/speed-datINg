import { NextResponse } from 'next/server'
import { verifyPassword, createAdminSession, hashPassword } from '@/lib/auth'
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

        const allowedAdminEmail = process.env.ADMIN_EMAIL
        if (!allowedAdminEmail) {
            return NextResponse.json(
                { error: 'ADMIN_EMAIL not configured' },
                { status: 500 }
            )
        }

        if (email.toLowerCase() !== allowedAdminEmail.toLowerCase()) {
            return NextResponse.json(
                { error: 'Unauthorized admin email' },
                { status: 403 }
            )
        }

        // Auto-seed admin if none exists and env vars are provided
        const existingAdminCount = await prisma.admin.count()
        if (existingAdminCount === 0 && process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
            const seededEmail = process.env.ADMIN_EMAIL
            const seededPassword = await hashPassword(process.env.ADMIN_PASSWORD)
            await prisma.admin.create({
                data: {
                    email: seededEmail,
                    password: seededPassword,
                },
            })
        }

        // Find or create admin user
        let admin = await prisma.admin.findUnique({
            where: { email },
        })

        if (!admin) {
            // Create new admin user if doesn't exist
            admin = await prisma.admin.create({
                data: { email },
            })
        }

        // Check if password is set
        if (!admin.password) {
            // Admin needs to create a password
            return NextResponse.json({
                success: false,
                needsPasswordSetup: true,
                message: 'Please set a password to access the admin panel',
            }, { status: 200 })
        }

        // Verify password
        if (!password) {
            return NextResponse.json(
                { error: 'Password required' },
                { status: 400 }
            )
        }

        const isValidPassword = await verifyPassword(password, admin.password)
        if (!isValidPassword) {
            return NextResponse.json(
                { error: 'Invalid email or password' },
                { status: 401 }
            )
        }

        // Create admin session
        const session = await createAdminSession(admin.id)

        return NextResponse.json({
            success: true,
            token: session.token,
        })
    } catch (error) {
        console.error('Admin login error:', error)
        return NextResponse.json(
            { error: 'Failed to login' },
            { status: 500 }
        )
    }
}
