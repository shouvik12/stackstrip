# StackStrip security review (v0.5.0)

This review covers the issues raised in *StackStrip v0.4.1 — Security, Privacy and Reliability Issues*: what was confirmed and fixed, what is still a risk, and what couldn't be verified. StackStrip is still local-first: no server, no network requests, no external AI.

## What StackStrip is for

It stops **accidental** disclosure when you paste text or attach files to the AI chat sites in `manifest.json`. It replaces company names, people, hosts, secrets and company code with stable stand-ins (`Name1`, `app.mod3`, `<secret:jwt>`). When you copy the AI's answer, your real names come back.

It does **not** protect against:

- **Someone who wants to leak data.** *Paste original* and *Attach anyway* exist on purpose.
- **Places it doesn't run:** desktop chat apps (Claude, ChatGPT), mobile apps, sites not in the manifest, other browsers' extension stores, and typing text in by hand.
- **A compromised browser or profile.** Another extension, or malware with access to your Chrome profile, is out of scope.
- **Plain-English business logic it can't recognise** (see "Remaining risks").

## Confirmed defects, now fixed

Each item below has a regression test. Test files are named in brackets.

| Issue from the review | Was | Now |
|---|---|---|
| Unknown proprietary names (`SilverOrchidPartner`, `VegaPrime`) | Passed through if they didn't match a known pattern | CamelCase names, names next to cue words (partner, client, project…), company-suffix names (Helix Bank), email senders, `Name <email>` and @mentions are hidden [adversarial] |
| Business rules, thresholds, formulas | Passed through silently as "protected" | Flagged in a **Review** tab and the preview says **⚠ Review required**. Numbers stay visible unless you hide them, because the AI often needs them [adversarial, browser] |
| SQL | Table, column and literal names passed | Private tables, columns and string literals hidden; SQL keywords kept [adversarial] |
| Pasted source code | Business function and variable names passed | Declared names that describe business rules are renamed. An opt-in setting renames every name [adversarial] |
| YAML / Kubernetes / JSON | Service, image, namespace and rollout values passed; risk of breaking structure | Identifying values hidden; output still parses as YAML/JSON (checked with js-yaml and `JSON.parse`) [adversarial] |
| Chat, ticket and email text | People, companies and "don't tell customers" wording passed | Hidden or flagged [adversarial] |
| CI/CD logs | Repo, image and private registry names passed | Hidden, including the registry's domain everywhere else [adversarial] |
| Python exception messages | Business names in messages passed | Hidden [adversarial] |
| Large attachments | Files over the size limit were attached unchecked, without saying so | Files over 25 MB stop and ask: Cancel / Leave it out / Attach anyway — not checked [browser] |
| Excluded file types (images, PDFs, Office, archives, binary key stores) | Attached silently "as they are" | Same dialog. Only images and PDFs can be set to stop asking [browser] |
| Copy-back message from the page | Any page script could post a message and get real names written to the clipboard | Honoured only right after a trusted click or key press, once per action, same origin, size-limited. Scripted `copy` events ignored [browser] |
| Inconsistent interception | "Only logs" mode used a narrower check than the main path | Both use the same detector. Anything needing review always shows the preview, even in auto-paste mode |
| False confidence | One "done" state for everything | Two states: **✓ Known patterns hidden** (with a note that this isn't a guarantee) and **⚠ Review required** |
| Docs inconsistency | README said images go through "as they are"; roadmap listed file upload as future work | Fixed |
| Test corpus | Sample logs only | Two adversarial corpora (24 scenarios), 12 benign samples, alias-table tests, browser tests |

Found while doing this work:

- **Review list slowed down on huge pastes.** The cost grew with the square of the size. Now 10 MB strips in about 4 s.
- **The Review tab didn't show.** The warning banner and the Review panel shared a CSS class, so the banner swallowed the panel. The browser test caught this.
- **Ordinary component names were renamed.** `TodoList`-style names in code were renamed, which hurt readability. Now only business-sounding names are renamed by default.

## Remaining risks

1. **Plain-English business logic.** `Settlement failed because the reserve rule kicked in` is shown as *✓ Known patterns hidden*. No pattern can tell that "reserve rule" is internal. A local, opt-in model is on the roadmap; it won't ship without your approval.
2. **Unknown names written as ordinary words.** A lowercase codename in a plain sentence, with no cue word, can pass. **Hide word** fixes it for good once you've seen it.
3. **Numbers are visible by default.** They're flagged, not hidden, because hiding them often ruins the debugging. If the number is the secret, you have to click Hide.
4. **The alias table is stored in plain form** in `chrome.storage.local`. It maps stand-ins back to real names, so anyone who can read your Chrome profile can read it. Secrets are never stored. *Forget aliases* clears it.
5. **The site's own scripts.** The page sees only stripped text. But if you choose *Paste original*, the site gets the original.
6. **Site changes.** The chat sites can change their editors at any time. Interception was tested against local copies, not the live sites.
7. **Files it can't read.** It asks, but it can't look inside images or PDFs. If you choose *Attach anyway*, the file goes as is.

## Couldn't be verified here

- **The live sites** (claude.ai, chatgpt.com, gemini.google.com and the rest). The test machine has no internet access. Tests ran against a local mock page served under those hostnames.
- **⌘V of a file copied in Finder.** Browsers only allow this from a real keyboard. It's simulated in tests, not done for real.
- **Other Chromium browsers** (Edge, Brave, Arc). Only Chrome for Testing 153 was used.

Passing these tests doesn't prove StackStrip catches everything confidential. Each test only shows it catches the cases it was written for.
