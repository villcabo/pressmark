# Diagnostic note: duplicate merchant notifications

**Reported:** 2026-08-24 · **Severity:** medium · **Owner:** Platform

The bank confirmed the same payment twice, sixteen minutes apart. Both were
recorded as independent, so the merchant was notified twice for one transfer.

## What happened

Deduplication exists and did not fire. The hash that should have stopped the
duplicate is computed over a field the bank does not always send.

## What to do

1. Compute the hash over the correlation id alone.
2. Backfill the three known cases.
3. Check whether the sibling module shares the defect.

No cover page, no ceremony. This is the format for something that gets read in
a hurry and answered the same day.
