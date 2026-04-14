# AI Developer Prompts - Dueli Core Systems Initialization

> **Context for the AI Developer**: You are tasked with implementing core modules for the "Dueli" web application. 
> Strict constraints apply to all your work:
> 1. **Architecture**: You must strictly adhere to the established MVC (Model-View-Controller) architecture.
> 2. **Programming Paradigm**: Follow strictly Object-Oriented Programming (OOP) principles. Encapsulate business logic in Domain Services and Models.
> 3. **Internationalization (i18n)**: Every single user-facing string MUST be implemented using the project's i18n translation system. No hardcoded text in templates. Both Arabic and English (and generic support for others) must be maintained.
> 4. **Database (D1)**: Use Cloudflare D1 with standard SQLite queries provided by the system's `BaseModel` classes.
> 5. **Clean the Codebase**: Do not break existing features; append and extend surgically.

---

## Task 1: The Advertiser Portal & Dynamic Ads Engine
**Objective**: Build a complete, self-service Ad System from backend to frontend.
**Requirements**:
- **Backend (Models & Controllers)**: 
  - Create a dedicated Advertiser dashboard logic.
  - Implement endpoints for Advertisers to submit ads, set budgets, define Target Audience (language/country constraints), and view their Ad analytics (Impressions, Clicks, Spend).
  - Update `AdvertisementModel` to handle dynamic budget depletion (e.g., deducting `revenue_per_view` from `budget` when an impression is logged in a competition).
- **Frontend (View)**: 
  - Build `advertiser-portal` views. 
  - Show real-time ad consumption and fund remaining.
- **Constraints**: Follow OOP by creating an `AdCampaignManager` service to encapsulate budget tracking.

---

## Task 2: Advanced Governance & Admin Layer
**Objective**: Implement a strictly isolated, highly secure Administration portal.
**Requirements**:
- **Authentication**: Create an isolated Admin Auth Guard. Regular users cannot access admin routes under `/admin/*`.
- **Admin Roles**: Define granular roles (SuperAdmin, Auditor, Moderator).
- **Logging Layer**: Every critical action taken by an Admin MUST be logged into a new `admin_audit_logs` table (Fields: `admin_id`, `action_type`, `target_entity`, `target_id`, `details`, `timestamp`). This is non-negotiable for transparency.
- **Frontend (View)**: 
  - Build a comprehensive Admin Dashboard tracking platform statistics (active users, demographics, hottest competitions).

---

## Task 3: Complete Arbitration & Complaint System
**Objective**: Modernize the `reports` table into a transparent, multi-step complaint handling system.
**Requirements**:
- **Workflow State Machine**: A complaint (`report`) should go through states: `Submitted -> Under Review (Assigned Admin) -> Investigation -> Resolved/Rejected`.
- **Transparency**: Users who submit a complaint must have a frontend View to track exactly where their complaint is, which Admin (by generic ID/Role) is handling it, and the stated logic/notes for the transition of its state.
- **Backend**: Implement an `ArbitrationService` that handles state transitions and automatically creates `admin_audit_logs` entries.

---

## Task 4: The Ultimate Transparency Engine
**Objective**: Build a public-facing Transparency Ledger confirming the integrity of the platform.
**Requirements**:
- **Database Entities**: 
  - Create `platform_financial_logs` for tracking platform revenue chunks, server costs, developer payouts, and admin salaries.
  - Create `platform_donations_ledger` to publicly track Donor contributions and how they are spent.
- **Frontend Portal**: 
  - Build a `/transparency` public route.
  - Display raw graphical and tabular data: "Total Ads Revenue Today", "Platform Share Retained", "Opponents Paid", "Donations Received", "Operational Costs (Salaries/Server)".
  - Display an anonymized feed of recent Admin interventions (e.g., "Moderator resolved Complaint #1023 regarding Competition #40").
  - Provide complete documentation of Admin behavior statistics.
- **Constraint**: Ensure mathematical integrity. The sum of all competitor payouts + platform share must strictly equal the total ad revenue minus operational transactions.

---

## Task 5: Real-Time Live Finance Engine
**Objective**: Implement the dynamic, real-time revenue splitting algorithm during Live Competitions.
**Requirements**:
- **Backend (Service)**: 
  - Create `LivePayoutEngine` service.
  - Formula to apply when an Ad impression is registered:
    1. Fetch dynamic platform percentage from `platform_settings`.
    2. Extract Platform Share.
    3. The remaining Competitors Pool is continuously split based on the real-time fraction of ratings (`Creator Rating / Total Ratings` vs `Opponent Rating / Total Ratings`).
- **Real-Time Push**: 
  - Emit these floating financial numbers over SSE/WebSocket to the live room.
- **Frontend (Live Competition View)**: 
  - Display a "Live Finance Dashboard".
  - It must show dancing numbers: Total Ad Revenue, Platform Cut, and exact live competitor payouts updating instantly as users vote.
  - Upon conclusion, persist this exact final ledger into `competition_revenue_logs` for user transparency.
