-- Reset Database for Dueli
-- Run this FIRST: npx wrangler d1 execute dueli-db --file=scripts/reset-db.sql --local

-- Drop all dependent tables first
DROP TABLE IF EXISTS user_settings;
DROP TABLE IF EXISTS user_earnings;
DROP TABLE IF EXISTS competition_reminders;
DROP TABLE IF EXISTS ad_impressions;
DROP TABLE IF EXISTS advertisements;
DROP TABLE IF EXISTS likes;
DROP TABLE IF EXISTS reports;
DROP TABLE IF EXISTS messages;
DROP TABLE IF EXISTS conversations;
DROP TABLE IF EXISTS notifications;
DROP TABLE IF EXISTS scheduled_competitions;
DROP TABLE IF EXISTS competition_requests;
DROP TABLE IF EXISTS competition_invites;
DROP TABLE IF EXISTS follows;
DROP TABLE IF EXISTS ratings;
DROP TABLE IF EXISTS comments;
DROP TABLE IF EXISTS post_likes;
DROP TABLE IF EXISTS posts;
DROP TABLE IF EXISTS user_posts;
DROP TABLE IF EXISTS competitions;
DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS countries;
DROP TABLE IF EXISTS categories;

-- Confirm reset
SELECT 'Database reset complete!' as status;
