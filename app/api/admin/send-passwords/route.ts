import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import nodemailer from 'nodemailer'
import { prisma } from '@/lib/db'
import { verifyAdminSession } from '@/lib/auth'
import { hashPassword } from '@/lib/auth'

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

        // Get participants to send passwords to
        const { participantIds } = await request.json()

        if (!participantIds || participantIds.length === 0) {
            return NextResponse.json(
                { error: 'No participants selected' },
                { status: 400 }
            )
        }

        // Check environment variables
        const gmailAddress = process.env.GMAIL_ADDRESS
        const gmailPassword = process.env.GMAIL_PASSWORD
        const gmailName = process.env.GMAIL_NAME || 'Speed Dating App'

        if (!gmailAddress || !gmailPassword) {
            return NextResponse.json(
                { error: 'Email configuration missing. Please set GMAIL_ADDRESS and GMAIL_PASSWORD in .env' },
                { status: 500 }
            )
        }

        // Create nodemailer transporter
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: gmailAddress,
                pass: gmailPassword,
            },
        })

        // Get participants
        const participants = await prisma.participant.findMany({
            where: {
                id: {
                    in: participantIds,
                },
            },
        })

        if (participants.length === 0) {
            return NextResponse.json(
                { error: 'No participants found' },
                { status: 404 }
            )
        }

        // Generate passwords and send emails
        const results = []
        for (const participant of participants) {
            // Generate a random password
            const tempPassword = Math.random().toString(36).slice(-12)
            const hashedPassword = await hashPassword(tempPassword)

            // Update participant with password
            await prisma.participant.update({
                where: { id: participant.id },
                data: { password: hashedPassword },
            })

            // Send email
            try {
                await transporter.sendMail({
                    from: `"${gmailName}" <${gmailAddress}>`,
                    to: participant.email,
                    subject: '💕 Your Speed Dating Login Credentials',
                    html: `
                        <html>
                            <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
                                <h2 style="color: #a855f7;">Welcome to Speed Dating!</h2>
                                <p>Hi ${participant.name},</p>
                                <p>Your temporary password has been generated. You can now log in to view your matches:</p>
                                
                                <div style="background-color: #f3f4f6; padding: 15px; border-radius: 5px; margin: 20px 0;">
                                    <p><strong>Email:</strong> ${participant.email}</p>
                                    <p><strong>Temporary Password:</strong> <code style="background-color: #e5e7eb; padding: 5px 10px; border-radius: 3px;">${tempPassword}</code></p>
                                </div>
                                
                                <p>Visit <a href="${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}" style="color: #a855f7;">the app</a> to log in.</p>
                                
                                <p>Don't share this password with anyone!</p>
                                <p>Best regards,<br/>The Speed Dating Team 💕</p>
                            </body>
                        </html>
                    `,
                })
                results.push({
                    email: participant.email,
                    success: true,
                    message: 'Password sent',
                })
            } catch (emailError) {
                console.error(`Failed to send email to ${participant.email}:`, emailError)
                results.push({
                    email: participant.email,
                    success: false,
                    message: 'Failed to send email',
                })
            }
        }

        const successCount = results.filter((r) => r.success).length
        const failureCount = results.filter((r) => !r.success).length

        return NextResponse.json({
            success: true,
            message: `Passwords sent to ${successCount} participant(s)${failureCount > 0 ? `, ${failureCount} failed` : ''}`,
            results,
        })
    } catch (error) {
        console.error('Send passwords error:', error)
        return NextResponse.json(
            { error: 'Failed to send passwords' },
            { status: 500 }
        )
    }
}
