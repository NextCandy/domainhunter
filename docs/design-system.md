# DomainHunter Design System

## Product Direction

DomainHunter is a dense domain discovery, scoring, RDAP/WHOIS monitoring, and watchlist operations tool. The interface should feel like a focused workbench: compact, fast to scan, clear about state, and comfortable on both desktop and mobile.

## Visual Tokens

- Background: neutral canvas from `--background`; avoid decorative gradients and image-heavy marketing sections.
- Surfaces: use `--surface` and `--surface-2` for panels, tables, drawers, and empty states.
- Primary: restrained blue for the main action, active filters, and selected states.
- Success: available domains and successful jobs.
- Warning: pending deletion, expiry proximity, retries, and partial states.
- Destructive: deletion, failed checks, and unrecoverable errors.
- Radius: keep cards, buttons, filters, and table rows at 8px or less unless a primitive already owns a smaller radius.

## Layout Rules

- Dashboards use compact stat cards, a trend panel, and a recent-activity panel before recommendation grids.
- Data pages use a desktop table and a dedicated mobile card layout. Mobile cards must never require horizontal scrolling.
- Watchlist data is split by intent: candidate purchase/monitoring items separate from owned domains.
- Avoid nested cards. Repeated items can be card-like, but page sections should remain clean bands or direct panels.

## Components

- Buttons should use `btn-base` with `btn-primary`, `btn-ghost`, or `btn-danger`.
- Inputs should use `field`; compact operational controls can add `!py-1.5 text-xs`.
- Status, score, and risk should always use the shared badge components from `app-shell.tsx`.
- Empty states should use `EmptyState` or a dashed bordered panel with one clear next action.

## Responsive QA

- Desktop target: 1440px wide, table columns visible with internal table scroll only when needed.
- Mobile target: 390px wide, no body-level horizontal overflow, cards use wrapped metadata and two-column action grids.
- Verify: login/auth page, dashboard, discover table, domain detail, watchlist groups, admin overview.
