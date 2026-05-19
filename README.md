# Serenity Shores Lifeguard Scheduler

Standalone scheduling app for Serenity Shores pool lifeguards.

## What it does

- Lifeguards enter their first name.
- Lifeguards select open morning or afternoon shifts from the current date through Oct. 10, 2026.
- Submitted shifts go into a pending request queue.
- Admin opens the admin page with code `7900`.
- Admin approves or rejects requests.
- Admin can manually add/remove scheduled lifeguards.
- Admin can download a black-and-white PDF schedule report between any two dates.
- Admin can reset the schedule only by typing `RESET SCHEDULE`.

## Isolation from Lakeside Essentials

This repo is separate from `chrisdortch/serenity-stores` and should be deployed as its own Vercel project. Do not connect it to the Serenity Stores / Lakeside Essentials project.

## Important MVP note

This first version stores schedule data in browser localStorage. It is fully functional on one browser/device and good for testing the workflow and UI. For real multi-phone lifeguard submissions, connect a shared database such as Vercel Postgres, Neon, or Supabase.

## Vercel settings

Framework: Next.js  
Build command: `npm run build`  
Output: Next.js default  
Root directory: repository root
