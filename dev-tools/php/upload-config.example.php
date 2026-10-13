<?php
// Rename to upload-config.php alongside upload.php. Never commit the secret.
// Alternatively set DUELI_UPLOAD_CONFIG to its absolute private server path.
return [
    'platform_url' => 'https://dueli.maelshpro.com',
    // MUST exactly match the existing Worker UPLOAD_SERVER_SECRET.
    // This is NOT a Cloudflare API token, password or an arbitrary new secret.
    'upload_secret' => 'REPLACE_WITH_EXISTING_UPLOAD_SERVER_SECRET',
    'browser_origins' => [
        'https://dueli.maelshpro.com',
        'https://www.dueli.maelshpro.com',
        'https://project-8e7c178d.pages.dev',
    ],
    // Keep this aligned with stream.php's existing storage root.
    'storage_root' => __DIR__ . '/storage',
    // Optional for a first storage/HMAC test. Without a measured duration,
    // the chunk remains uploaded, NOT ready. Library is not included.
    // Unpack the official getID3 package; include only its getid3 folder,
    // not demos. No FFmpeg or binaries are invoked.
    'getid3_loader' => __DIR__ . '/getid3/getid3.php',
];
