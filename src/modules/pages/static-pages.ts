/**
 * Static Pages Routes
 * مسارات الصفحات الثابتة
 */

import { Hono } from 'hono';
import type { Bindings, Variables } from '../../config/types';

const staticPagesRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

/**
 * Privacy Policy HTML - صفحة سياسة الخصوصية
 */
const getPrivacyPolicyHTML = (): string => `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Privacy Policy - Dueli</title>
    <style>
        body { font-family: system-ui, -apple-system, sans-serif; line-height: 1.6; color: #333; max-width: 800px; margin: 0 auto; padding: 20px; }
        h1 { color: #7c3aed; }
        h2 { color: #1f2937; margin-top: 30px; }
        ul { padding-left: 20px; }
        li { margin-bottom: 10px; }
        .container { background: #fff; padding: 40px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .footer { margin-top: 50px; font-size: 0.9em; color: #666; text-align: center; }
    </style>
</head>
<body style="background-color: #f9fafb;">
    <div class="container">
        <h1>Privacy Policy</h1>
        <p><strong>Last Updated: December 2025</strong></p>
        <p>Welcome to <strong>Dueli</strong>. We are committed to protecting your personal information and your right to privacy.</p>
        <h2>1. Information We Collect</h2>
        <ul>
            <li><strong>Personal Information:</strong> Name, email address, profile picture (from OAuth providers).</li>
            <li><strong>Usage Data:</strong> Competitions created, comments, ratings.</li>
        </ul>
        <h2>2. How We Use Your Information</h2>
        <ul>
            <li>To provide and improve the Dueli platform services.</li>
            <li>To personalize your experience.</li>
            <li>To ensure platform security.</li>
        </ul>
        <h2>3. Data Sharing</h2>
        <p>We do not sell your personal data. We may share data with service providers under strict confidentiality agreements.</p>
        <h2>4. Your Rights</h2>
        <p>You have the right to access, correct, or delete your personal data.</p>
        <h2>5. Contact Us</h2>
        <p>Email: <a href="mailto:support@maelsh.com">support@maelsh.com</a></p>
        <div class="footer"><p>&copy; 2025 Maelsh Pro. All rights reserved.</p></div>
    </div>
</body>
</html>`;

/**
 * Data Deletion HTML - صفحة تعليمات حذف البيانات
 */
const getDataDeletionHTML = (): string => `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Data Deletion Instructions - Dueli</title>
    <style>
        body { font-family: system-ui, -apple-system, sans-serif; line-height: 1.6; color: #333; max-width: 800px; margin: 0 auto; padding: 20px; }
        h1 { color: #dc2626; }
        h2 { color: #1f2937; margin-top: 30px; }
        .container { background: #fff; padding: 40px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .step { margin-bottom: 20px; padding: 15px; background: #f3f4f6; border-radius: 6px; }
        .step strong { display: block; margin-bottom: 5px; color: #4b5563; }
    </style>
</head>
<body style="background-color: #f9fafb;">
    <div class="container">
        <h1>Data Deletion Instructions</h1>
        <p>If you want to delete your data from Dueli, follow these instructions:</p>
        <h2>How to Remove Your Data</h2>
        <div class="step">
            <strong>Option 1: In-App Deletion</strong>
            1. Log into your account.<br>
            2. Go to Profile Settings.<br>
            3. Click "Delete Account".<br>
            4. Confirm the action.
        </div>
        <div class="step">
            <strong>Option 2: Email Request</strong>
            1. Send an email to <a href="mailto:support@maelsh.com">support@maelsh.com</a>.<br>
            2. Subject: "Data Deletion Request".<br>
            3. Include your registered email address.<br>
            4. We will process within 7 business days.
        </div>
        <h2>What Data is Deleted?</h2>
        <ul>
            <li>Your profile information (Name, Avatar).</li>
            <li>Your authentication tokens.</li>
            <li>Your competition history and comments.</li>
        </ul>
    </div>
</body>
</html>`;

/**
 * Deletion Status HTML - صفحة حالة الحذف
 */
const getDeletionStatusHTML = (code: string): string => `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Data Deletion Status - Dueli</title>
    <style>
        body { font-family: system-ui, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; text-align: center; }
        .card { background: #fff; padding: 40px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); }
        h1 { color: #22c55e; }
        .code { background: #f3f4f6; padding: 15px; border-radius: 8px; font-family: monospace; margin: 20px 0; }
    </style>
</head>
<body style="background: #f9fafb;">
    <div class="card">
        <h1>✓ Data Deletion Request Received</h1>
        <p>Your data deletion request has been received and is being processed.</p>
        <div class="code"><strong>Confirmation Code:</strong><br>${code}</div>
        <p>Your data will be deleted within 30 days.</p>
        <p>If you have questions, contact: <a href="mailto:support@maelsh.com">support@maelsh.com</a></p>
    </div>
</body>
</html>`;

// Privacy Policy Routes
staticPagesRoutes.get('/privacy-policy.html', (c) => c.html(getPrivacyPolicyHTML()));
staticPagesRoutes.get('/privacy-policy', (c) => c.html(getPrivacyPolicyHTML()));

// Data Deletion Routes
staticPagesRoutes.get('/data-deletion.html', (c) => c.html(getDataDeletionHTML()));
staticPagesRoutes.get('/data-deletion', (c) => c.html(getDataDeletionHTML()));

// TikTok Verification File
staticPagesRoutes.get('/tiktokJ1mxZ8w8FhnDIkHqfGNq0ney95Smz9PQ.txt', (c) => {
  return c.text('tiktok-developers-site-verification=J1mxZ8w8FhnDIkHqfGNq0ney95Smz9PQ.');
});

// Facebook Data Deletion Callback
staticPagesRoutes.post('/api/facebook/data-deletion', async (c) => {
  try {
    const body = await c.req.parseBody();
    const signedRequest = body['signed_request'] as string;

    if (!signedRequest) {
      return c.json({ error: 'Missing signed_request' }, 400);
    }

    const [encodedSig, payload] = signedRequest.split('.', 2);

    if (!payload) {
      return c.json({ error: 'Invalid signed_request format' }, 400);
    }

    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = atob(base64);
    const data = JSON.parse(jsonPayload);

    const userId = data.user_id;
    const confirmationCode = `DEL-${userId}-${Date.now()}`;

    const statusUrl = `https://project-8e7c178d.pages.dev/deletion-status?code=${confirmationCode}`;

    return c.json({
      url: statusUrl,
      confirmation_code: confirmationCode
    });
  } catch (error) {
    console.error('Facebook data deletion error:', error);
    return c.json({ error: 'Failed to process request' }, 500);
  }
});

// Deletion Status Page
staticPagesRoutes.get('/deletion-status', (c) => {
  const code = c.req.query('code') || 'N/A';
  return c.html(getDeletionStatusHTML(code));
});

// .well-known handler
staticPagesRoutes.get('/.well-known/*', (c) => {
  return c.notFound();
});

export default staticPagesRoutes;
