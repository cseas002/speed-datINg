# Speed Dating Platform - Complete Setup Guide

## Overview

This is an AI-powered speed dating platform built with Next.js that:
1. **Accepts Excel files** with participant data (name, email, personality, preferences, attendance)
2. **Filters for attendees** only (those who marked "Arrived: Yes")
3. **Uses AI (DeepSeek)** to match people respecting sex preferences
4. **Ranks matches 1-7** for each person with personalized reasoning
5. **Lets users login with email** (no password) to view their matches
6. **Users can rate their dates** post-event
7. **Admin publishes LLM reasoning** when ready

---

## Step-by-Step Setup

### Prerequisites

- Node.js 18+ and npm
- PostgreSQL database (via Neon.tech - free tier available)
- DeepSeek API key (via OpenRouter.ai)

### 1. Database Setup (Neon)

1. Go to [https://neon.tech](https://neon.tech) and sign up (free tier is fine)
2. Create a new project and database
3. Copy the connection string (looks like: `postgresql://user:password@ep-xxxx.region.neon.tech/dbname?sslmode=require`)
4. Save it for the `.env.local` file

### 2. DeepSeek API Key

1. Go to [https://openrouter.ai](https://openrouter.ai)
2. Sign up and create an API key
3. Add some credits (free tier: $5 credit to start)
4. Save the key for `.env.local`

### 3. Configure Environment Variables

Create `.env.local` in the project root:

```env
# PostgreSQL via Neon
DATABASE_URL="postgresql://user:password@ep-xxxx.region.neon.tech/dbname?sslmode=require"

# DeepSeek API via OpenRouter
DEEPSEEK_API_KEY="sk-or-v1-xxxxxxxxxxxxxxxx"

# Admin password for the admin panel
ADMIN_PASSWORD="choose-a-strong-password"

# Random secret for sessions
SESSION_SECRET="$(openssl rand -hex 32)"
```

### 4. Install Dependencies and Setup Database

```bash
# Install all packages
npm install

# Create database tables
npm run db:push

# Start development server
npm run dev
```

The app should now be running at `http://localhost:3000`

---

## How to Use

### Admin Workflow

1. **Login**: Go to `/admin` and enter `ADMIN_PASSWORD`

2. **Upload Excel File**:
   - Prepare Excel with columns: Name, Email, Age, Sex, Partner sex preference, About Me, Looking For, Personality, Arrived
   - Only participants with "Arrived: Yes" are imported
   - Upload the file through admin dashboard

3. **Generate Matches**:
   - Click "Generate Matches with AI"
   - System will:
     - Filter by sex compatibility (A wants B's sex, B wants A's sex)
     - Use DeepSeek to analyze personality and preferences
     - Create top 7 matches per person with reasoning
     - Store results in database

4. **Publish Rankings** (anytime):
   - Click "Publish Rankings" to show users WHY they were matched
   - Click "Hide Rankings" to hide explanations (useful before event ends)

### User Workflow

1. **Login**: Visit `/` and enter your email
   - You'll see a temporary token in the message
   - In production, you'd get an email link; for testing, use: `/auth/callback?token=[token]`

2. **View Matches**: See your top 7 matches ranked by AI
   - Each match shows: name, age, about them, what they want
   - If admin published rankings, see WHY you were matched
   - Matches shown only after admin runs matching

3. **Rate Your Dates**: After the event, rate each person 1-5 stars
   - Ratings are saved immediately
   - Users can change ratings anytime before next event

4. **See AI Reasoning**: Once admin publishes rankings
   - Read why you were matched (e.g., "You both love hiking")
   - Compare your ratings vs AI rankings

---

## Excel File Format

### Required Columns

| Column | Type | Example | Notes |
|--------|------|---------|-------|
| Name | Text | "John Smith" | Required |
| Email | Text | "john@example.com" | Must be unique |
| Age | Number | 28 | Required |
| Sex | Text | "male" or "female" | Case-insensitive |
| Partner sex preference | Text | "female" or "male" | **Used for matching** |
| About Me | Text | "I'm outgoing, love hiking..." | Description and personality |
| Looking For | Text | "Someone adventurous..." | What they want in a match |
| Personality | Text | "ENFP, Extroverted, Creative" | Personality type/traits |
| Arrived | Text | "Yes" or "No" | **Only "Yes" are matched** |

### Sample Excel Data

```
Name,Email,Age,Sex,Partner sex preference,About Me,Looking For,Personality,Arrived
John Smith,john@example.com,28,male,female,"Outgoing, loves hiking and travel","Someone adventurous and kind","ENFP, Extroverted",Yes
Sarah Jones,sarah@example.com,26,female,male,"Creative designer, passionate about art","Genuine connection, shared interests","INFJ, Intuitive",Yes
Mike Davis,mike@example.com,30,male,female,"Tech enthusiast, coffee lover","Intelligent and kind person","INTP, Logical",No
```

---

## API Endpoints Reference

### User Endpoints
- `POST /api/auth/login` → Get login token
- `GET /api/auth/callback?token=X` → Authenticate session
- `GET /api/user/matches` → Get your matches (requires auth)
- `POST /api/user/rank` → Submit date rating (requires auth)

### Admin Endpoints
- `POST /api/admin/login` → Admin authentication
- `POST /api/admin/upload` → Upload Excel file
- `POST /api/admin/match` → Run AI matching
- `POST /api/admin/publish` → Publish/hide explanations

---

## Database Schema

### Participant
```
id, email (unique), name, age, sex, partnerSexPref
aboutMe, lookingFor, personality, arrived
```

### Match
```
id, fromId → Participant, toId → Participant
rank (1-7), reasoning, createdAt
```

### UserRanking
```
id, rankerId → Participant, rankedId → Participant ID
score (1-5), createdAt
```

### Session (Email Auth)
```
id, email, token (unique), expiresAt
```

---

## Troubleshooting

### "User not found" error
- **Cause**: Email not in uploaded Excel file or Arrived ≠ "Yes"
- **Fix**: Re-upload Excel with this email marked as Arrived: Yes

### Matches not generating
- **Cause**: API key invalid, insufficient credits, or not enough participants
- **Fix**: Check OpenRouter account balance and API key validity

### "Database connection failed"
- **Cause**: Wrong DATABASE_URL or database offline
- **Fix**: Verify Neon connection string in .env.local

### No participants imported
- **Cause**: Excel has wrong column names or "Arrived" column not recognized
- **Fix**: Verify column names match exactly (Name, Email, Age, Sex, Partner sex preference, About Me, Looking For, Personality, Arrived)

---

## Customization

### Change Admin Password
Edit `ADMIN_PASSWORD` in `.env.local` and restart

### Change Matching Rules
Edit `/app/api/admin/match/route.ts`:
- Modify the matching prompt (lines ~100-150)
- Change from 7 matches to different number

### Use Different LLM
Edit `/app/api/admin/match/route.ts`:
- Change `baseURL` and `model` to your LLM provider
- Adjust prompt format if needed

### Custom Styling
Tailwind CSS configured in `app/globals.css`
- Update colors, fonts, spacing
- All components in `/app` directory

---

## Deployment

### Vercel (Recommended)
```bash
git push  # to GitHub
# Auto-deploys to Vercel
```

### Manual Deployment
1. Build: `npm run build`
2. Upload to hosting
3. Set environment variables
4. Ensure PostgreSQL accessible from server

---

## Next Steps

1. ✅ Set up `.env.local` with credentials
2. ✅ Run `npm run db:push`
3. ✅ Start dev server with `npm run dev`
4. ✅ Test at `http://localhost:3000`
5. ✅ Upload test Excel file through admin
6. ✅ Generate and publish matches
7. ✅ Test user login and match viewing

Good luck with your speed dating event! 💕
