import fs from 'fs';

const arabicFirstNames = ['Ahmed', 'Mohamed', 'Fatima', 'Aisha', 'Omar', 'Khaled', 'Sara', 'Youssef', 'Layla', 'Ali', 'Hana', 'Ibrahim', 'Nour', 'Zahra', 'Karim', 'Rania', 'Amir', 'Lina', 'Sami', 'Dina', 'Hassan', 'Mona', 'Tarek', 'Nadia', 'Fadi', 'Laila', 'Bassam', 'Rasha', 'Jamil', 'Sahar'];
const englishFirstNames = ['John', 'Mary', 'Michael', 'Sarah', 'David', 'Emma', 'James', 'Olivia', 'Robert', 'Sophia', 'William', 'Isabella', 'Joseph', 'Charlotte', 'Thomas', 'Amelia', 'Charles', 'Mia', 'Daniel', 'Harper', 'Matthew', 'Evelyn', 'Anthony', 'Abigail', 'Mark', 'Emily', 'Donald', 'Elizabeth', 'Steven', 'Sofia'];
const lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson', 'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin', 'Lee', 'Perez', 'Thompson', 'White', 'Harris', 'Sanchez', 'Clark', 'Ramirez', 'Lewis', 'Robinson', 'Walker', 'Young', 'Allen', 'King', 'Wright', 'Scott', 'Torres', 'Nguyen', 'Hill', 'Flores', 'Green', 'Adams', 'Nelson', 'Baker', 'Hall', 'Rivera', 'Campbell', 'Mitchell', 'Carter', 'Roberts'];

const countries = ['SA', 'EG', 'AE', 'US', 'GB', 'KW', 'CA', 'AU', 'DE', 'FR'];
const arabicCountries = ['SA', 'EG', 'AE', 'KW'];

function getRandom(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

let sql = `-- ============================================\n-- MASSIVE SEED DATA FOR DUELI\n-- ============================================\n\n`;

let idCounter = 21;

// Generate 500 users
sql += `-- Users\n`;
for (let i = 0; i < 500; i++) {
    const id = idCounter++;
    const isArabic = Math.random() > 0.5;
    const firstName = isArabic ? getRandom(arabicFirstNames) : getRandom(englishFirstNames);
    const lastName = Math.random() > 0.5 ? getRandom(lastNames) : '';
    const fullName = lastName ? `${firstName} ${lastName}` : firstName;
    const username = fullName.toLowerCase().replace(/\s+/g, '') + id;
    const email = `${username}@dueli.com`;
    const passwordHash = 'dummyhash'; // Dummy hash
    const displayName = fullName;
    const avatarUrl = `https://api.dicebear.com/7.x/avataaars/svg?seed=${username}`;
    const country = getRandom(countries);
    const language = arabicCountries.includes(country) ? 'ar' : 'en';
    const isVerified = Math.random() > 0.5 ? 1 : 0;

    sql += `INSERT INTO users (id, email, username, password_hash, display_name, avatar_url, country, language, is_verified) VALUES (${id}, '${email}', '${username}', '${passwordHash}', '${displayName}', '${avatarUrl}', '${country}', '${language}', ${isVerified});\n`;
}

sql += `\n-- Competitions\n`;

const subcategories = [
    // Dialogue (IDs 4-11)
    { id: 4, name: 'Religions', parent: 1 },
    { id: 5, name: 'Sects', parent: 1 },
    { id: 6, name: 'Politics', parent: 1 },
    { id: 7, name: 'Economics', parent: 1 },
    { id: 8, name: 'Ethnic Conflicts', parent: 1 },
    { id: 9, name: 'Local Events', parent: 1 },
    { id: 10, name: 'Global Events', parent: 1 },
    { id: 11, name: 'Other Disputes', parent: 1 },

    // Science (IDs 12-21)
    { id: 12, name: 'Physics', parent: 2 },
    { id: 13, name: 'Chemistry', parent: 2 },
    { id: 14, name: 'Math', parent: 2 },
    { id: 15, name: 'Astronomy', parent: 2 },
    { id: 16, name: 'Biology', parent: 2 },
    { id: 17, name: 'Technology', parent: 2 },
    { id: 18, name: 'Energy', parent: 2 },
    { id: 19, name: 'Economics Science', parent: 2 },
    { id: 20, name: 'Mixed Sciences', parent: 2 },
    { id: 21, name: 'Other Sciences', parent: 2 },

    // Talents (IDs 22-29)
    { id: 22, name: 'Physical', parent: 3 },
    { id: 23, name: 'Mental', parent: 3 },
    { id: 24, name: 'Vocal', parent: 3 },
    { id: 25, name: 'Poetry', parent: 3 },
    { id: 26, name: 'Psychological', parent: 3 },
    { id: 27, name: 'Creative', parent: 3 },
    { id: 28, name: 'Crafts', parent: 3 },
    { id: 29, name: 'Other Talents', parent: 3 }
];

const statuses = ['live', 'completed', 'pending'];
const languages = ['en', 'ar'];
const compCountries = ['SA', 'EG', 'US', 'GB', 'AE'];

let compIdCounter = 1000;

subcategories.forEach(sub => {
    statuses.forEach(status => {
        const numComps = getRandomInt(10, 20);
        for (let i = 0; i < numComps; i++) {
            const id = compIdCounter++;
            const title = `${sub.name} ${status.charAt(0).toUpperCase() + status.slice(1)} Competition #${i + 1}`;
            const desc = `An amazing competition about ${sub.name} topics. Join us!`;
            const rules = 'Be respectful, no spam, standard rules apply.';
            const creator = getRandomInt(21, 520);
            let opponent = null;
            if (status === 'pending') {
                if (Math.random() > 0.5) {
                    opponent = getRandomInt(21, 520);
                    if (opponent === creator) opponent = null;
                }
            } else {
                opponent = getRandomInt(21, 520);
                while (opponent === creator) opponent = getRandomInt(21, 520);
            }
            const lang = getRandom(languages);
            const country = getRandom(compCountries);

            let started_at = 'NULL';
            let ended_at = 'NULL';
            let scheduled_at = 'NULL';

            if (status === 'live') {
                const minutes = getRandomInt(1, 60);
                started_at = `datetime('now', '-${minutes} minutes')`;
            } else if (status === 'completed') {
                const days = getRandomInt(1, 30);
                started_at = `datetime('now', '-${days} days')`;
                ended_at = `datetime('now', '-${days} days', '+1 hour')`;
            } else {
                const days = getRandomInt(1, 7);
                scheduled_at = `datetime('now', '+${days} days')`;
            }

            const opponentVal = opponent === null ? 'NULL' : opponent;

            sql += `INSERT INTO competitions (id, title, description, rules, category_id, subcategory_id, creator_id, opponent_id, status, language, country, started_at, ended_at, scheduled_at) VALUES (${id}, '${title}', '${desc}', '${rules}', ${sub.parent}, ${sub.id}, ${creator}, ${opponentVal}, '${status}', '${lang}', '${country}', ${started_at}, ${ended_at}, ${scheduled_at});\n`;
        }
    });
});

fs.writeFileSync('seed_massive.sql', sql);
console.log('Massive seed data written to seed_massive.sql');
