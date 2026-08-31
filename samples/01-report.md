# Quarterly reconciliation report

**System:** Payment Gateway · **Environment:** Production · **Period:** Q3 2026
**Author:** Platform team · **Status:** Draft for review

---

## Summary

This document exercises the shape most business reports take: a cover page, a
metadata block, wide tables of figures, and prose that has to stay readable at
ten point.

## Figures

| Concept | Amount | Δ vs Q2 | Status |
| ------- | -----: | ------: | ------ |
| Transactions | 1,284,902 | +12.4% | Reconciled |
| Reversals | 3,117 | −2.1% | Reconciled |
| Pending close | 842 | +0.3% | Under review |
| **Total** | **1,288,861** | **+12.3%** | — |

## Findings

1. Deduplication is in place but did not trigger for open-amount QR codes.
2. The hash is computed over a field the bank does not always send.
3. A second defect, symmetrical and worse, is latent in the same line.

> The protection was not badly written. It was looking in the wrong place.

## Next steps

- [x] Root cause identified
- [ ] Fix applied
- [ ] Backfill of the three affected cases
