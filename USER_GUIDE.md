# User Guide

This document describes the user-facing behaviour of Event-Q&A: how
attendees log in, navigate the schedule, ask questions, chat, and how
admins moderate.

For the technical design (data model, API, deployment) see
[TECHNICAL.md](./TECHNICAL.md). For installation and a feature
overview see [README.md](./README.md).

## Login

When a user first connects, they are asked for an **alias** and
optionally a **name**, **affiliation**, **bio**, and **password**.

- The alias must not match any admin alias from `event.yaml`.
- If the alias is unused (or was last seen >60s ago and has no
  password), the user claims it.
- If the alias has a password, the user must enter it to log in. A
  password-protected alias may be used on multiple devices
  simultaneously.
- The alias and a session token are stored in `localStorage`. On
  subsequent visits the user is auto-logged-in → **Landing page**.

Logging out clears `localStorage` only. The account and all its data
remain on the server; the user can log back in with the alias (and
password, if set).

## Landing page

The program of the event, rendered responsively:

- **Desktop**: a timeline grid with one column per track (classic
  conference grid).
- **Mobile**: a single chronological list grouped by day, with track
  and room shown as labels.

Clicking a talk → **Talk page**. Clicking the "users" icon in the
header → **Users list**.

## Talk page

Shows the talk's metadata (title, speakers, room, time, description)
followed by the list of questions for that talk. Each question row
shows the title, the author's current alias, the upvote count and
button, and a message count.

- Click the upvote button to upvote (one vote per user; click again to
  remove).
- Click a question → opens a **chatroom-style page** for that question
  where any logged-in user can post messages. There is no threading;
  it's a flat chat.
- Click the author of a question → **User info**.

If Q&A is disabled for the talk (`qa: false` in the yaml), the talk
page only shows metadata.

## Users list

Alphabetical list of all users with their alias, optional info, and a
count of questions, messages, and last-seen timestamp.

Click a user → **User info**.

## User info

Details about a user: their profile, the questions they posted, and
their public messages. Has a button "Send DM" → **Direct Messages**.

## Direct Messages

A simple two-party chat. Only the two participants can read it via the
API. Each user sees an unread DM badge in the header.

## Admin powers

Accounts listed under `admins:` in `event.yaml` must always log in
with a password (no passwordless option). Once logged in they can:

- Delete or hide any question or message.
- Mark a question as answered (visual badge in the list).
- Ban or rename any user.

Admins use the same web UI; admin-only actions appear as extra
buttons.

## General layout

The header is consistent across all pages:

- Top-left: event name → links to the **Landing page**.
- Top-right: user icon → opens a menu to edit profile (alias, name,
  affiliation, bio, password), toggle dark mode, and log out.
- Badges next to the user icon show unread DMs and new replies on
  questions the user is watching (a user automatically watches any
  question they opened or posted in).
- "Users" icon → **Users list**.

Dark mode follows the OS preference by default; users can override the
choice from their profile menu.

## Rate limiting

To curb spam, each user is limited to a small number of posted
questions / messages / DMs per minute (configurable, default 10/min
total). Upvotes are not rate-limited beyond toggling.
