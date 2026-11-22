# Test report (v0.5.0)

Run on 22 Nov 2026 with Node 22.23 and Google Chrome for Testing 153 (headless, extension loaded unpacked).

## Summary

| | Passed | Failed | Couldn't verify |
|---|---|---|---|
| Unit and regression tests (`npm test`) | 70 / 70 | 0 | — |
| Review corpus, 12 scenarios (`scripts/score.js`) | 12 / 12 fully protected | 0 | — |
| Second corpus, 12 scenarios (`scripts/adversarial-report.js`) | 12 / 12 fully protected | 0 | — |
| Benign text: no false alarms | 12 / 12 | 0 | — |
| Browser tests | 11 / 11 scripts | 0 | Live sites, real Finder ⌘V |

## Privacy coverage

A *marker* is a planted sensitive value. A marker is "hidden" if it's gone from the output, "flagged" if it stays visible but is listed in the Review tab, and "missed" if neither.

| Corpus | Markers | Hidden | Flagged | Missed |
|---|---|---|---|---|
| Review corpus (`test/adversarial.js`) | 50 | 37 | 13 | **0** |
| Second corpus (`test/adversarial-corpus.js`) | 52 | 38 | 14 | **0** |

The flagged markers are numbers, formulas and phrases like "don't forward". They stay visible on purpose; one click hides them.

## Debugging usefulness

- **Debugging context kept:** 40 / 40 in the review corpus; 0 items lost in the second corpus. This covers public frames, error types, line numbers, SQL keywords, YAML keys and similar.
- **Structured output still valid:** 2 / 2 in the review corpus. YAML parses with js-yaml and JSON with `JSON.parse`.
- **2,000-line Spring log, default settings:** nothing cut (2,001 → 2,000 lines; the one line lost is a trailing blank). 9 company frames renamed, 32 framework frames kept, about 13% fewer tokens.
- **Speed:** 2,000 lines in about 0.2 s, 5 MB in about 1.9 s, 10 MB in about 4 s.

## Mapping (alias table) tests

All passed:

- Aliases stay stable across save and load.
- No two values get the same alias.
- Special characters round-trip.
- Overlapping names restore correctly (`VegaPrime` vs `VegaPrimeplus`).
- Restore never edits inside a longer word.
- Secrets are never stored.

## Browser tests

All run against a local mock chat page served under the real hostnames.

| Script | Checks | Result |
|---|---|---|
| `e2e-security.js` | Review banner and tab; *Hide all*; forged copy-back message, with and without `"*"` target, is ignored; real Copy click restores names; scripted `copy` event ignored; PDF dialog → Leave it out / Attach anyway; 26 MB log flagged "too large"; Cancel sends nothing; paste protected on claude.ai, chatgpt.com, gemini.google.com | 15 / 15 |
| `e2e.js` | Page gets nothing before you decide; no leaked words; Copy button restores; plain prose goes straight through | pass |
| `e2e-term.js` | Terminal prompt, user and machine hidden; demo restore | pass |
| `e2e-big.js` | 2,000-line paste: preview in about 0.3 s; nothing cut; crash and warning kept | pass |
| `e2e-ls.js` | Short terminal paste held for preview | pass |
| `e2e-app.js`, `e2e-hidden.js`, `e2e-wsfile.js` | Workspace: readout, hidden list, open file | pass |
| `e2e-keep.js` | *Don't hide* keeps a library visible while company code stays hidden | pass |
| `e2e-files.js` | 📎 attach of two logs plus an image (dialog answered), drag-and-drop, clean file goes straight through, no leaks | pass |
| `e2e-any.js` | Meeting notes held for preview; plain question goes straight through | pass |

## Failed, then fixed during this run

- **Review tab didn't show.** The banner and the Review panel shared a CSS class. Fixed, and covered by `e2e-security.js`.
- **`e2e-files.js` attached nothing.** It predated the new ask-first dialog for images. The test now answers the dialog. This was intended behaviour, not a bug.

## Couldn't be verified

- **The live AI sites.** The test machine has no internet access. Their real editors (ProseMirror and the others) may behave differently from the mock.
- **A real ⌘V of a file copied in Finder.** It needs a physical keyboard on macOS.
- **Edge, Brave and Arc.**

These results show StackStrip handles the cases tested. They don't prove that every confidential detail in every paste will be caught.
