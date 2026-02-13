# 🎯 Dueli Platform - Project Reference (English)

<div align="center">

![Dueli Logo](../public/static/dueli-icon.png)

**Debate & Dialogue Platform**

[![License](https://img.shields.io/badge/license-Maelsh%20Pro-blue.svg)](../LICENSE.md)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue.svg)](https://www.typescriptlang.org/)
[![Hono](https://img.shields.io/badge/Hono-4.0-orange.svg)](https://hono.dev/)

</div>

---

## 📖 Table of Contents

1. [Mission Statement](#mission-statement)
2. [Platform Overview](#platform-overview)
3. [Core Features](#core-features)
4. [Technical Stack](#technical-stack)
5. [User Roles & Permissions](#user-roles--permissions)
6. [Competition System](#competition-system)
7. [Category Structure](#category-structure)
8. [Monetization Model](#monetization-model)
9. [Roadmap](#roadmap)
10. [Contact & Support](#contact--support)

---

## Mission Statement

Dueli is an innovative bilingual platform designed to facilitate intellectual debates, scientific discussions, and talent showcases. Our mission is to create a space where ideas can be exchanged respectfully, knowledge can be shared, and talents can be discovered.

### Vision

To become the leading Arabic-first platform for debates, dialogues, and competitions, connecting thinkers, scientists, and talented individuals across the Arab world and beyond.

### Values

- **Respect**: All discussions must maintain mutual respect
- **Knowledge**: Promoting evidence-based arguments
- **Diversity**: Welcoming all viewpoints and backgrounds
- **Innovation**: Leveraging technology for meaningful connections

---

## Platform Overview

### What is Dueli?

Dueli is a web-based platform that enables:

1. **Live Debates**: Real-time video debates between two or more participants
2. **Recorded Competitions**: Archived debates available for viewing
3. **Scheduled Events**: Upcoming competitions with registration
4. **Talent Showcases**: Performance-based competitions
5. **Scientific Discussions**: Academic and research-focused dialogues

### Target Audience

- **Debaters**: Politicians, analysts, thinkers
- **Scientists**: Researchers, academics, students
- **Talents**: Poets, singers, artists, performers
- **Viewers**: General audience interested in intellectual content
- **Organizations**: Media outlets, educational institutions

### Platform Statistics

| Metric | Target |
|--------|--------|
| Monthly Active Users | 100,000+ |
| Live Competitions/Day | 50+ |
| Recorded Content | 10,000+ hours |
| Countries Reached | 25+ Arab countries |

---

## Core Features

### 1. Live Streaming

**Description**: Real-time video streaming for live competitions

**Capabilities**:
- WebRTC-based peer-to-peer streaming
- Multi-participant support (up to 4 video feeds)
- Low latency (< 2 seconds)
- Adaptive bitrate streaming
- Recording capability

**Technical Implementation**:
- P2PConnection service for WebRTC
- TURN server for NAT traversal
- Signaling server for connection establishment
- VideoCompositor for layout management

### 2. Competition Management

**Description**: Full lifecycle management of competitions

**Competition States**:
```
pending → accepted → live → completed
                  ↘ cancelled
```

**Features**:
- Competition creation with rules and description
- Opponent request system
- Scheduling with reminders
- Category and subcategory classification
- Language and country tagging

### 3. User Interaction

**Description**: Engagement features for viewers

**Features**:
- Live comments during competitions
- Like/Dislike system
- Star ratings (1-5) for competitors
- Follow system for users
- Share functionality

### 4. Notification System

**Description**: Real-time notifications for user engagement

**Notification Types**:
| Type | Description |
|------|-------------|
| `request` | New join request for competition |
| `follow` | New follower |
| `comment` | Comment on your competition |
| `rating` | New rating received |
| `system` | Platform announcements |
| `invitation` | Competition invitation |

### 5. Messaging System

**Description**: Private messaging between users

**Features**:
- Real-time message delivery
- Conversation management
- Read receipts
- Message history

### 6. Search & Discovery

**Description**: Content discovery mechanisms

**Features**:
- Global search (users, competitions)
- Category filtering
- Status filtering (live, recorded, upcoming)
- Language filtering
- Country filtering

### 7. User Profiles

**Description**: Comprehensive user profiles

**Profile Elements**:
- Display name and avatar
- Bio and country
- Statistics (competitions, wins, views, rating)
- Competition history
- Followers/Following

### 8. Authentication

**Description**: Secure user authentication

**Methods**:
- Email/Password with verification
- Google OAuth
- Facebook OAuth
- Microsoft OAuth
- TikTok OAuth

---

## Technical Stack

### Frontend

| Technology | Purpose |
|------------|---------|
| TypeScript 5.x | Type-safe JavaScript |
| TailwindCSS 4.x | Utility-first CSS |
| Vite 7.x | Build tool |
| WebRTC | Real-time video |

### Backend

| Technology | Purpose |
|------------|---------|
| Hono 4.x | Web framework |
| Cloudflare Workers | Serverless runtime |
| Cloudflare D1 | SQLite database |

### Services

| Service | Purpose |
|---------|---------|
| Resend/iFastNet | Email delivery |
| Cloudflare TURN | NAT traversal |
| Custom Streaming | Video processing |

### Development Tools

| Tool | Purpose |
|------|---------|
| Wrangler | Cloudflare CLI |
| esbuild | Client bundling |
| TypeScript | Type checking |

---

## User Roles & Permissions

### Guest (Unauthenticated)

**Permissions**:
- View live competitions
- View recorded competitions
- Browse categories
- Search content
- View user profiles

**Restrictions**:
- Cannot comment
- Cannot rate
- Cannot follow users
- Cannot create competitions

### User (Authenticated)

**Permissions**:
- All guest permissions
- Comment on competitions
- Rate competitors
- Follow users
- Create competitions
- Send messages
- Receive notifications
- Customize settings

**Restrictions**:
- Cannot moderate content
- Cannot access admin features

### Verified User

**Additional Permissions**:
- Verified badge display
- Priority in search results
- Higher streaming quality

### Administrator

**Additional Permissions**:
- User management (view, edit, delete)
- Content moderation
- Report management
- Analytics access
- Platform configuration

---

## Competition System

### Competition Lifecycle

```
┌─────────────┐
│   Created   │
│  (pending)  │
└──────┬──────┘
       │
       ▼
┌─────────────┐     ┌─────────────┐
│   Accepted  │────▶│  Cancelled  │
│ (has opponent)│     │             │
└──────┬──────┘     └─────────────┘
       │
       ▼
┌─────────────┐
│    Live     │
│ (streaming) │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│  Completed  │
│  (recorded) │
└─────────────┘
```

### Competition Request Flow

```
Creator creates competition (pending)
         │
         ▼
Users send join requests
         │
         ▼
Creator reviews requests
         │
         ├──▶ Accept → Competition becomes "accepted"
         │
         └──▶ Decline → Request removed
         │
         ▼
Scheduled time arrives
         │
         ▼
Competition goes "live"
         │
         ▼
Competition ends → "completed"
```

### Rating System

**Individual Ratings**:
- Each viewer can rate each competitor (1-5 stars)
- Ratings are anonymous
- One rating per user per competitor per competition

**Average Rating**:
- Calculated as mean of all ratings
- Displayed on user profile
- Contributes to user reputation

---

## Category Structure

### Main Categories

#### 1. Dialogue (الحوار)

Intellectual debates and discussions.

| Subcategory | Arabic | Description |
|-------------|--------|-------------|
| Religions | الأديان | Inter-faith dialogues |
| Sects | المذاهب | Intra-faith discussions |
| Politics | السياسة | Political debates |
| Economics | الاقتصاد | Economic discussions |
| Ethnic Conflicts | النزاعات العرقية | Ethnic issues |
| Local Events | الأحداث المحلية | Local news discussions |
| Global Events | الأحداث العالمية | International affairs |
| Other Disputes | نزاعات أخرى | Miscellaneous debates |

#### 2. Science (العلوم)

Scientific and academic discussions.

| Subcategory | Arabic | Description |
|-------------|--------|-------------|
| Physics | الفيزياء | Physics discussions |
| Chemistry | الكيمياء | Chemistry topics |
| Mathematics | الرياضيات | Math debates |
| Astronomy | الفلك | Space and astronomy |
| Biology | الأحياء | Life sciences |
| Technology | التقنية | Tech discussions |
| Energy | الطاقة | Energy topics |
| Economics Science | الاقتصاد العلمي | Economic science |
| Mixed Sciences | علوم مختلطة | Interdisciplinary |
| Other Sciences | علوم أخرى | Other topics |

#### 3. Talents (المواهب)

Talent showcases and competitions.

| Subcategory | Arabic | Description |
|-------------|--------|-------------|
| Physical | بدنية | Physical abilities |
| Mental | عقلية | Mental skills |
| Vocal | صوتية | Singing, recitation |
| Poetry | شعرية | Poetry competitions |
| Psychological | نفسية | Psychological skills |
| Creative | إبداعية | Creative arts |
| Crafts | حرفية | Handcrafts |
| Other Talents | مواهب أخرى | Other talents |

---

## Monetization Model

### Revenue Streams

#### 1. Advertisements

**Implementation**:
- Pre-roll ads before recorded content
- Banner ads during live streams
- Sponsored competitions

**Revenue Sharing**:
- 70% to content creator
- 30% to platform

#### 2. Donations

**Features**:
- Viewers can donate to creators
- Multiple donation tiers
- Platform fee: 10%

#### 3. Premium Features (Planned)

**Proposed Features**:
- Ad-free viewing
- HD streaming
- Exclusive content access
- Custom profile badges

### Earnings System

**User Earnings**:
- Tracked per competition
- Monthly payout threshold: $50
- Payment methods: Bank transfer, PayPal

**Earnings Dashboard**:
- Total earnings
- Per-competition breakdown
- Withdrawal history
- Pending payouts

---

## Roadmap

### Phase 1: Core Platform ✅

- [x] User authentication
- [x] Competition creation
- [x] Live streaming
- [x] Comments and ratings
- [x] Categories system
- [x] User profiles

### Phase 2: Enhanced Features 🔄

- [x] OAuth integration
- [x] Private messaging
- [x] Notification system
- [x] Search functionality
- [ ] Payment integration
- [ ] Account deletion

### Phase 3: Monetization 📋

- [ ] Ad system integration
- [ ] Donation system
- [ ] Earnings dashboard
- [ ] Withdrawal system

### Phase 4: Mobile Apps 📋

- [ ] iOS application
- [ ] Android application
- [ ] Push notifications
- [ ] Offline support

### Phase 5: Advanced Features 📋

- [ ] AI-powered recommendations
- [ ] Automatic transcription
- [ ] Translation services
- [ ] Analytics dashboard

---

## Contact & Support

### Company Information

**Maelsh Pro**

- 🌐 Website: [maelsh.pro](https://maelsh.pro)
- 📧 Email: contact@maelsh.pro
- 📍 Location: Saudi Arabia

### Support Channels

- 📧 Technical Support: support@dueli.com
- 📧 Business Inquiries: business@dueli.com
- 📧 Report Issues: report@dueli.com

### Social Media

- Twitter: [@dueli_platform](https://twitter.com/dueli_platform)
- YouTube: [Dueli Official](https://youtube.com/@dueli)
- Instagram: [@dueli.platform](https://instagram.com/dueli.platform)

---

<div align="center">

**Made with ❤️ by Maelsh Pro**

</div>
