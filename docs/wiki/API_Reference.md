# API Reference - مرجع الدوال

Complete API documentation for Dueli platform endpoints and data structures.

## Overview / نظرة عامة

The Dueli API follows RESTful conventions with JSON responses. All endpoints require authentication except public routes.

**Base URL**: `https://yourdomain.com/api`

**Authentication**: Bearer token or session cookie

## Response Format / تنسيق الاستجابة

All API responses follow this structure:

```json
{
  "success": true,
  "data": { ... },
  "message": "Optional message",
  "error": "Error message if failed"
}
```

## Authentication Endpoints / نقاط مصادقة

### POST /api/auth/register

Register a new user account.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "securepassword",
  "username": "uniqueusername",
  "display_name": "Display Name"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "user": { "id": 1, "email": "...", "username": "..." },
    "session_id": "session_token"
  },
  "message": "User registered successfully"
}
```

### POST /api/auth/login

Authenticate user login.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "securepassword"
}
```

### GET /api/auth/me

Get current authenticated user.

**Response:**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": 1,
      "email": "user@example.com",
      "username": "username",
      "display_name": "Display Name",
      "avatar_url": null,
      "is_verified": true,
      "total_competitions": 5,
      "total_wins": 3,
      "average_rating": 4.2
    }
  }
}
```

### OAuth Endpoints

- `GET /api/auth/oauth/:provider` - Start OAuth flow
- `GET /api/auth/oauth/:provider/callback` - OAuth callback

Supported providers: `google`, `facebook`, `microsoft`, `tiktok`

## Competition Endpoints / نقاط المنافسات

### GET /api/competitions

List competitions with filtering and pagination.

**Query Parameters:**
- `page` (number): Page number (default: 1)
- `limit` (number): Items per page (default: 20)
- `category_id` (number): Filter by category
- `status` (string): Filter by status (`pending`, `live`, `completed`)
- `language` (string): Filter by language (`en`, `ar`)

**Response:**
```json
{
  "success": true,
  "data": {
    "competitions": [
      {
        "id": 1,
        "title": "Climate Change Debate",
        "description": "Debate on climate policies",
        "category": { "id": 1, "name_en": "Politics", "name_ar": "سياسة" },
        "creator": { "id": 1, "username": "creator", "display_name": "Creator" },
        "opponent": null,
        "status": "pending",
        "scheduled_at": "2024-12-20T15:00:00Z",
        "total_views": 150,
        "total_comments": 12,
        "language": "en",
        "created_at": "2024-12-15T10:00:00Z"
      }
    ],
    "total": 1,
    "page": 1,
    "limit": 20,
    "has_more": false
  }
}
```

### GET /api/competitions/:id

Get detailed competition information.

**Response:**
```json
{
  "success": true,
  "data": {
    "competition": {
      "id": 1,
      "title": "Climate Change Debate",
      "description": "Detailed debate description",
      "rules": "Debate rules and guidelines",
      "category": { ... },
      "creator": { ... },
      "opponent": { ... },
      "status": "live",
      "youtube_live_id": "abc123",
      "total_views": 150,
      "total_comments": 12,
      "ratings": {
        "creator": { "total": 5, "average": 4.2 },
        "opponent": { "total": 3, "average": 4.0 }
      },
      "created_at": "2024-12-15T10:00:00Z"
    }
  }
}
```

### POST /api/competitions

Create a new competition.

**Request Body:**
```json
{
  "title": "New Debate Topic",
  "description": "Debate description",
  "rules": "Debate rules",
  "category_id": 1,
  "subcategory_id": 2,
  "scheduled_at": "2024-12-25T14:00:00Z",
  "language": "en"
}
```

### POST /api/competitions/:id/request

Request to join a competition.

**Response:**
```json
{
  "success": true,
  "message": "Join request sent successfully"
}
```

### POST /api/competitions/:id/comments

Add a comment to a competition.

**Request Body:**
```json
{
  "content": "This is my comment on the debate"
}
```

### GET /api/competitions/:id/comments

Get competition comments.

**Query Parameters:**
- `page` (number): Page number
- `limit` (number): Items per page

## User Endpoints / نقاط المستخدمين

### GET /api/users/:username

Get user profile information.

**Response:**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": 1,
      "username": "johndoe",
      "display_name": "John Doe",
      "bio": "Debate enthusiast",
      "avatar_url": "https://...",
      "country": "US",
      "language": "en",
      "is_verified": true,
      "total_competitions": 15,
      "total_wins": 8,
      "total_views": 2500,
      "average_rating": 4.1,
      "created_at": "2024-01-01T00:00:00Z"
    },
    "stats": {
      "competitions_won": 8,
      "competitions_lost": 7,
      "total_ratings_received": 45,
      "average_rating": 4.1
    }
  }
}
```

### PUT /api/users/me

Update current user profile.

**Request Body:**
```json
{
  "display_name": "New Display Name",
  "bio": "Updated bio",
  "country": "EG",
  "language": "ar"
}
```

### GET /api/users/me/notifications

Get user notifications.

**Query Parameters:**
- `page` (number): Page number
- `limit` (number): Items per page
- `unread_only` (boolean): Show only unread

**Response:**
```json
{
  "success": true,
  "data": {
    "notifications": [
      {
        "id": 1,
        "type": "request",
        "title": "Join Request",
        "message": "User X wants to join your debate",
        "reference_type": "competition",
        "reference_id": 123,
        "is_read": false,
        "created_at": "2024-12-16T10:00:00Z"
      }
    ],
    "total": 1,
    "unread_count": 1
  }
}
```

## Category Endpoints / نقاط الفئات

### GET /api/categories

List all categories.

**Response:**
```json
{
  "success": true,
  "data": {
    "categories": [
      {
        "id": 1,
        "name_key": "politics",
        "name_en": "Politics",
        "name_ar": "سياسة",
        "icon": "🏛️",
        "color": "#FF6B6B",
        "parent_id": null,
        "sort_order": 1
      }
    ]
  }
}
```

### GET /api/categories/:id/subcategories

Get subcategories for a category.

## Rating System / نظام التقييم

### POST /api/competitions/:id/ratings

Rate a competitor in a competition.

**Request Body:**
```json
{
  "competitor_id": 2,
  "rating": 5
}
```

**Rating Scale:** 1-5 stars

### GET /api/competitions/:id/ratings

Get ratings for a competition.

**Response:**
```json
{
  "success": true,
  "data": {
    "ratings": {
      "creator": {
        "total_ratings": 10,
        "average_rating": 4.2,
        "your_rating": 5
      },
      "opponent": {
        "total_ratings": 8,
        "average_rating": 4.0,
        "your_rating": null
      }
    }
  }
}
```

## Error Responses / استجابات الأخطاء

### 400 Bad Request
```json
{
  "success": false,
  "error": "Validation failed",
  "details": {
    "email": "Email is required",
    "password": "Password must be at least 8 characters"
  }
}
```

### 401 Unauthorized
```json
{
  "success": false,
  "error": "Authentication required"
}
```

### 403 Forbidden
```json
{
  "success": false,
  "error": "Insufficient permissions"
}
```

### 404 Not Found
```json
{
  "success": false,
  "error": "Resource not found"
}
```

### 422 Validation Error
```json
{
  "success": false,
  "error": "Validation failed",
  "details": { ... }
}
```

### 500 Internal Server Error
```json
{
  "success": false,
  "error": "Internal server error"
}
```

## Rate Limiting / تحديد المعدل

- **Authenticated requests**: 1000 per hour
- **Unauthenticated requests**: 100 per hour
- **OAuth requests**: 50 per hour

Rate limit headers are included in responses:
- `X-RateLimit-Limit`
- `X-RateLimit-Remaining`
- `X-RateLimit-Reset`

## Data Types / أنواع البيانات

### User Object
```typescript
interface User {
  id: number;
  email: string;
  username: string;
  display_name?: string;
  avatar_url?: string;
  bio?: string;
  country: string;
  language: string;
  is_verified: boolean;
  total_competitions: number;
  total_wins: number;
  total_views: number;
  average_rating: number;
  created_at: string;
  updated_at?: string;
}
```

### Competition Object
```typescript
interface Competition {
  id: number;
  title: string;
  description?: string;
  rules: string;
  category_id: number;
  subcategory_id?: number;
  creator_id: number;
  opponent_id?: number;
  status: 'pending' | 'accepted' | 'live' | 'completed' | 'cancelled';
  language: string;
  scheduled_at?: string;
  started_at?: string;
  ended_at?: string;
  youtube_live_id?: string;
  youtube_video_url?: string;
  total_views: number;
  total_comments: number;
  created_at: string;
  updated_at?: string;
}
```

### Category Object
```typescript
interface Category {
  id: number;
  name_key: string;
  name_en: string;
  name_ar: string;
  description_en?: string;
  description_ar?: string;
  icon?: string;
  color?: string;
  parent_id?: number;
  sort_order: number;
  is_active: boolean;
}
```

## SDKs and Libraries / مكتبات التطوير

### JavaScript Client

```javascript
import { ApiClient } from './client/core/ApiClient.js';

const api = new ApiClient();

// Login
const loginResult = await api.post('/auth/login', {
  email: 'user@example.com',
  password: 'password'
});

// Get competitions
const competitions = await api.get('/competitions?page=1&limit=10');
```

### cURL Examples

```bash
# Login
curl -X POST https://api.dueli.com/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password"}'

# Get competitions
curl -X GET "https://api.dueli.com/competitions?page=1&limit=10" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## Changelog / سجل التغييرات

### Version 1.0.0
- Initial API release
- Basic CRUD operations for competitions
- User authentication and profiles
- Rating and commenting system

---

For detailed class documentation, see the full [API Reference](../docs/API_REFERENCE.md).

For authentication setup, see [Getting Started](Getting_Started.md).