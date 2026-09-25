# Rideshare API

A rideshare backend REST API demonstrating the Doctor Dev analysis demo.

## Features

- User authentication (JWT)
- Ride management (request, cancel, complete)
- Payment processing
- Role-based authorization

## Setup

```bash
npm install
cp .env.example .env
# Edit .env with your values
```

## Run

```bash
# Development
npm run dev

# Production
npm run build && npm start
```

The server starts on port **5000** (see .env).

## Test

```bash
npm run test:unit
```

## API Reference

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| POST | /api/auth/register | No | Register user |
| POST | /api/auth/login | No | Login |
| POST | /api/auth/change-password | Yes | Change password |
| GET | /api/users/profile | Yes | Get profile |
| PUT | /api/users/profile | Yes | Update profile |
| GET | /api/users/:id/ride-history | Yes | Get ride history |
| POST | /api/rides | Yes | Request ride |
| GET | /api/rides | Yes | List my rides |
| GET | /api/rides/:id | Yes | Get ride |
| POST | /api/rides/:id/cancel | Yes | Cancel ride |
| POST | /api/rides/:id/complete | Yes | Complete ride |
| POST | /api/payments | Yes | Process payment |
| POST | /api/payments/:id/refund | Yes | Refund payment |
| GET | /api/payments/history | Yes | Payment history |

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| PORT | No | Server port (default 3000) |
| JWT_SECRET | Yes | Secret for JWT signing |
| DATABASE_URL | Yes | PostgreSQL connection string |
| NODE_ENV | No | Environment |
