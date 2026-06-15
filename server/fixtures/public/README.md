# fixtures/public/ — shareable validation stand-ins

Neutral, public sample documents used for training demos and CI-safe validation
runs. **These are public stand-ins, not client data.** They follow a generic,
publicly-documented NRM2-style structure so prompts can be exercised without
exposing anything confidential.

The validation script uses `../real/` if it has files; otherwise it uses these.
