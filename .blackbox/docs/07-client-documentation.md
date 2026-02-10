# 📱 Client Documentation

This document provides comprehensive documentation for all client-side modules in the Opus Dueli application.

---

## 📂 Core Modules

### src/client/core/ApiClient.ts

#### Type
Core

#### Purpose
HTTP client for communicating with the backend API. Handles API requests with session management and error handling.

#### Exports
| Name | Type | Purpose |
|------|------|---------|
| ApiClient | class | Main API client class |
| ApiOptions | interface | Configuration options for API requests |

#### Public Methods
| Name | Parameters | Return | Purpose |
|------|------------|--------|---------|
| request | endpoint: string, options?: ApiOptions | Promise<T> | Make API request with custom options |
| get | endpoint: string | Promise<T> | Make GET request |
| post | endpoint: string, body?: any | Promise<T> | Make POST request |
| put | endpoint: string, body?: any | Promise<T> | Make PUT request |
| delete | endpoint: string, body?: any | Promise<T> | Make DELETE request |

#### Dependencies
- State (src/client/core/State.ts)

#### API Calls
- Generic API endpoints based on usage

---

### src/client/core/CookieUtils.ts

#### Type
Core

#### Purpose
Utility class for managing browser cookies.

#### Exports
| Name | Type | Purpose |
|------|------|---------|
| CookieUtils | class | Cookie management utility |

#### Public Methods
| Name | Parameters | Return | Purpose |
|------|------------|--------|---------|
| get | name: string | string \| null | Get cookie value by name |
| set | name: string, value: string, days?: number | void | Set cookie with expiration |
| delete | name: string | void | Delete cookie |

#### Dependencies
- Browser DOM API

---

### src/client/core/State.ts

#### Type
Core

#### Purpose
Global state management for the application. Handles user data, session, language, country, and theme preferences.

#### Exports
| Name | Type | Purpose |
|------|------|---------|
| State | class | Main state management class |

#### Properties
| Name | Type | Purpose |
|------|------|---------|
| currentUser | any | Current logged-in user data |
| sessionId | string \| null | Current session ID |
| lang | string | Current language |
| country | string | Current country |
| isDarkMode | boolean | Dark mode state |

#### Public Methods
| Name | Parameters | Return | Purpose |
|------|------------|--------|---------|
| getLanguage | - | string | Get language with priority chain: user DB → URL → cookie → browser |
| getCountry | - | string | Get country with priority chain: user DB → cookie → browser |
| init | - | void | Initialize state from URL, cookies, user data, and browser settings |

#### Dependencies
- CookieUtils (src/client/core/CookieUtils.ts)

---

### src/client/core/index.ts

#### Type
Core

#### Purpose
Exports all core modules for easy access.

#### Exports
- State
- ApiClient
- ApiOptions (type)
- CookieUtils
- Language (type)

---

## 🛠️ Helper Modules

### src/client/helpers/DateFormatter.ts

#### Type
Helper

#### Purpose
Date and time formatting utilities with multi-language support.

#### Exports
| Name | Type | Purpose |
|------|------|---------|
| DateFormatter | class | Date formatting utility |

#### Public Methods
| Name | Parameters | Return | Purpose |
|------|------------|--------|---------|
| format | dateStr: string, lang?: Language | string | Format date using locale settings |
| timeAgo | dateStr: string, lang?: Language | string | Format relative time (time ago) |

#### Dependencies
- State (src/client/core/State.ts)
- i18n system (src/i18n)

---

### src/client/helpers/InfiniteScroll.ts

#### Type
Helper

#### Purpose
Infinite scroll implementation for loading data dynamically.

#### Exports
| Name | Type | Purpose |
|------|------|---------|
| InfiniteScroll | class | Infinite scroll manager |

#### Public Methods
| Name | Parameters | Return | Purpose |
|------|------------|--------|---------|
| loadMore | - | Promise<void> | Load more items |
| reset | - | void | Reset and reload data |
| updateParams | newParams: Record<string, string> | void | Update params and reload |
| destroy | - | void | Destroy observer |

#### Dependencies
- ApiClient (src/client/core/ApiClient.ts)

#### API Calls
- Dynamic endpoint based on configuration

---

### src/client/helpers/LiveSearch.ts

#### Type
Helper

#### Purpose
Real-time search functionality with debouncing.

#### Exports
| Name | Type | Purpose |
|------|------|---------|
| LiveSearch | class | Live search manager |

#### Public Methods
| Name | Parameters | Return | Purpose |
|------|------------|--------|---------|
| search | - | Promise<void> | Perform search |
| show | - | void | Show results container |
| hide | - | void | Hide results container |
| clear | - | void | Clear search |

#### Dependencies
- ApiClient (src/client/core/ApiClient.ts)

#### API Calls
- Dynamic endpoint based on configuration

---

### src/client/helpers/NumberFormatter.ts

#### Type
Helper

#### Purpose
Number formatting utilities with multi-language and currency support.

#### Exports
| Name | Type | Purpose |
|------|------|---------|
| NumberFormatter | class | Number formatting utility |

#### Public Methods
| Name | Parameters | Return | Purpose |
|------|------------|--------|---------|
| format | num: number, lang?: string | string | Format number with abbreviation (K, M, B) |
| formatLocale | num: number, lang?: string | string | Format number with full locale formatting |
| formatCurrency | num: number, currency?: string, lang?: string | string | Format number as currency |
| formatPercent | num: number, lang?: string | string | Format number as percentage |

#### Dependencies
- State (src/client/core/State.ts)

---

### src/client/helpers/RecommendationEngine.ts

#### Type
Helper

#### Purpose
Personalized recommendations engine based on user interactions.

#### Exports
| Name | Type | Purpose |
|------|------|---------|
| RecommendationEngine | class | Recommendations engine |

#### Public Methods
| Name | Parameters | Return | Purpose |
|------|------------|--------|---------|
| trackView | competitionId: number, categoryId: number | void | Track user view |
| trackLike | competitionId: number, categoryId: number | void | Track user like |
| getRecommendations | competitions: Competition[], options?: RecommendationOptions | Promise<Competition[]> | Get recommended competitions |
| clearPreferences | - | void | Clear preferences |

#### Dependencies
- ApiClient (src/client/core/ApiClient.ts)
- State (src/client/core/State.ts)

---

### src/client/helpers/Utils.ts

#### Type
Helper

#### Purpose
General utility functions.

#### Exports
| Name | Type | Purpose |
|------|------|---------|
| Utils | class | General utilities |

#### Public Methods
| Name | Parameters | Return | Purpose |
|------|------------|--------|---------|
| debounce | func: T, wait: number | (...args: Parameters<T>) => void | Debounce function |
| throttle | func: T, limit: number | (...args: Parameters<T>) => void | Throttle function |
| randomString | length?: number | string | Generate random string |

---

### src/client/helpers/YouTubeHelpers.ts

#### Type
Helper

#### Purpose
YouTube video URL and thumbnail extraction utilities.

#### Exports
| Name | Type | Purpose |
|------|------|---------|
| YouTubeHelpers | class | YouTube helper functions |

#### Public Methods
| Name | Parameters | Return | Purpose |
|------|------------|--------|---------|
| extractVideoId | url: string | string \| null | Extract video ID from YouTube URL |
| getEmbedUrl | videoIdOrUrl: string, autoplay?: boolean | string | Get YouTube embed URL |
| getThumbnailUrl | videoIdOrUrl: string, quality?: string | string | Get YouTube thumbnail URL |

---

### src/client/helpers/index.ts

#### Type
Helper

#### Purpose
Exports all helper modules for easy access.

#### Exports
- DateFormatter
- NumberFormatter
- YouTubeHelpers
- Utils
- InfiniteScroll
- LiveSearch
- RecommendationEngine

---

## 📄 Page Modules

### src/client/pages/HomePage.ts

#### Type
Page

#### Purpose
Home page controller and UI management.

#### Public Methods
| Name | Parameters | Return | Purpose |
|------|------------|--------|---------|
| init | - | void | Initialize home page |
| loadCompetitions | - | Promise<void> | Load competitions based on current filters |
| setMainTab | tab: 'live' \| 'upcoming' \| 'recorded' | void | Set main tab (live/upcoming/recorded) |
| setSubTab | tab: string | void | Set sub tab (all/dialogue/science/talents) |
| loadMoreCompetitions | - | Promise<void> | Load more competitions |
| bindSearchEvents | - | void | Bind search input events |
| performSearch | - | void | Perform search and navigate to explore page |
| showSearchResults | competitions: any[], users: any[], container: HTMLElement | void | Show search results in dropdown |
| setupAllHoverScroll | - | void | Setup hover scroll for competition sections |

#### Dependencies
- CompetitionService (src/client/services/CompetitionService.ts)
- State (src/client/core/State.ts)
- Shared components (src/shared/components)
- i18n system (src/i18n)

#### API Calls
- `/api/search/competitions` - Search competitions
- `/api/search/users` - Search users

---

## 🚀 Service Modules

### src/client/services/AuthService.ts

#### Type
Service

#### Purpose
Authentication and authorization management.

#### Exports
| Name | Type | Purpose |
|------|------|---------|
| AuthService | class | Authentication service |

#### Public Methods
| Name | Parameters | Return | Purpose |
|------|------------|--------|---------|
| checkAuth | - | Promise<boolean> | Check authentication status |
| clearAuth | - | void | Clear authentication data |
| updateAuthUI | - | void | Update UI based on authentication status |
| handleOAuthSuccess | session: string, fromUrl?: boolean | Promise<void> | Handle OAuth success |
| handleLogin | e: Event | Promise<void> | Handle login form submission |
| handleRegister | e: Event | Promise<void> | Handle registration form submission |
| handleForgotPassword | e: Event | Promise<void> | Handle forgot password |
| handleVerifyResetCode | e: Event | Promise<void> | Handle verify reset code |
| handleResetPassword | e: Event | Promise<void> | Handle reset password |
| loginWith | provider: string | void | Login with OAuth provider |
| logout | - | Promise<void> | Logout |

#### Dependencies
- State (src/client/core/State.ts)
- CookieUtils (src/client/core/CookieUtils.ts)
- Toast (src/client/ui/Toast.ts)
- Modal (src/client/ui/Modal.ts)
- NotificationsUI (src/client/ui/NotificationsUI.ts)
- MessagesUI (src/client/ui/MessagesUI.ts)
- i18n system (src/i18n)

#### API Calls
| Endpoint | Method | Purpose |
|----------|--------|---------|
| /api/auth/session | GET | Check session |
| /api/auth/login | POST | Login |
| /api/auth/register | POST | Register |
| /api/auth/forgot-password | POST | Forgot password |
| /api/auth/verify-reset-code | POST | Verify reset code |
| /api/auth/reset-password | POST | Reset password |
| /api/auth/oauth/:provider | GET | OAuth login |
| /api/auth/logout | POST | Logout |

---

### src/client/services/ChunkPlayer.ts

#### Type
Service

#### Purpose
Video chunk player for live streaming and VOD.

#### Exports
| Name | Type | Purpose |
|------|------|---------|
| ChunkPlayer | class | Chunk player service |
| ChunkPlayerConfig | interface | Configuration options |

#### Public Methods
| Name | Parameters | Return | Purpose |
|------|------------|--------|---------|
| start | - | Promise<void> | Start playback |
| stop | - | void | Stop playback |
| refresh | - | Promise<void> | Refresh playlist |

#### Dependencies
- Browser HTML5 Video API
- MediaSource Extensions (MSE) API

#### API Calls
- `/playlist.php` - Load playlist
- Chunk URLs from playlist

---

### src/client/services/ChunkUploader.ts

#### Type
Service

#### Purpose
Video chunk uploader for live streaming.

#### Exports
| Name | Type | Purpose |
|------|------|---------|
| ChunkUploader | class | Chunk uploader service |
| ChunkUploaderConfig | interface | Configuration options |

#### Public Methods
| Name | Parameters | Return | Purpose |
|------|------------|--------|---------|
| setExtension | ext: string | void | Set file extension (webm or mp4) |
| syncTime | - | Promise<void> | Sync time with server |
| getOffset | - | number | Get time offset for video sync |
| uploadChunk | blob: Blob, chunkNumber: number | Promise<boolean> | Upload a chunk |
| waitForUploads | - | Promise<void> | Wait for all pending uploads |
| finalize | - | Promise<boolean> | Notify server streaming is complete |
| getStats | - | { uploaded: number; pending: number } | Get upload stats |

#### Dependencies
- Browser Fetch API
- FormData API

#### API Calls
| Endpoint | Method | Purpose |
|----------|--------|---------|
| /time.php | GET | Sync time |
| /upload.php | POST | Upload chunk |
| /finalize.php | POST | Finalize stream |

---

### src/client/services/CompetitionService.ts

#### Type
Service

#### Purpose
Competition management service.

#### Exports
| Name | Type | Purpose |
|------|------|---------|
| CompetitionService | class | Competition service |

#### Public Methods
| Name | Parameters | Return | Purpose |
|------|------------|--------|---------|
| list | params: { status?: string; category?: string; subcategory?: string; limit?: number; offset?: number } | Promise<{ success: boolean; data: Competition[] }> | List competitions with filters |

#### Dependencies
- ApiClient (src/client/core/ApiClient.ts)

#### API Calls
| Endpoint | Method | Purpose |
|----------|--------|---------|
| /api/competitions | GET | List competitions |

---

### src/client/services/InteractionService.ts

#### Type
Service

#### Purpose
User interactions (likes, reports) management.

#### Exports
| Name | Type | Purpose |
|------|------|---------|
| InteractionService | class | Interaction service |
| ReportData | interface | Report data structure |

#### Public Methods
| Name | Parameters | Return | Purpose |
|------|------------|--------|---------|
| like | competitionId: number | Promise<{ success: boolean; likeCount?: number }> | Like a competition |
| unlike | competitionId: number | Promise<{ success: boolean; likeCount?: number }> | Unlike a competition |
| toggleLike | competitionId: number, currentlyLiked: boolean | Promise<{ success: boolean; liked?: boolean; likeCount?: number }> | Toggle like |
| getLikeStatus | competitionId: number | Promise<{ liked: boolean; likeCount: number }> | Get like status |
| getLikers | competitionId: number, limit?: number, offset?: number | Promise<any> | Get users who liked |
| report | data: ReportData | Promise<boolean> | Submit a report |
| reportUser | userId: number, reason: string, description?: string | Promise<boolean> | Report a user |
| reportCompetition | competitionId: number, reason: string, description?: string | Promise<boolean> | Report a competition |
| reportComment | commentId: number, reason: string, description?: string | Promise<boolean> | Report a comment |
| getReportReasons | - | Promise<Record<string, string[]>> | Get report reasons |

#### Dependencies
- ApiClient (src/client/core/ApiClient.ts)
- State (src/client/core/State.ts)
- Toast (src/client/ui/Toast.ts)
- i18n system (src/i18n)

#### API Calls
| Endpoint | Method | Purpose |
|----------|--------|---------|
| /api/competitions/:id/like | POST | Like competition |
| /api/competitions/:id/like | DELETE | Unlike competition |
| /api/competitions/:id/like | GET | Get like status |
| /api/competitions/:id/likes | GET | Get likers |
| /api/reports | POST | Submit report |
| /api/reports/reasons | GET | Get report reasons |

---

### src/client/services/LiveRoom.ts

#### Type
Service

#### Purpose
Live room management using Jitsi Meet.

#### Exports
| Name | Type | Purpose |
|------|------|---------|
| LiveRoom | class | Live room service |
| JitsiConfig | interface | Jitsi configuration |

#### Public Methods
| Name | Parameters | Return | Purpose |
|------|------------|--------|---------|
| init | containerId: string, config: JitsiConfig | Promise<boolean> | Initialize Jitsi API |
| leave | - | void | Leave the room |
| toggleAudio | - | void | Toggle audio |
| toggleVideo | - | void | Toggle video |
| toggleScreenShare | - | void | Toggle screen share |
| endMeeting | - | void | End meeting |
| getParticipantsCount | - | Promise<number> | Get participants count |
| isInitialized | - | boolean | Check if API is initialized |

#### Dependencies
- State (src/client/core/State.ts)
- ApiClient (src/client/core/ApiClient.ts)
- Jitsi Meet External API

#### API Calls
| Endpoint | Method | Purpose |
|----------|--------|---------|
| /api/competitions/join-stream | POST | Notify user joined stream |

---

### src/client/services/MessagingService.ts

#### Type
Service

#### Purpose
Messaging and conversations management.

#### Exports
| Name | Type | Purpose |
|------|------|---------|
| MessagingService | class | Messaging service |

#### Public Methods
| Name | Parameters | Return | Purpose |
|------|------------|--------|---------|
| getConversations | limit?: number, offset?: number | Promise<any[]> | Get user's conversations |
| getMessages | conversationId: number, limit?: number, offset?: number | Promise<any[]> | Get messages in conversation |
| sendMessage | conversationId: number, content: string | Promise<{ success: boolean; message?: any }> | Send a message |
| startConversation | userId: number, content: string | Promise<{ success: boolean; conversationId?: number }> | Start new conversation |
| getUnreadCount | - | Promise<number> | Get unread message count |

#### Dependencies
- ApiClient (src/client/core/ApiClient.ts)
- State (src/client/core/State.ts)
- Toast (src/client/ui/Toast.ts)
- i18n system (src/i18n)

#### API Calls
| Endpoint | Method | Purpose |
|----------|--------|---------|
| /api/conversations | GET | Get conversations |
| /api/conversations/:id/messages | GET | Get messages |
| /api/conversations/:id/messages | POST | Send message |
| /api/users/:id/message | POST | Start conversation |
| /api/messages/unread | GET | Get unread count |

---

### src/client/services/P2PConnection.ts

#### Type
Service

#### Purpose
WebRTC P2P connection between host and opponent.

#### Exports
| Name | Type | Purpose |
|------|------|---------|
| P2PConnection | class | P2P connection service |
| P2PConnectionConfig | interface | Configuration options |
| SignalingRole | type | Role in signaling (host/opponent/viewer) |
| RoomStatus | interface | Room status information |

#### Public Methods
| Name | Parameters | Return | Purpose |
|------|------------|--------|---------|
| initialize | - | Promise<void> | Initialize connection |
| joinRoom | - | Promise<boolean> | Join signaling room |
| initLocalStream | constraints?: MediaStreamConstraints | Promise<MediaStream> | Initialize local media stream |
| getLocalStream | - | MediaStream \| null | Get local stream |
| getRemoteStream | - | MediaStream \| null | Get remote stream |
| createOffer | - | Promise<void> | Create and send offer (host only) |
| getRoomStatus | - | Promise<RoomStatus \| null> | Check room status |
| isP2PConnected | - | boolean | Check if connected |
| disconnect | - | Promise<void> | Disconnect and cleanup |

#### Dependencies
- Browser WebRTC API
- Fetch API

#### API Calls
| Endpoint | Method | Purpose |
|----------|--------|---------|
| /api/signaling/ice-servers | GET | Get ICE servers |
| /api/signaling/room/join | POST | Join signaling room |
| /api/signaling/room/leave | POST | Leave signaling room |
| /api/signaling/room/:id/status | GET | Get room status |
| /api/signaling/signal | POST | Send signal |
| /api/signaling/poll | GET | Poll for signals |

---

### src/client/services/SearchService.ts

#### Type
Service

#### Purpose
Search and discovery service.

#### Exports
| Name | Type | Purpose |
|------|------|---------|
| SearchService | class | Search service |
| SearchFilters | interface | Search filters |

#### Public Methods
| Name | Parameters | Return | Purpose |
|------|------------|--------|---------|
| searchCompetitions | filters?: SearchFilters | Promise<any> | Search competitions |
| searchUsers | query: string, limit?: number, offset?: number | Promise<any> | Search users |
| getSuggestions | - | Promise<{ competitions: any[]; users: any[] }> | Get suggestions |
| getTrending | limit?: number | Promise<any[]> | Get trending competitions |
| getLive | limit?: number, offset?: number | Promise<any> | Get live competitions |
| getPending | limit?: number, offset?: number | Promise<any> | Get pending competitions |
| quickSearch | query: string | Promise<{ competitions: any[]; users: any[] }> | Quick search (combined results) |

#### Dependencies
- ApiClient (src/client/core/ApiClient.ts)
- State (src/client/core/State.ts)

#### API Calls
| Endpoint | Method | Purpose |
|----------|--------|---------|
| /api/search/competitions | GET | Search competitions |
| /api/search/users | GET | Search users |
| /api/search/suggestions | GET | Get suggestions |
| /api/search/trending | GET | Get trending |
| /api/search/live | GET | Get live |
| /api/search/pending | GET | Get pending |

---

### src/client/services/SettingsService.ts

#### Type
Service

#### Purpose
User settings and posts management.

#### Exports
| Name | Type | Purpose |
|------|------|---------|
| SettingsService | class | Settings service |
| UserSettingsData | interface | User settings structure |

#### Public Methods
| Name | Parameters | Return | Purpose |
|------|------------|--------|---------|
| getSettings | - | Promise<any> | Get user settings |
| updateSettings | data: UserSettingsData | Promise<boolean> | Update user settings |
| createPost | content: string, imageUrl?: string | Promise<{ success: boolean; post?: any }> | Create a post |
| getUserPosts | userId: number, limit?: number, offset?: number | Promise<any[]> | Get user's posts |
| getFeed | limit?: number, offset?: number | Promise<any[]> | Get feed |
| deletePost | postId: number | Promise<boolean> | Delete post |
| getSchedule | - | Promise<any[]> | Get user's schedule |
| getReminders | - | Promise<any[]> | Get reminders |
| addReminder | competitionId: number, beforeMinutes?: number | Promise<boolean> | Add reminder |
| removeReminder | competitionId: number | Promise<boolean> | Remove reminder |
| hasReminder | competitionId: number | Promise<boolean> | Check if has reminder |

#### Dependencies
- ApiClient (src/client/core/ApiClient.ts)
- State (src/client/core/State.ts)
- Toast (src/client/ui/Toast.ts)
- i18n system (src/i18n)

#### API Calls
| Endpoint | Method | Purpose |
|----------|--------|---------|
| /api/settings | GET | Get settings |
| /api/settings | PUT | Update settings |
| /api/settings/posts | POST | Create post |
| /api/settings/users/:id/posts | GET | Get user posts |
| /api/settings/feed | GET | Get feed |
| /api/settings/posts/:id | DELETE | Delete post |
| /api/schedule | GET | Get schedule |
| /api/schedule/reminders | GET | Get reminders |
| /api/schedule/competitions/:id/remind | POST | Add reminder |
| /api/schedule/competitions/:id/remind | DELETE | Remove reminder |
| /api/schedule/competitions/:id/remind | GET | Check reminder |

---

### src/client/services/ThemeService.ts

#### Type
Service

#### Purpose
Theme management (dark/light mode).

#### Exports
| Name | Type | Purpose |
|------|------|---------|
| ThemeService | class | Theme service |

#### Public Methods
| Name | Parameters | Return | Purpose |
|------|------------|--------|---------|
| init | - | void | Initialize theme |
| toggle | - | void | Toggle dark mode |
| apply | - | void | Apply current theme |

#### Static Properties
| Name | Type | Purpose |
|------|------|---------|
| isDarkMode | boolean | Current dark mode state |

#### Dependencies
- State (src/client/core/State.ts)

---

### src/client/services/VideoCompositor.ts

#### Type
Service

#### Purpose
Video compositing and recording service.

#### Exports
| Name | Type | Purpose |
|------|------|---------|
| VideoCompositor | class | Video compositor service |
| VideoCompositorConfig | interface | Configuration options |
| RecordingStats | interface | Recording statistics |

#### Public Methods
| Name | Parameters | Return | Purpose |
|------|------------|--------|---------|
| getCanvas | - | HTMLCanvasElement | Get canvas element |
| startCompositing | - | void | Start compositing |
| startRecording | - | Promise<void> | Start recording |
| stopRecording | - | Promise<void> | Stop recording |
| stopCompositing | - | void | Stop compositing |
| getStats | - | RecordingStats | Get recording stats |
| destroy | - | Promise<void> | Complete cleanup |

#### Dependencies
- ChunkUploader (src/client/services/ChunkUploader.ts)
- Browser Canvas API
- MediaRecorder API
- AudioContext API

---

### src/client/services/index.ts

#### Type
Service

#### Purpose
Exports all service modules for easy access.

#### Exports
- AuthService
- ThemeService
- CompetitionService
- SearchService
- InteractionService
- MessagingService
- SettingsService
- P2PConnection
- VideoCompositor
- ChunkUploader

---

## 🎨 UI Modules

### src/client/ui/InteractionsUI.ts

#### Type
UI Component

#### Purpose
User interactions UI (likes, reports).

#### Public Methods
| Name | Parameters | Return | Purpose |
|------|------------|--------|---------|
| toggleLike | competitionId: number, button: HTMLElement | Promise<void> | Toggle like button |
| showReportModal | targetType: 'user' \| 'competition' \| 'comment', targetId: number | void | Show report modal |
| submitReport | e: Event | Promise<void> | Submit report |
| renderLikeButton | competitionId: number, liked: boolean, likeCount: number | string | Render like button HTML |
| renderReportButton | targetType: string, targetId: number | string | Render report button HTML |

#### Dependencies
- State (src/client/core/State.ts)
- InteractionService (src/client/services/InteractionService.ts)
- Toast (src/client/ui/Toast.ts)
- i18n system (src/i18n)

#### Event Handlers
- Click events on like and report buttons

---

### src/client/ui/Menu.ts

#### Type
UI Component

#### Purpose
Menu management (user menu, country menu).

#### Public Methods
| Name | Parameters | Return | Purpose |
|------|------------|--------|---------|
| toggleUser | - | void | Toggle user menu |
| toggleCountry | - | void | Toggle country menu |
| closeAll | - | void | Close all menus |
| setupClickOutside | - | void | Setup click outside listener |

#### Dependencies
- Browser DOM API

#### Event Handlers
- Click events on menu toggles
- Click outside menu to close

---

### src/client/ui/MessagesUI.ts

#### Type
UI Component

#### Purpose
Messages UI (unread count, dropdown).

#### Public Methods
| Name | Parameters | Return | Purpose |
|------|------------|--------|---------|
| init | - | Promise<void> | Initialize messages badge |
| loadUnreadCount | - | Promise<void> | Load unread messages count |
| loadMessages | - | Promise<void> | Load unread messages for dropdown |
| toggle | - | void | Toggle messages dropdown |
| renderList | - | void | Render messages list |
| markAllRead | - | Promise<void> | Mark all messages as read |
| updateBadge | - | void | Update messages badge |
| getUnreadCount | - | number | Get unread count |

#### Dependencies
- State (src/client/core/State.ts)
- ApiClient (src/client/core/ApiClient.ts)
- i18n system (src/i18n)

#### API Calls
| Endpoint | Method | Purpose |
|----------|--------|---------|
| /api/messages/unread | GET | Get unread count |
| /api/messages/unread-list | GET | Get unread messages |
| /api/messages/mark-all-read | POST | Mark all as read |

---

### src/client/ui/MessagingUI.ts

#### Type
UI Component

#### Purpose
Messaging panel UI.

#### Public Methods
| Name | Parameters | Return | Purpose |
|------|------------|--------|---------|
| open | - | void | Open messaging panel |
| close | - | void | Close messaging panel |
| selectConversation | conversationId: number | Promise<void> | Select a conversation |
| loadMessages | - | Promise<void> | Load messages for current conversation |
| sendMessage | e: Event | Promise<void> | Send a message |
| startConversation | userId: number, username: string | Promise<void> | Start new conversation |

#### Dependencies
- State (src/client/core/State.ts)
- MessagingService (src/client/services/MessagingService.ts)
- DateFormatter (src/client/helpers/DateFormatter.ts)
- i18n system (src/i18n)

#### API Calls
| Endpoint | Method | Purpose |
|----------|--------|---------|
| /api/conversations | GET | Get conversations |
| /api/conversations/:id/messages | GET | Get messages |
| /api/conversations/:id/messages | POST | Send message |
| /api/users/:id/message | POST | Start conversation |

---

### src/client/ui/Modal.ts

#### Type
UI Component

#### Purpose
Modal management (login, custom modals).

#### Public Methods
| Name | Parameters | Return | Purpose |
|------|------------|--------|---------|
| show | id: string | void | Show modal by ID |
| hide | id: string | void | Hide modal by ID |
| showLogin | - | void | Show login modal |
| hideLogin | - | void | Hide login modal |
| showCustom | title: string, message: string, btnText: string, iconName?: string | void | Show custom modal |
| showAuthMessage | message: string, type?: 'error' \| 'success' \| 'info' | void | Show auth message |
| hideAuthMessage | - | void | Hide auth message |
| switchAuthTab | tab: 'login' \| 'register' | void | Switch auth tabs |
| showForgotPassword | - | void | Show forgot password form |
| showLoginForm | - | void | Show login form |
| showComingSoon | providerName: string | void | Show coming soon modal |
| showOAuthError | errorCode: string | void | Show OAuth error modal |
| showHelp | - | void | Show help modal |

#### Dependencies
- State (src/client/core/State.ts)
- i18n system (src/i18n)

#### Event Handlers
- Click events on modal buttons
- Form submissions

---

### src/client/ui/NotificationsUI.ts

#### Type
UI Component

#### Purpose
Notifications UI (dropdown, badge).

#### Public Methods
| Name | Parameters | Return | Purpose |
|------|------------|--------|---------|
| init | - | Promise<void> | Initialize notifications |
| loadNotifications | - | Promise<void> | Load notifications from API |
| updateBadge | - | void | Update notification badge |
| toggle | - | void | Toggle notifications dropdown |
| renderList | - | void | Render notifications list |
| markAsRead | id: number | Promise<void> | Mark notification as read |
| markAllAsRead | - | Promise<void> | Mark all notifications as read |
| toggleStar | id: number | Promise<void> | Toggle star/favorite |

#### Dependencies
- State (src/client/core/State.ts)
- ApiClient (src/client/core/ApiClient.ts)
- i18n system (src/i18n)

#### API Calls
| Endpoint | Method | Purpose |
|----------|--------|---------|
| /api/notifications | GET | Get notifications |
| /api/notifications/:id/read | POST | Mark as read |
| /api/notifications/read-all | POST | Mark all as read |
| /api/notifications/:id/star | POST | Toggle star |

---

### src/client/ui/ScheduleUI.ts

#### Type
UI Component

#### Purpose
Schedule and reminders UI.

#### Public Methods
| Name | Parameters | Return | Purpose |
|------|------------|--------|---------|
| open | - | Promise<void> | Open schedule modal |
| close | - | void | Close schedule modal |
| toggleReminder | competitionId: number, hasReminder: boolean | Promise<boolean> | Toggle reminder |
| renderReminderButton | competitionId: number, hasReminder: boolean | string | Render reminder button HTML |

#### Dependencies
- State (src/client/core/State.ts)
- SettingsService (src/client/services/SettingsService.ts)
- DateFormatter (src/client/helpers/DateFormatter.ts)
- i18n system (src/i18n)

#### API Calls
| Endpoint | Method | Purpose |
|----------|--------|---------|
| /api/schedule | GET | Get schedule |
| /api/schedule/reminders | GET | Get reminders |
| /api/schedule/competitions/:id/remind | POST | Add reminder |
| /api/schedule/competitions/:id/remind | DELETE | Remove reminder |

---

### src/client/ui/SettingsUI.ts

#### Type
UI Component

#### Purpose
Settings UI.

#### Public Methods
| Name | Parameters | Return | Purpose |
|------|------------|--------|---------|
| open | - | Promise<void> | Open settings modal |
| close | - | void | Close settings modal |
| save | e: Event | Promise<void> | Save settings |

#### Dependencies
- State (src/client/core/State.ts)
- SettingsService (src/client/services/SettingsService.ts)
- Toast (src/client/ui/Toast.ts)
- i18n system (src/i18n)

#### API Calls
| Endpoint | Method | Purpose |
|----------|--------|---------|
| /api/settings | GET | Get settings |
| /api/settings | PUT | Update settings |

---

### src/client/ui/Toast.ts

#### Type
UI Component

#### Purpose
Toast notifications.

#### Exports
| Name | Type | Purpose |
|------|------|---------|
| Toast | class | Toast notification manager |
| ToastType | type | Toast types: 'success' \| 'error' \| 'warning' \| 'info' |

#### Public Methods
| Name | Parameters | Return | Purpose |
|------|------------|--------|---------|
| show | message: string, type?: ToastType | void | Show toast notification |
| success | message: string | void | Show success toast |
| error | message: string | void | Show error toast |
| warning | message: string | void | Show warning toast |
| info | message: string | void | Show info toast |

#### Dependencies
- State (src/client/core/State.ts)
- i18n system (src/i18n)

---

### src/client/ui/index.ts

#### Type
UI Component

#### Purpose
Exports all UI modules for easy access.

#### Exports
- Toast
- ToastType (type)
- Modal
- Menu
- MessagingUI
- SettingsUI
- InteractionsUI
- ScheduleUI

---

## 🏠 Main Application

### src/client/index.ts

#### Type
Core

#### Purpose
Main application entry point and initialization.

#### Exports
| Name | Type | Purpose |
|------|------|---------|
| App | class | Main application class |
| dueliAPI | object | Global API interface |

#### Public Methods
| Name | Parameters | Return | Purpose |
|------|------------|--------|---------|
| init | - | Promise<void> | Initialize the application |
| handleOAuthCallback | - | void | Handle OAuth callback from URL |

#### Dependencies
- All core modules
- All services
- All UI components
- Shared components (src/shared/components)
- i18n system (src/i18n)
- Countries data (src/countries)

#### Initialization Flow
1. Initialize state from URL, cookies, and browser settings
2. Initialize theme
3. Check authentication status
4. Expose session data to window for SSR
5. Setup menu click outside handlers
6. Handle OAuth callback from URL
7. Initialize home page
8. Log success message

---

## 📊 Architecture Overview

### Module Dependencies

```
src/client/index.ts (App)
├── src/client/core/
│   ├── State.ts (Global State)
│   ├── ApiClient.ts (HTTP Client)
│   └── CookieUtils.ts (Cookie Management)
├── src/client/services/
│   ├── AuthService.ts (Authentication)
│   ├── ThemeService.ts (Theme)
│   ├── CompetitionService.ts (Competitions)
│   ├── SearchService.ts (Search)
│   ├── InteractionService.ts (Interactions)
│   ├── MessagingService.ts (Messaging)
│   ├── SettingsService.ts (Settings)
│   ├── P2PConnection.ts (WebRTC)
│   ├── VideoCompositor.ts (Video Compositing)
│   └── ChunkUploader.ts (Chunk Uploading)
├── src/client/ui/
│   ├── Toast.ts (Notifications)
│   ├── Modal.ts (Modals)
│   ├── Menu.ts (Menus)
│   ├── MessagesUI.ts (Messages Dropdown)
│   ├── MessagingUI.ts (Messaging Panel)
│   ├── NotificationsUI.ts (Notifications Dropdown)
│   ├── InteractionsUI.ts (Likes/Reports)
│   ├── ScheduleUI.ts (Schedule/Reminders)
│   └── SettingsUI.ts (Settings)
├── src/client/helpers/
│   ├── DateFormatter.ts (Date Formatting)
│   ├── NumberFormatter.ts (Number Formatting)
│   ├── YouTubeHelpers.ts (YouTube Utils)
│   ├── Utils.ts (General Utils)
│   ├── InfiniteScroll.ts (Scrolling)
│   ├── LiveSearch.ts (Search)
│   └── RecommendationEngine.ts (Recommendations)
└── src/client/pages/
    └── HomePage.ts (Home Page)
```

### Key Features

1. **State Management**: Centralized state with priority-based language/country detection
2. **Authentication**: OAuth2 with multiple providers + traditional login/register
3. **Real-time Features**: WebRTC P2P connections, live streaming, messaging
4. **Responsive Design**: Mobile-first with dark/light mode support
5. **Multi-language**: 20+ language support with RTL support
6. **Performance**: Infinite scroll, debounced search, lazy loading

### Browser Support

- Chrome/Edge (latest 2 versions)
- Firefox (latest 2 versions)
- Safari (latest 2 versions)
- Mobile browsers (iOS Safari, Chrome Mobile)

---

## 🚀 Getting Started

The client application is automatically initialized when the DOM is ready:

```javascript
document.addEventListener('DOMContentLoaded', () => {
    App.init();
});
```

All modules are accessible through the global `window.dueli` API:

```javascript
// Example usage
window.dueli.showToast('Hello, World!', 'success');
window.dueli.toggleDarkMode();
window.dueli.api('/api/data', { method: 'POST', body: { key: 'value' } });
```

---

## 📝 Conclusion

This documentation covers all client-side modules in the Opus Dueli application. The architecture follows a modular approach with clear separation between core utilities, services, UI components, and pages, ensuring maintainability and scalability.
