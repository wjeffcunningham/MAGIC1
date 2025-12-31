# Account & League Lifecycle (Authoritative)

This document defines the canonical lifecycle for users, league members, and players.

## 1. Authentication (Supabase Auth)
- Created automatically on signup
- Provides: `id`, `email`
- No league logic here

## 2. site_users (Application Profile)
- Row is created immediately on signup or first login
- Fields:
  - id (auth user id)
  - email
  - status: pending | approved
  - is_mod

Invariant:
> Every authenticated user MUST have exactly one site_users row.

## 3. Moderation
- Admin sets site_users.status = approved
- User gains access to league registration
- No league rows are created automatically

## 4. league_members
- Created per season
- Indicates intent to participate
- Includes payment + confirmation state

Invariant:
> A user may be approved but not a league member.

## 5. players
- Created ONLY by admin sync from league_members
- One-to-one with site_users for competitive identity
- Never created at signup

Invariant:
> players rows must always have a non-null user_id.

## 6. Competition
- League matches update Elo
- External tournaments update Elo via match_history
- Standings are frozen monthly

Any deviation from this lifecycle is a bug.