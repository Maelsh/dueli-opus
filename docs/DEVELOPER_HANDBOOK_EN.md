# Dueli Developer Handbook - Technical Reference

This document is the definitive technical guide for developers working on the Dueli platform. It covers architectural patterns, mandatory principles, line-by-line audit insights, and a registry of the current developmental state.

---

## 1. Core Principles (The Mandatory Four)

Any code contributed to Dueli MUST adhere to these four principles. Failure to do so will result in a code violation.

### Ⅰ. Universal Language Support (i18n)
- **Rule**: Never use hardcoded strings in the View or Controller layers.
- **Implementation**: Use the `t()` or `tr` object from `src/i18n`.
- **Location**: `src/i18n/` contains `en.ts` and `ar.ts`.

### Ⅱ. Object-Oriented Programming (OOP)
- **Rule**: Follow clear responsibility patterns. Use classes for services, models, and controllers.
- **Pattern**: Avoid generic functions; encapsulate logic in classes (e.g., `BaseModel`, `ApiClient`).

### Ⅲ. Model-View-Controller (MVC)
- **Rule**: Strict separation.
- **Models**: `src/models/` - No business logic here, only data access.
- **Views**: `src/shared/components/` & `src/modules/pages/` - No database queries here.
- **Controllers**: `src/controllers/` - Coordinates between Model and View.

### Ⅳ. Accessibility (A11y)
- **Rule**: Support for blind and visually impaired users is non-negotiable.
- **Requirements**:
  - `label` must have a `for` attribute.
  - Interactive elements must have `title` and `aria-label`.
  - Icon-only buttons must have `.sr-only` text.

---

## 2. Deep Technical Audit (Line-by-Line)

### 🛰️ Signaling System (`src/modules/api/signaling/routes.ts`)
The signaling mechanism is a **D1-backed polling system**.
- **The Bottleneck**: Polling operates on a `1000ms` window. **This is the primary cause** of stream dropouts. WebRTC requires low-latency signaling (WebSockets/SSE); a 1s delay often causes ICE candidate exchanges to time out, leading to `failed` connection states.
- **Room Lifecycle**: Rooms are prefixed as `comp_{id}`. They are created on the first host join and automatically deleted when `host`, `opponent`, and `viewer_count` all reach zero.

### 📡 P2P Service (`src/client/services/P2PConnection.ts`)
- **Permission Pitfall**: `getUserMedia` is currently triggered on page load. **Modern browsers block this**. Media access must be moved to a user-triggered callback (e.g., clicking a "Join" button) to comply with browser security policies.
- **Protocol**: Corrected to support `stun:stun.l.google.com:19302`.

### 🎥 The "Double-Ghost" Implementation
The project contains two conflicting streaming paths:
1. **Legacy Jitsi (`LiveRoom.ts`)**: An external iframe-based approach. 
2. **Custom P2P (`P2PConnection.ts`)**: The current development focus, integrated with the recording suite.
**DANGER**: The UI often initializes both or fails to release camera resources from Jitsi, causing the P2P connection to lock up.

### 📼 The Recording Pipeline (Forensic Audit)
- **Mechanism**: The Host's browser captures the composite canvas, cuts it into 10s blobs, and sends them to a PHP `upload.php` endpoint.
- **Reality Check**:
    - **Persistence**: While chunks are sent, there is no client-side retry or IndexedDB persistence. A temporary network drop causes permanent recording data loss.
    - **VOD Guessing**: The system "guesses" the final URL (e.g., `match_123.mp4`) when the stream ends. It does NOT wait for the PHP backend to confirm that the FFmpeg merging process is complete, causing empty/missing video links in the "Recorded" section.


---

## 3. Session Procedural History (التاريخ الإجرائي للجلسة)

During the current audit and development session (Dec 22, 2025), the following critical fixes and milestones were achieved:

| Step | Issue | Resolution |
|------|-------|------------|
| **1** | **Signaling Role Mismatch** | Fixed `sendSignal` and `poll` calls in test pages. Logic was incorrectly using `user_id` instead of the expected `role` (`host`/`opponent`). |
| **2** | **STUN Protocol Error** | Corrected STUN URLs in `test-stream-page.ts`. The `stun:` prefix was missing, causing WebRTC connection failures. |
| **3** | **Data Type Mismatch** | Fixed `user_id` type in registration and signaling. Was being passed as `string`, but DB expects `integer`. |
| **4** | **Test Infrastructure** | Created and deployed `test/host`, `test/guest`, and `test/viewer` pages to isolate streaming bugs from the main database. |
| **5** | **Documentation Consolidation** | Synthesized all fragmented wiki files into this definitive bilingual suite. |

---

## 4. The "Hanging Points" Registry (Where we stopped)

| Feature | Location | Status | Missing Logic |
|---------|------|--------|---------------|
| **HLS Recording** | `VideoCompositor.ts` | 🟡 Active | Recording works, but chunking depends on stable client-side upload. Needs server-side verification. |
| **Account Deletion** | `settings-page.ts` | ❌ Stopped | Logic terminates at a mock alert. Needs full D1 cleanup logic. |
| **Withdrawal System** | `earnings-page.ts` | ❌ Stopped | No backend API exists yet for `POST /api/earnings/withdraw`. |
| **Password Hashing** | `/lib/services/CryptoUtils` | ⚠️ Risk | Currently uses SHA-256. **Must be upgraded to BCrypt** before production. |
| **Accessibility** | Global | 🔴 Critical | 100+ items lack ARIA attributes. **This is where the next developer should start.** |

---

## 5. Development Roadmap: Next Steps

1. **Phase A (Security)**: Refactor `CryptoUtils.ts` to use a modern hashing algorithm.
2. **Phase B (Accessibility)**: Implementation of the "A11y Remediation Plan" in `login-modal.ts` and `competition-page.ts`.
3. **Phase C (Feature Completion)**: Connect the Settings and Earnings UI to real backend endpoints.

---

> [!NOTE]
> This guide replaces all previous `docs/wiki` content. It is the only valid reference for current architecture.
