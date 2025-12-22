# Dueli Project Reference - Definitive Guide

Welcome to the **Dueli** project, the definitive source of truth for understanding the platform's vision, features, and technical status as of late 2025.

---

## 1. Project Mission
Dueli is a specialized platform for **Binary Interaction** (Host vs. Opponent). It is built to facilitate meaningful debates, scientific competitions, and talent showcases with zero latency and high accessibility.

---

## 2. We are different because:
- **Hybrid Streaming**: We use WebRTC for the real-time interaction and HLS for massive-scale viewing.
- **Strict A11y**: The platform mission is to be 100% usable by blind and visually impaired users.
- **Sovereign Tech**: Built on Cloudflare workers to ensure global speed and serverless reliability.

---

## 3. Current Project Status (Summary)

**Accomplished in the latest session:**
- Fixed critical flaws in the Signaling API.
- Established a standalone testing environment for streaming.
- Successfully connected Host and Opponent streams with corrected protocols.
- Consolidated all technical debt and "Hanging Points" into the Developer Handbook.

**Where we stopped:**
We have successfully stabilized the **Core Streaming Pipeline**. The technical handshakes work, the rooms scale, and the bilingual core is solid.

**Where we continue:**
The project now enters the **Refinement Phase**. We must address the documented security risks in password hashing and the massive gap in accessibility attributes (ARIA).

---

## 4. Feature Roadmap

| Feature | Description | Status |
|---------|-------------|--------|
| **Live P2P** | High-speed debate between two users. | ✅ Core Stable |
| **HLS Viewing** | Broadcast to thousands of viewers. | ✅ Functional |
| **Bilingualism** | Arabic/English seamless switching. | ✅ 100% Implemented |
| **Withdrawals** | Automated payouts for creators. | ❌ UI only (Backend pending) |
| **A11y** | Full support for screen readers. | 🟠 Under Remediation |

---

> [!TIP]
> This document is for general knowledge. For code-level instructions and session logs, see the **[Developer Handbook](DEVELOPER_HANDBOOK_EN.md)**.
