# Website review — 2026-11-24

## Desktop and mobile

Reviewed the published site in the in-app Chromium browser at 1440×1000, 768×1024, 390×844, and 320×740. No horizontal overflow at these widths. Hero crest loaded. Desktop hero and enterprise layout, tablet hero, mobile hero, FAQ expansion, and mobile inquiry dialog were visually inspected.

Verified lifecycle tab selection and keyboard navigation, mobile menu opening and automatic collapse after navigation, FAQ expansion, enterprise inquiry preselection, required-field validation, invalid email rejection, inquiry copy contents, Escape/close dismissal, and website privacy dialog. No browser error or warning logs were returned. Test data used qa@example.com and was never sent by email. Native email-client handoff and email delivery were not exercised. Viewport emulation is not physical-device or cross-browser testing.

Found and corrected a missing space in the FAQ heading at the tablet breakpoint where the line break is hidden.

## Finnish name

Sanakirja.org lists stronghold, fortress, and fort among translations of linnake, with both literal fortification and figurative stronghold meanings: https://www.sanakirja.org/search.php?id=185563&l2=3

Added a short sourced “Why Linnake?” section. The brand interpretation is a lasting foundation for customized AI, chosen infrastructure, and continuous improvement. It does not assert Finnish company origins, security certifications, or guaranteed protection.

## Direct submissions — 2026-11-24

Replaced email drafts with a Worker POST endpoint and D1 storage. Four automated tests exercise persistence for demo and enterprise inquiries, stable receipts on retry, duplicate prevention, server field validation, malformed and oversized requests, cross-origin rejection, honeypot rejection, per-email throttling, failed-storage responses, and absence of a public read endpoint. These tests use SQLite with the same generated SQL migrations and bound queries as production. A local browser submission successfully returned a stored receipt.

The earlier email-draft and copy tests describe the previous version and no longer apply. Runtime code has no npm dependencies; Drizzle packages are development-only schema-generation tools.
