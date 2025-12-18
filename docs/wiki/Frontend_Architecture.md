# Frontend Architecture

## Overview
The frontend is a **Server-Side Rendered (SSR)** application (or static served) with **Client-Side Hydration** via vanilla TypeScript. It does NOT use a heavy framework like React or Vue. It uses a "Lightweight Interactive" approach.

### Key Characteristics
- **No Virtual DOM**: Direct DOM manipulation for maximum performance.
- **Bundle-Free Logic (mostly)**: Uses ES Modules natively or light bundling via Vite.
- **Component-Based**: UI is built with Classes that manage their own DOM elements (`src/client/ui`).

## State Management System
Managed by `src/client/core/State.ts`.

State is not essentially "reactive" in the Vue/React sense but "Singleton-based".

### Priority Logic (Universal Support)
The application determines Language (e.g., `en`, `ar`, `fr`, `es`) and Country (e.g., `US`, `SA`, `BR`) using a strict waterfall. The system supports **ANY** World Language/Country combination.

1.  **User Database Profile** (Highest Priority): If logged in, use DB value.
2.  **URL Parameter**: `?lang=fr`.
3.  **Cookie**: `CookieUtils.get('lang')`.
4.  **Browser/Device**: `navigator.language` (Auto-detects user's native tongue).
5.  **Default**: Falls back to `en`/`US` only if all above fail.

## Client-Side Networking
Managed by `src/client/core/ApiClient.ts`.

### Features
- **Static Wrapper**: `ApiClient.get()`, `ApiClient.post()`.
- **Auto-Auth**: Automatically injects `Authorization: Bearer <token>` from the `State`.
- **Type Safety**: Generic support `request<T>()` for typed responses.

```typescript
// Usage Example from Codebase
const competitions = await ApiClient.get<Competition[]>('/competitions');
```

## Component Architecture (`src/client/ui/`)
Components are classes that bind to existing DOM elements or create new ones.

- **Modal.ts**: Singleton for managing all dialogs (Login, Info, Alerts).
- **Toast.ts**: Singleton for notification popups.
- **Menu.ts**: Handles dropdowns and navigation interactions.

This architecture avoids the "hydration gap" of big frameworks, making the site feel instant on slow connections, which fits the global/diverse audience of Dueli.
