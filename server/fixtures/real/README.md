# fixtures/real/ — private validation documents (NOT committed)

Drop **real client documents** here (BoQ extracts, tender notices, etc.) to validate
the prompts against the material they'll actually be used on.

- The validation script (`npm run validate-prompts`) uses this folder **if it contains
  files**, otherwise it falls back to `../public/`.
- Everything in here except this README is **gitignored** — client documents must
  never be committed. See the repo root `.gitignore` (`server/fixtures/real/*`).

Accepted formats: `.txt`, `.md`, `.csv` (the script reads up to the first 3, ~6k chars).
