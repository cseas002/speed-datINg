import crypto from 'crypto'
import { prisma } from './db'

const SESSION_DURATION = 7 * 24 * 60 * 60 * 1000 // 7 days
const ADMIN_SESSION_DURATION = 24 * 60 * 60 * 1000 // 24 hours

// Simple password hashing using crypto (for demo purposes)
// In production, use bcrypt or similar
export async function hashPassword(password: string): Promise<string> {
  return crypto.createHash('sha256').update(password).digest('hex')
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const hashed = crypto.createHash('sha256').update(password).digest('hex')
  return hashed === hash
}

// User Session Management
export async function createEmailSession(email: string) {
  const token = crypto.randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + SESSION_DURATION)

  // Delete any existing sessions for this email
  await prisma.session.deleteMany({ where: { email } })

  // Create new session
  const session = await prisma.session.create({
    data: {
      email,
      token,
      expiresAt,
    },
  })

  return session
}

export async function verifyEmailSession(token: string) {
  const session = await prisma.session.findUnique({
    where: { token },
  })

  if (!session) {
    return null
  }

  // Check if session is expired
  if (new Date() > session.expiresAt) {
    await prisma.session.delete({ where: { id: session.id } })
    return null
  }

  return session
}

export async function deleteSession(token: string) {
  await prisma.session.deleteMany({ where: { token } })
}

// Admin Session Management
export async function createAdminSession(adminId: string) {
  const token = crypto.randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + ADMIN_SESSION_DURATION)

  await prisma.adminSession.deleteMany({ where: { adminId } })

  const session = await prisma.adminSession.create({
    data: {
      adminId,
      token,
      expiresAt,
    },
  })

  return session
}

export async function verifyAdminSession(token: string) {
  const session = await prisma.adminSession.findUnique({
    where: { token },
  })

  if (!session) {
    return null
  }

  if (new Date() > session.expiresAt) {
    await prisma.adminSession.delete({ where: { id: session.id } })
    return null
  }

  return session
}

export async function deleteAdminSession(token: string) {
  await prisma.adminSession.deleteMany({ where: { token } })
}

export async function verifyAdminPassword(password: string): Promise<boolean> {
  const adminPassword = process.env.ADMIN_PASSWORD
  if (!adminPassword) {
    throw new Error('ADMIN_PASSWORD not configured')
  }
  return password === adminPassword
}
