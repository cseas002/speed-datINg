import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import nodemailer from 'nodemailer'
import { prisma } from '@/lib/db'
import { verifyAdminSession, createMagicLink, hashPassword } from '@/lib/auth'

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

        // Setup email transporter
        const gmailAddress = process.env.GMAIL_ADDRESS
        const gmailPassword = process.env.GMAIL_PASSWORD
        const gmailName = process.env.GMAIL_NAME || '❤️ Speed Dating ❤️'

        let transporter: nodemailer.Transporter | null = null
        if (gmailAddress && gmailPassword) {
            transporter = nodemailer.createTransport({
                service: 'gmail',
                auth: {
                    user: gmailAddress,
                    pass: gmailPassword,
                },
            })
        }

        // Generate magic links and passwords, send emails
        const results = []
        const requestOrigin = new URL(request.url).origin
        const isLocalRequest = /localhost|127\.0\.0\.1/.test(requestOrigin)
        const configuredBaseUrl =
            process.env.EMAIL_BASE_URL ||
            (isLocalRequest ? requestOrigin : 'https://speed-dating-in.vercel.app')
        const baseUrl = configuredBaseUrl.replace(/\/+$/, '')
        console.log(`Using email base URL: ${baseUrl}`)

        for (const participant of participants) {
            // Create magic link and password
            const { magicLink, password } = await createMagicLink(participant.email)
            const hashedPassword = await hashPassword(password)

            // Update participant with password
            await prisma.participant.update({
                where: { id: participant.id },
                data: { password: hashedPassword },
            })

            // Log credentials to console
            const magicLinkUrl = `${baseUrl}/auth/callback?token=${magicLink.token}&type=user`
            console.log(`\n📧 EMAIL SENT TO: ${participant.email}`)
            console.log(`🔗 Magic Link: ${magicLinkUrl}`)
            console.log(`👤 Username: ${participant.email}`)
            console.log(`🔐 Password: ${password}\n`)

            // Send email if transporter is configured
            if (transporter) {
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
                                    <p>Your login credentials have been generated. You can now log in to view your matches:</p>
                                    
                                    <div style="background-color: #f3f4f6; padding: 15px; border-radius: 5px; margin: 20px 0;">
                                        <p><strong>🔗 Click to Login:</strong></p>
                                        <p><a href="${magicLinkUrl}" style="background-color: #a855f7; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">Login Now</a></p>
                                        <p style="font-size: 12px; color: #666;">(Link expires in 5 hours)</p>
                                        
                                        <hr style="margin: 15px 0;" />
                                        
                                        <p><strong>Alternative Login:</strong></p>
                                        <p><strong>Email:</strong> ${participant.email}</p>
                                        <p><strong>Password:</strong> <code style="background-color: #e5e7eb; padding: 5px 10px; border-radius: 3px;">${password}</code></p>
                                    </div>
                                    
                                    <p>Visit <a href="${baseUrl}" style="color: #a855f7;">the app</a> to get started.</p>
                                    
                                    <p>Don't share these credentials with anyone!</p>
                                    <p>Best regards,<br/>The Speed Dating Team 💕</p>
                                </body>
                            </html>
                        `,
                    })
                } catch (emailError) {
                    console.error(`Failed to send email to ${participant.email}:`, emailError)
                }
            }

            results.push({
                email: participant.email,
                success: true,
                message: 'Credentials sent',
                magicLink: magicLinkUrl,
                password: password,
            })
        }

        const successCount = results.filter((r) => r.success).length

        return NextResponse.json({
            success: true,
            message: `Credentials sent to ${successCount} participant(s)`,
            results,
        })
    } catch (error) {
        console.error('Send passwords error:', error)
        return NextResponse.json(
            { error: 'Failed to send credentials' },
            { status: 500 }
        )
    }
}
