/**
 * English Translations
 */
export const en = {
    // General
    app_title: 'Dueli',
    app_subtitle: 'Connect via Competition',
    home: 'Home',
    explore: 'Explore',
    live: 'Live Stream',
    recorded: 'Recorded',
    upcoming: 'Upcoming',
    profile: 'Profile',
    settings: 'Settings',
    logout: 'Logout',
    login: 'Login',
    register: 'Register',
    search_placeholder: 'Search for a duel, scientist, or talent...',
    filter: 'Filter',
    all: 'All',
    help: 'Help',
    theme: 'Dark/Light Mode',
    language: 'Language',
    country_language: 'Country & Language',
    search_country: 'Search country...',
    users: 'Users',

    // Categories
    categories: {
        dialogue: 'Dialogue',
        science: 'Science',
        talents: 'Talents',

        // Dialogue subcategories
        religions: 'Religious Dialogue',
        sects: 'Sectarian Dialogue',
        politics: 'Political Dialogue',
        economics: 'Economic Dialogue',
        ethnic_conflicts: 'Ethnic Conflicts',
        local_events: 'Local Events',
        global_events: 'Global Events',
        disputes: 'Other Disputes',
        other_disputes: 'Other Disputes',

        // Science subcategories
        physics: 'Physics',
        chemistry: 'Chemistry',
        math: 'Mathematics',
        astronomy: 'Astronomy',
        biology: 'Biology',
        technology: 'Technology',
        energy: 'Energy',
        economics_science: 'Economics',
        mixed: 'Mixed Sciences',
        other_science: 'Other Sciences',

        // Talents subcategories
        physical: 'Physical Talents',
        mental: 'Mental Talents',
        vocal: 'Vocal Talents',
        poetry: 'Poetic Talents',
        psychological: 'Psychological',
        creative: 'Creative Talents',
        crafts: 'Crafts',
        other_talents: 'Other Talents'
    },

    // Sections
    sections: {
        suggested: 'Suggested for You',
        dialogue: 'Dialogue Arena',
        science: 'Science Lab',
        talents: 'Talent Stage'
    },

    // Dialogue subcategories
    religions: 'Religions',
    sects: 'Sects',
    politics: 'Politics',
    economics: 'Economics',
    current_affairs: 'Current Affairs',
    disputes: 'Other Disputes',

    // Science subcategories
    physics: 'Physics',
    biology: 'Biology',
    chemistry: 'Chemistry',
    math: 'Mathematics',
    technology: 'Technology',
    medicine: 'Medicine',
    philosophy: 'Philosophy',

    // Talents subcategories
    singing: 'Singing',
    poetry: 'Poetry',
    art: 'Art',
    sports: 'Sports',
    comedy: 'Comedy',
    cooking: 'Cooking',
    gaming: 'Gaming',
    magic: 'Magic',

    // Competitions
    competition: 'Competition',
    competitions: 'Competitions',
    create_competition: 'Create Competition',
    join_competition: 'Join Competition',
    watch_competition: 'Watch Competition',
    competition_title: 'Competition Title',
    competition_rules: 'Competition Rules',
    competition_description: 'Competition Description',
    select_category: 'Select Category',
    select_subcategory: 'Select Subcategory',
    scheduled_time: 'Scheduled Time',
    request_join: 'Request to Join',
    cancel_request: 'Cancel Request',
    request_sent: 'Request sent',
    rules_placeholder: '1. Speaking time per side\n2. Dialogue rules\n3. Evaluation criteria',
    error_occurred: 'Error occurred',

    // Statuses
    status_pending: 'Waiting for opponent',
    status_accepted: 'Accepted',
    status_live: 'Live',
    status_completed: 'Completed',
    status_cancelled: 'Cancelled',
    status_ongoing: 'Ongoing',

    // Actions
    invite: 'Invite',
    accept: 'Accept',
    decline: 'Decline',
    cancel: 'Cancel',
    send: 'Send',
    save: 'Save',
    edit: 'Edit',
    delete: 'Delete',
    follow: 'Follow',
    unfollow: 'Unfollow',

    // Rating
    rate: 'Rate',
    rating: 'Rating',
    viewers: 'views',

    // Comments
    comment: 'Comment',
    comments: 'Comments',
    add_comment: 'Add Comment',
    live_chat: 'Live Chat',

    // Login
    login_with_google: 'Continue with Google',
    login_with_facebook: 'Continue with Facebook',
    login_with_microsoft: 'Continue with Microsoft',
    login_with_twitter: 'Continue with X',
    login_welcome: 'Welcome to Dueli',
    login_subtitle: 'Sign in to participate in competitions',
    login_button: 'Login',
    register_button: 'Create Account',
    email_label: 'Email',
    password_label: 'Password',
    name_label: 'Name',
    forgot_password: 'Forgot Password?',
    or_divider: 'Or',
    terms_agreement: 'By continuing, you agree to our Terms and Privacy Policy',
    back_to_login: 'Back to Login',
    reset_password_title: 'Reset Password',
    send_code: 'Send Verification Code',
    verification_code_label: 'Verification Code',
    code_sent_to_email: 'Code sent to your email',
    verify_code: 'Verify Code',
    new_password_label: 'New Password',
    change_password: 'Change Password',
    password_min_length: 'Password must be at least 8 characters',
    or_continue_with: 'Or continue with',

    // User
    user: 'User',
    username: 'Username',
    email: 'Email',
    display_name: 'Display Name',
    bio: 'Bio',
    country: 'Country',
    my_competitions: 'My Competitions',
    my_requests: 'My Requests',

    // Stats
    stats: 'Statistics',
    total_competitions: 'Total Competitions',
    total_wins: 'Wins',
    total_views: 'Views',
    followers: 'Followers',
    following: 'Following',

    // Errors
    error: 'Error',
    not_found: 'Not Found',
    unauthorized: 'Unauthorized',
    forbidden: 'Forbidden',
    server_error: 'Server error. Please try again.',
    login_required: 'Login required',
    no_duels: 'Sorry, no duels available here currently.',
    try_different_filter: 'Try a different filter or create a new competition',
    error_loading: 'Error loading',
    page_not_found: 'Page Not Found',
    back_to_home: 'Back to Home',

    // API Errors (used by controllers)
    errors: {
        missing_fields: 'Missing required fields',
        content_required: 'Content is required',
        invalid_rating: 'Rating must be between 1 and 5',
        invalid_request: 'Invalid request',
        fetch_failed: 'Failed to fetch data',
        create_failed: 'Failed to create',
        update_failed: 'Failed to update',
        delete_failed: 'Failed to delete',
        something_wrong: 'Something went wrong. Please try again.',
    },

    // Competition Error Messages
    competition_errors: {
        not_found: 'Competition not found',
        cannot_join_own: 'Cannot join your own competition',
        already_requested: 'You have already requested to join',
        not_completed: 'Competition is not completed',
        already_rated: 'You have already rated this competitor',
    },

    // User Error Messages
    user_errors: {
        not_found: 'User not found',
        cannot_follow_self: 'Cannot follow yourself',
    },

    // Category Messages
    category: {
        not_found: 'Category not found',
    },
    success: 'Success',

    // Footer
    footer: '© 2025 Dueli. All rights reserved.',
    about: 'About',
    contact: 'Contact Us',
    terms: 'Terms of Service',
    privacy: 'Privacy Policy',

    // Actions
    view_all: 'View All',
    load_more: 'Load More',
    back: 'Back',
    close: 'Close',
    submit: 'Submit',
    loading: 'Loading...',
    no_more: 'No more results',
    go_home: 'Go to Home',
    go_back: 'Go Back',

    // Auth - API messages
    auth_all_fields_required: 'All fields are required',
    auth_email_exists: 'Email already exists',
    auth_register_success: 'Registration successful! Please check your email.',
    auth_register_failed: 'Registration failed',
    auth_invalid_link: 'Invalid or expired verification link',
    auth_account_activated: 'Account activated successfully!',
    auth_email_password_required: 'Email and password are required',
    auth_invalid_credentials: 'Invalid email or password',
    auth_verify_email_first: 'Please verify your email first',
    auth_email_required: 'Email is required',
    auth_user_not_found: 'User not found or already verified',
    auth_verification_resent: 'Verification email sent',
    auth_reset_if_exists: 'If this email is registered, you will receive a reset link',
    auth_reset_code_sent: 'Reset code sent to your email',
    auth_email_code_required: 'Email and code are required',
    auth_invalid_code: 'Invalid or expired code',
    auth_code_verified: 'Code verified',
    auth_password_required: 'New password is required',
    auth_password_changed: 'Password changed successfully',
    auth_email_not_verified: 'Please verify your email before logging in',
    auth_invalid_token: 'Invalid or expired token',
    auth_email_verified: 'Email verified successfully! You can now log in.',
    auth_connection_failed: 'Connection failed. Please try again.',

    // Verification
    verification_failed: 'Verification failed',
    verification_invalid_link: 'Invalid link',
    verification_success_msg: 'You can now log into your account',
    verification_check_link: 'Please check the link or request a new one',
    account_verification: 'Account Verification',

    // About page
    about_title: 'Dueli Competition Platform',
    about_description: 'The first platform of its kind combining live competitions, constructive dialogues, and talent discovery in a fair interactive environment.',
    about_live_streaming: 'Live Streaming & Interaction',
    about_live_streaming_desc: 'Advanced streaming system bringing competitors side-by-side with audience interaction and live voting.',
    about_fair_judging: 'Fair Judging System',
    about_fair_judging_desc: 'Transparent judging mechanisms based on audience voting and expert panels to ensure fairness.',
    about_global_community: 'Global Community',
    about_global_community_desc: 'Connect with creators and thinkers from around the world and participate in cross-border competitions.',
    about_platform_preview: 'Platform Preview',
    about_developed_by: 'Developed by Maelsh',
    about_maelsh_desc: 'At Maelsh, we believe in the power of dialogue and fair competition in building communities. We strive to provide innovative software solutions that combine aesthetics and functionality to serve the Arab and global user.',
    about_dueli: 'About Dueli',

    // Competition page
    competitors: 'Competitors',
    awaiting_opponent: 'Awaiting Opponent',
    login_to_compete: 'Login to Compete',
    stream_not_available: 'Stream not available',
    no_comments_yet: 'No comments yet',
    new_follower: 'New Follower',

    // Email
    email_activate_subject: 'Activate your Dueli account',
    email_reset_subject: 'Reset Your Password',

    // Notifications
    notification: {
        new_join_request: 'New Join Request',
        join_request_for: 'Join request for competition',
        request_accepted: 'Request Accepted',
        request_accepted_message: 'Your request to join the competition has been accepted',
        new_message: 'New Message',
    },

    // Messages
    messages: {
        title: 'Messages',
        select_conversation: 'Select a conversation',
        no_conversations: 'No conversations yet',
        no_messages: 'No messages yet',
        type_message: 'Type a message...',
        enter_message: 'Enter your message',
    },

    // Settings Page
    settings_page: {
        title: 'Settings',
        language: 'Default Language',
        country: 'Default Country',
        privacy: 'Profile Privacy',
        privacy_public: 'Public',
        privacy_followers: 'Followers Only',
        privacy_private: 'Private',
        notifications: 'Enable Notifications',
        email_notifications: 'Email Notifications',
        save: 'Save Settings',
        saved: 'Settings saved successfully',
    },

    // Reports
    report: {
        title: 'Report',
        reason: 'Reason',
        select_reason: 'Select a reason',
        description: 'Additional Details',
        description_placeholder: 'Provide more details about the issue...',
        submit: 'Submit Report',
        submitted: 'Report submitted successfully',
        already_reported: 'You have already reported this',
        reason_spam: 'Spam',
        reason_harassment: 'Harassment',
        reason_fake_account: 'Fake Account',
        reason_inappropriate_content: 'Inappropriate Content',
        reason_misleading: 'Misleading',
        reason_copyright: 'Copyright Violation',
        reason_hate_speech: 'Hate Speech',
        reason_other: 'Other',
    },

    // Schedule
    schedule: {
        title: 'My Schedule',
        reminders: 'Reminders',
        upcoming: 'Upcoming Competitions',
        empty: 'No scheduled competitions',
        creator: 'Creator',
        add_reminder: 'Set Reminder',
        remove_reminder: 'Remove Reminder',
        reminder_set: 'Reminder set!',
        reminder_removed: 'Reminder removed',
        not_scheduled: 'Competition is not scheduled',
        already_set: 'Reminder already set',
        not_found: 'Reminder not found',
    },

    // Likes
    like: {
        already_liked: 'Already liked',
        not_found: 'Like not found',
    },

    // Posts
    post: {
        content_required: 'Post content is required',
        created: 'Post created',
        deleted: 'Post deleted',
    },

    // Auth (nested for client-side usage)
    auth: {
        login_success: 'Login successful!',
        logout_success: 'Logged out successfully',
        connection_failed: 'Connection failed. Please try again.',
    },

    // Client-side toasts
    client: {
        toast: {
            welcome: 'Welcome back!',
            allow_popups: 'Please allow popups for OAuth login',
        },
    },

    // Search
    search: {
        no_results: 'No results found',
    },

    // Profile page (new)
    wins: 'Wins',
    posts: 'Posts',
    no_competitions: 'No competitions yet',
    no_posts: 'No posts yet',
    edit_profile: 'Edit Profile',
    send_message: 'Message',

    // Competition status (new)
    completed: 'Completed',
    view: 'View',
    confirm_delete: 'Are you sure you want to delete?',

    // Requests (new)
    received_requests: 'Received',
    sent_requests: 'Sent',
    no_requests: 'No requests yet',
    wants_to_join: 'Wants to join your competition',
    you_requested: 'You requested to join',

    // Interaction buttons (new)
    remind_me: 'Remind Me',
    reminder_added: 'Reminder added!',
    report_inappropriate: 'Inappropriate content',
    report_spam: 'Spam or misleading',
    report_harassment: 'Harassment or bullying',
    report_submitted: 'Report submitted. Thank you!',
    select_reason: 'Please select a reason',

    // Jitsi / Live (new)
    jitsi_not_configured: 'Live streaming is not configured yet.',
    confirm_end_call: 'Are you sure you want to end the call?',

    // Navigation (new)
    notifications: 'Notifications',
    mark_all_read: 'Mark all read',
    no_messages: 'No messages',
    earnings: 'Earnings',
    donate: 'Support',
    contact_admin: 'Contact Admin',
    submit_report: 'Submit Report',
    no_notifications: 'No notifications',

    // Earnings Page
    available: 'Available',
    pending: 'Pending',
    on_hold: 'On Hold',
    ad_revenue: 'Ad Revenue',
    total_earnings: 'Total Earnings',
    from_competitions: 'From competitions',
    withdrawn: 'Withdrawn',
    to_bank: 'To bank account',
    withdraw: 'Withdraw',
    min_withdrawal: 'Minimum withdrawal: $50.00',
    request_withdrawal: 'Request Withdrawal',

    // Reports Page
    report_type: 'Report Type',
    report_inappropriate_desc: 'Offensive or harmful content',
    report_spam_desc: 'Fake or deceptive content',
    report_harassment_desc: 'Targeting or attacking others',
    other: 'Other',
    other_desc: 'Something else',
    subject: 'Subject',
    enter_subject: 'Enter subject',
    describe_issue: 'Please describe the issue in detail',

    // Donate Page
    support_dueli: 'Support Dueli',
    support_message: 'Help us build a better platform for meaningful conversations and connections.',
    coffee: 'Buy us a coffee',
    supporter: 'Supporter',
    champion: 'Champion',
    custom_amount: 'Or enter a custom amount',
    donate_now: 'Donate Now',
    top_supporters: 'Top Supporters',
};

