# Pet-MS Voice Booking Agent

Node.js and Express backend for a Vapi-powered pet boarding assistant.

## Working Features

- Availability checking
- Quote and deposit calculation
- Dog and cat bookings
- Multiple-pet pricing
- E.164 phone normalization
- Booking draft creation, update, and cancellation
- Secure expiring completion links
- Single-use booking form protection
- Sandbox SMS workflow

## Voice Tool Order

1. `check_availability`
2. `calculate_quote`
3. `create_booking_draft`

## Setup

```bash
npm install
cp .env.example .env
npm run dev
```

Local API: `http://localhost:3000`

## Main Endpoints

- `GET /api/health`
- `POST /api/voice/check-availability`
- `POST /api/voice/calculate-quote`
- `POST /api/voice/create-booking-draft`
- `POST /api/voice/vapi-tools`
- `PATCH /api/voice/booking-drafts/:id`
- `POST /api/voice/booking-drafts/:id/cancel`
- `GET /complete-booking/:token`
- `POST /complete-booking/:token`

## Sandbox Limitations

Real SMS, persistent database storage, payment processing, permanent hosting, and production inventory synchronization are not connected yet.

Never commit `.env` or real API credentials. Rotate any key previously exposed in chat, screenshots, or logs.
