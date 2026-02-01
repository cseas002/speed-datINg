# 💕 Speed Dating Event Matching Platform

An AI-powered Next.js application for speed dating events that matches participants based on personality and preferences, tracks rankings, and provides intelligent match insights.

## Features

- **Email + password login** for participants
- **Password-protected admin panel** for event management
- **Excel file upload** with automatic participant data import
- **AI-powered matching** using DeepSeek LLM that generates top 7 matches per person with reasoning
- **Sex preference matching** to ensure compatible pairings
- **Post-event ranking** where users rate their dates
- **Conditional LLM insights** - admin controls when match reasoning is published
- **Real-time dashboard** for viewing matches and updating rankings

## Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure `.env.local`
```env
DATABASE_URL="postgresql://user:password@ep-xxxx.us-east-1.neon.tech/dbname?sslmode=require"
DEEPSEEK_API_KEY="your-openrouter-api-key-here"
ADMIN_PASSWORD="your-secure-password-here"
GMAIL_ADDRESS="your-gmail-address"
GMAIL_PASSWORD="your-gmail-app-password"
GMAIL_NAME="Speed Dating App"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
SESSION_SECRET="your-random-secret-key-here"
```

### 3. Set Up Database
```bash
npm run db:push
```

### 4. Run Development Server
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to get started.

### Admin Login Note
The allowed admin email is currently defined in as an environment variable. Update it to match the email you will use for admin access.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
