# IT Helpdesk Portal

A full-stack IT ticketing system built with the MERN stack (MongoDB, Express, React, Node.js).

Requesters submit and track support tickets. Agents triage, assign, and resolve them. Admins view analytics and audit logs.

---

## Technology Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Redux Toolkit, React Query, React Router v6, Tailwind CSS |
| Backend | Node.js 18+, Express.js |
| Database | MongoDB + Mongoose ODM |
| Auth | JWT (JSON Web Tokens) |
| Validation | Joi (backend), controlled forms (frontend) |
| Testing | Jest + Supertest (backend), React Testing Library (frontend) |
| Logging | Winston + daily rotating file logs |
| File uploads | Multer (disk storage) |

---

## Project Structure

```
it-helpdesk/
├── backend/
│   ├── src/
│   │   ├── config/          # DB connection, logger, multer
│   │   ├── controllers/     # Thin HTTP handlers (no business logic)
│   │   ├── middlewares/     # auth, validate, errorHandler
│   │   ├── models/          # Mongoose schemas: User, Ticket, AuditEvent
│   │   ├── routes/          # Express routers with RBAC middleware
│   │   ├── services/        # Business logic: authService, ticketService, dashboardService
│   │   ├── utils/           # errors.js, response.js, ticketStatus.js
│   │   ├── validators/      # Joi schemas for every request payload
│   │   ├── app.js           # Express app setup (no server binding)
│   │   └── server.js        # Server entry point (DB connect → listen)
│   └── tests/
│       └── integration/     # Auth + ticket API tests with in-memory MongoDB
│
└── frontend/
    └── src/
        ├── components/
        │   ├── auth/        # Login, Register pages + route guards
        │   ├── common/      # Badge, Spinner, Modal, EmptyState, etc.
        │   ├── dashboard/   # RequesterDashboard, AgentQueue, AgentAssigned
        │   ├── layout/      # AppLayout (sidebar + topbar)
        │   └── tickets/     # TicketList, TicketDetail, CreateTicket
        ├── services/        # apiClient.js + api.js (all API calls)
        ├── store/           # Redux store + authSlice
        ├── styles/          # Tailwind + global CSS
        └── utils/           # Date formatting, badge helpers, constants
```

---

## Quick Start

### Prerequisites

- Node.js v18+
- MongoDB running locally or a MongoDB Atlas URI
- npm

### 1. Clone and install

```bash
# Backend
cd backend
npm install

# Frontend
cd ../frontend
npm install
```

### 2. Configure backend environment

```bash
cd backend
cp .env.example .env
# Edit .env and fill in MONGODB_URI, JWT_SECRET
```

### 3. Seed the database

```bash
cd backend
npm run seed
```

Seed credentials (development only):
| Role | Email | Password |
|---|---|---|
| Admin | admin@helpdesk.com | Admin@1234 |
| Agent | agent@helpdesk.com | Agent@1234 |
| Requester | requester@helpdesk.com | Requester@1234 |

### 4. Start development servers

```bash
# Terminal 1 — Backend (port 5000)
cd backend
npm run dev

# Terminal 2 — Frontend (port 3000)
cd frontend
npm start
```

Open http://localhost:3000

---

## API Reference

### Authentication

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | /api/auth/register | — | Register new user |
| POST | /api/auth/login | — | Login, returns JWT |
| POST | /api/auth/logout | ✓ | Logout |
| GET | /api/auth/me | ✓ | Get current user |

### Tickets

| Method | Endpoint | Role | Description |
|---|---|---|---|
| POST | /api/tickets | requester+ | Create ticket |
| GET | /api/tickets/my | requester+ | My tickets (paginated) |
| GET | /api/tickets/:id | requester+ | Ticket detail |
| POST | /api/tickets/:id/comments | requester+ | Add comment |
| POST | /api/tickets/:id/attachments | requester+ | Upload file |
| POST | /api/tickets/:id/assign-to-me | agent+ | Claim ticket (OCC) |
| POST | /api/tickets/:id/unassign | agent+ | Unassign (requires reason) |
| POST | /api/tickets/:id/start | agent+ | Assigned → Started |
| POST | /api/tickets/:id/block | agent+ | Block / on-hold |
| POST | /api/tickets/:id/resume | agent+ | Blocked → Started |
| POST | /api/tickets/:id/complete | agent+ | Complete (requires summary) |
| GET | /api/tickets/:id/history | requester+ | Audit timeline |

### Agent Queue

| Method | Endpoint | Role | Description |
|---|---|---|---|
| GET | /api/agent/tickets/unassigned | agent+ | Shared queue |
| GET | /api/agent/tickets/assigned-to-me | agent+ | My assigned tickets |

### Dashboard & Reports

| Method | Endpoint | Role | Description |
|---|---|---|---|
| GET | /api/dashboard/requester | requester+ | Ticket counts by status |
| GET | /api/dashboard/agent | agent+ | Agent workload metrics |
| GET | /api/dashboard/admin | admin | System KPIs |
| GET | /api/reports/tickets-by-status | agent+ | Status distribution |
| GET | /api/reports/tickets-by-category | admin | Category breakdown |
| GET | /api/audit-logs | admin | System-wide audit log |

---

## Status Workflow

```
Created → Assigned → Started → Completed
    ↓          ↓         ↓
  Blocked ← Blocked ← Blocked
                         ↓
                      (resume) → Started
```

Rules:
- Setting assignee auto-advances `Created → Assigned`
- `Start` requires the ticket to be assigned
- `Complete` requires a `resolutionSummary` (min 10 chars)
- `Unassign` requires a description
- `Block` requires a reason
- `Completed` is a terminal state

---

## Concurrent Assignment

Two agents trying to claim the same ticket simultaneously is handled with **optimistic concurrency control**:

1. Agent A and Agent B both read the ticket at version `N` with `assignee: null`
2. Both submit `POST /api/tickets/:id/assign-to-me`
3. The first write succeeds: `UPDATE WHERE _id=X AND assignee=null AND __v=N` → sets assignee, increments `__v` to `N+1`
4. The second write finds no matching document (version changed) → returns `409 Conflict`
5. The losing agent's UI shows: *"Ticket was just assigned to someone else"*

---

## Running Tests

```bash
cd backend
npm test                  # Run all tests
npm run test:coverage     # Run with coverage report (target: 80%)
```

Test types:
- **Unit tests** (`tests/unit/`): Services and utilities in isolation
- **Integration tests** (`tests/integration/`): Full HTTP request → DB → response using in-memory MongoDB

---

## Key Architecture Decisions

### Clean Architecture Layers

```
Routes → Controllers → Services → Models
```

- **Routes** — RBAC middleware + Joi validation, then delegate to controller
- **Controllers** — Read from `req`, call service, send response. Zero business logic.
- **Services** — All business logic. No HTTP concerns (no `req`/`res`).
- **Models** — Mongoose schemas, indexes, instance methods

### Why React Query + Redux?

- **Redux** manages auth state (user, token) because it's global and synchronous
- **React Query** manages server data (tickets, dashboard stats) because it handles caching, background refetching, and optimistic updates better than Redux for async data

### Append-Only Audit Log

`AuditEvent` documents are never updated or deleted. Every meaningful action (assignment, status change, comment, attachment) writes a new document. This provides a tamper-evident history for compliance and powers the ticket timeline UI.

### Security Measures

- Passwords hashed with bcrypt (cost factor 12)
- JWT secrets in environment variables only
- `select: false` on password field prevents accidental exposure
- MongoDB sanitization middleware (prevents NoSQL injection)
- Rate limiting on all `/api` routes (stricter on `/api/auth`)
- Helmet for HTTP security headers
- CORS restricted to configured frontend origin
- File uploads validate MIME type (not just extension)
- Requesters cannot see other users' tickets (enforced in service layer)
- Internal comments never sent to requesters (filtered in `getTicketById`)

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | 5000 | Server port |
| `NODE_ENV` | development | Environment |
| `MONGODB_URI` | — | MongoDB connection string |
| `JWT_SECRET` | — | JWT signing secret (min 32 chars) |
| `JWT_EXPIRES_IN` | 1d | Token expiry |
| `MAX_FILE_SIZE` | 5242880 | Max file upload size (bytes) |
| `ALLOWED_FILE_TYPES` | jpeg,png,gif,pdf,txt | Comma-separated MIME types |
| `MAX_ATTACHMENTS_PER_TICKET` | 5 | Max files per ticket |
| `CLIENT_URL` | http://localhost:3000 | Frontend URL for CORS |
| `LOG_LEVEL` | debug | Winston log level |
