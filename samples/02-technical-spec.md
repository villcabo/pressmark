# Payment hash: specification

**Module:** `gpgw-bcpms` · **Branch:** `main` · **Status:** approved

---

## Contract

The hash identifies a transfer uniquely. It is computed once, on receipt, and
the database enforces uniqueness over it.

```go
func (s *Service) PaymentHash(r CallbackRequest) (string, error) {
	if r.CorrelationID == "" {
		return "", fmt.Errorf("correlation id is required: %w", ErrBadRequest)
	}
	sum := sha256.Sum256([]byte(r.CorrelationID + "|" + r.OperationNumber))
	return hex.EncodeToString(sum[:]), nil
}
```

## Schema

```sql
ALTER TABLE payment
  ADD CONSTRAINT payment_hash_unique UNIQUE (payment_hash);

CREATE INDEX idx_payment_created_at ON payment (created_at DESC)
  WHERE qr_multiple_use = true;
```

## Wire format

```json
{
  "Id": 73613636,
  "OperationNumber": "",
  "Amount": 7000.00,
  "Currency": "BOB",
  "RequestDate": "2026-08-24T13:18:04"
}
```

## Failure modes

| Input | Hash | Outcome |
| ----- | ---- | ------- |
| `OperationNumber` empty | differs from the second call | duplicate accepted |
| `OperationNumber` present | stable | duplicate rejected |
| `CorrelationID` empty | error | request refused |

Inline references such as `payment_hash`, `qr_multiple_use` and
`CallbackController#77` appear throughout, and must not break the line.
