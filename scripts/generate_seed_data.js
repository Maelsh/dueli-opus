
import fs from 'fs';

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

const users = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 18];
const statuses = ['live', 'recorded', 'pending'];
const languages = ['en', 'ar'];
const countries = ['US', 'SA', 'EG', 'GB', 'AE', 'KW'];

function getRandom(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function getRandomDate(status) {
    if (status === 'live') return "datetime('now', '-30 minutes')";
    if (status === 'recorded') return "datetime('now', '-5 days')";
    return "datetime('now', '+2 days')";
}

let sql = `
-- ============================================
-- GENERATED SEED DATA (Automatic)
-- ============================================
`;

let idCounter = 100; // Start high to avoid collision

subcategories.forEach(sub => {
    sql += `\n-- Subcategory: ${sub.name} (ID: ${sub.id})\n`;

    for (let i = 0; i < 10; i++) {
        const id = idCounter++;
        const title = `${sub.name} Challenge #${i + 1}`;
        const desc = `An amazing competition about ${sub.name} topics.Join us!`;
        const rules = 'Be respectful, no spam, standard rules apply.';
        const creator = getRandom(users);
        let opponent = getRandom(users);
        while (opponent === creator) opponent = getRandom(users);

        const status = getRandom(statuses);
        const lang = getRandom(languages);
        const country = getRandom(countries);

        // Handling dates and opponent based on status
        let started_at = 'NULL';
        let ended_at = 'NULL';
        let scheduled_at = 'NULL';

        if (status === 'live') {
            started_at = "datetime('now', '-30 minutes')";
        } else if (status === 'recorded') {
            started_at = "datetime('now', '-5 days')";
            ended_at = "datetime('now', '-5 days', '+1 hour')";
        } else {
            scheduled_at = "datetime('now', '+2 days')";
            opponent = 'NULL';
            if (Math.random() > 0.5) {
                opponent = getRandom(users);
                if (opponent === creator) opponent = 'NULL';
            } else {
                opponent = 'NULL';
            }
        }

        const views = Math.floor(Math.random() * 5000) + 100;
        const likes = Math.floor(views * 0.1);
        const dislikes = Math.floor(likes * 0.05);

        const opponentVal = opponent === 'NULL' ? 'NULL' : opponent;

        sql += `INSERT INTO competitions (id, title, description, rules, category_id, subcategory_id, creator_id, opponent_id, status, language, country, total_views, started_at, ended_at, scheduled_at, likes_count, dislikes_count) VALUES (${id}, '${title}', '${desc}', '${rules}', ${sub.parent}, ${sub.id}, ${creator}, ${opponentVal}, '${status}', '${lang}', '${country}', ${views}, ${started_at}, ${ended_at}, ${scheduled_at}, ${likes}, ${dislikes});\n`;
    }
});


fs.appendFileSync('seed.sql', sql);
console.log('Seed data appended to seed.sql');
