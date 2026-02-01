const XLSX = require('xlsx');

// Create sample data with correct column names
const sampleData = [
    {
        'Name': 'John Smith',
        'Email Address': 'john@example.com',
        'Age': 28,
        'Sex': 'male',
        'Partner sex preference': 'female',
        'About Me': 'Outgoing, love hiking and travel. Software engineer by day, adventurer on weekends.',
        'Looking For': 'Someone adventurous and kind, who enjoys nature and meaningful conversations.',
        'Personality': 'ENFP - Extroverted, Intuitive, Feeling, Perceiving. Fun-loving and spontaneous.',
        'Arrived': 'Yes'
    },
    {
        'Name': 'Sarah Jones',
        'Email Address': 'sarah@example.com',
        'Age': 26,
        'Sex': 'female',
        'Partner sex preference': 'male',
        'About Me': 'Creative designer, passionate about art and coffee. Always up for a good conversation.',
        'Looking For': 'Genuine connection with someone intelligent and kind. Someone who listens.',
        'Personality': 'INFJ - Introverted, Intuitive, Feeling, Judging. Deep thinker, empathetic.',
        'Arrived': 'Yes'
    },
    {
        'Name': 'Mike Davis',
        'Email Address': 'mike@example.com',
        'Age': 30,
        'Sex': 'male',
        'Partner sex preference': 'female',
        'About Me': 'Tech enthusiast, coffee lover, startup founder. Into board games and sci-fi.',
        'Looking For': 'Intelligent and kind person. Someone who can challenge me intellectually.',
        'Personality': 'INTP - Introverted, Intuitive, Thinking, Perceiving. Logical and analytical.',
        'Arrived': 'No'
    },
    {
        'Name': 'Emma Wilson',
        'Email Address': 'emma@example.com',
        'Age': 27,
        'Sex': 'female',
        'Partner sex preference': 'male',
        'About Me': 'Yoga instructor, plant-based foodie, love yoga and wellness. Always seeking balance.',
        'Looking For': 'Someone health-conscious and open-minded. Must love nature and animals.',
        'Personality': 'ISFP - Introverted, Sensing, Feeling, Perceiving. Artistic and adventurous.',
        'Arrived': 'Yes'
    },
    {
        'Name': 'Alex Chen',
        'Email Address': 'alex@example.com',
        'Age': 29,
        'Sex': 'male',
        'Partner sex preference': 'female',
        'About Me': 'Musician, music producer. Love live music and creating new sounds.',
        'Looking For': 'Creative person who appreciates music and art. Someone spontaneous.',
        'Personality': 'ESFP - Extroverted, Sensing, Feeling, Perceiving. Spontaneous and creative.',
        'Arrived': 'Yes'
    },
    {
        'Name': 'Lisa Anderson',
        'Email Address': 'lisa@example.com',
        'Age': 25,
        'Sex': 'female',
        'Partner sex preference': 'male',
        'About Me': 'Marketing professional, fitness enthusiast. Love running and trying new restaurants.',
        'Looking For': 'Ambitious person with good humor. Someone who enjoys both active and quiet time.',
        'Personality': 'ESTJ - Extroverted, Sensing, Thinking, Judging. Organized and goal-oriented.',
        'Arrived': 'Yes'
    }
];

// Create workbook and worksheet
const ws = XLSX.utils.json_to_sheet(sampleData);
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, 'Participants');

// Adjust column widths for readability
ws['!cols'] = [
    { wch: 15 },  // Name
    { wch: 20 },  // Email Address
    { wch: 8 },   // Age
    { wch: 10 },  // Sex
    { wch: 25 },  // Partner sex preference
    { wch: 35 },  // About Me
    { wch: 35 },  // Looking For
    { wch: 30 },  // Personality
    { wch: 10 }   // Arrived
];

// Save file
XLSX.writeFile(wb, 'sample_participants.xlsx');
console.log('✅ Sample Excel file created: sample_participants.xlsx');
