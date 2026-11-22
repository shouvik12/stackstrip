<p align="center"><img src="icons/icon128.png" width="84" alt=""></p>

<h1 align="center">StackStrip</h1>
<p align="center"><b>Debug the failure, not the company's internals.</b></p>
<p align="center">A Chrome extension that strips your company's code out of logs and stack traces <i>before</i> you paste them into Claude, ChatGPT or Gemini — and puts the real names back when you copy the answer.</p>
<p align="center"><a href="https://shouvik12.github.io/stackstrip/demo/">Try the playground</a> · <a href="#install">Install</a> · <a href="#how-it-decides">How it decides</a></p>

---

Most logs we paste into AI chats are company logs: package names, class names, internal hosts, customer IDs, tokens. Secret scanners catch the API keys. They don't touch `com.acmecorp.billing.discount.TierDiscountPolicy.applyGoldTierDiscount`, which tells anyone reading it how your billing works.

StackStrip keeps what the AI needs to fix the bug and renames what belongs to you. **It hides, it doesn't cut:** every line you paste arrives, with your company's names, hosts, IPs, usernames and secrets swapped for stand-ins.

**Before** (what you copied)

```
2026-11-22 14:03:10.992 DEBUG c.a.b.repo.LedgerRepository : jdbc:postgresql://svc_billing:S3cr3tPass!@ledger-db.prod.acme.internal:5432/ledger
com.acmecorp.billing.discount.TierCapExceededException: GOLD tier discount 46% exceeds cap 40% for invoice INV-2291
	at com.acmecorp.billing.discount.TierDiscountPolicy.enforceCap(TierDiscountPolicy.java:118)
	at com.acmecorp.billing.service.InvoiceReconciler.applyGoldTierDiscount(InvoiceReconciler.java:203)
	at org.springframework.web.method.support.InvocableHandlerMethod.doInvoke(InvocableHandlerMethod.java:255)
	... 30 more Spring / Tomcat frames
Caused by: java.lang.ArithmeticException: Rounding necessary
	at java.base/java.math.BigDecimal.setScale(BigDecimal.java:2913)
	at com.acmecorp.billing.discount.TierDiscountPolicy.computePercent(TierDiscountPolicy.java:131)
```

**After** (what the AI sees, with the optional *Trim long logs to the failure* switch on)

```
2026-11-22 14:03:10.992 DEBUG app.mod5.Class5 : jdbc:postgresql://<user>:<secret:password>@host1.example.internal:5432/ledger
app.mod1.AppError1: GOLD tier discount 46% exceeds cap 40% for invoice ID-1
	at app.mod1.Class1.method1(Class1.java:118)
	at app.mod2.Class2.method2(Class2.java:203)
	at org.springframework.web.method.support.InvocableHandlerMethod.doInvoke(InvocableHandlerMethod.java:255)
	... 12 framework frames omitted (org.springframework.web, jakarta.servlet.http, org.apache.catalina)
Caused by: java.lang.ArithmeticException: Rounding necessary
	at java.base/java.math.BigDecimal.setScale(BigDecimal.java:2913)
	at app.mod1.Class1.method4(Class1.java:131)
```

The AI still sees the real bug (`setScale()` without a rounding mode, called from your code at line 131). It just doesn't see your company. By default every line is kept; with trimming switched on, the full sample goes from **58 → 32 lines, ~56% fewer tokens.**

When the AI answers *"pass `RoundingMode.HALF_UP` in `Class1.method4`"*, copy it and your clipboard gets *"…in `TierDiscountPolicy.computePercent`"*.

## Install

From source (Chrome Web Store listing coming):

```bash
git clone https://github.com/shouvik12/stackstrip.git
```

1. Open `chrome://extensions`
2. Turn on **Developer mode** (top right)
3. Click **Load unpacked** and pick the `stackstrip` folder
4. Paste a stack trace into claude.ai or chatgpt.com

Works in any Chromium browser (Chrome, Edge, Brave, Arc).

## What happens when you paste

1. StackStrip checks **everything** you paste into an AI chat — logs, stack traces, terminal output, config, code, meeting notes, ticket text. If nothing private is in it, it pastes instantly and you never notice. (Prefer the old behaviour? Pick *Only logs, stack traces and terminal output* in the popup.)
2. If something private is found, the page gets **nothing** yet. You see a preview of the stripped version, with every replacement highlighted.
3. Still see something private (a customer name, a product codename)? Type it in **Hide word** and it's replaced everywhere, now and in future pastes.
4. The preview says which of two states you're in:
   - **✓ Known patterns hidden**: everything StackStrip recognises is replaced. That isn't a guarantee nothing else is private, so it says so.
   - **⚠ Review required**: it found things it can't judge on its own: business numbers (`46%`, `0.63`, `$1,200`), formulas (`price * 0.63`), or wording like "confidential" or "don't tell customers". They're listed in the **Review** tab. Click **Hide** on any of them, or **Hide all**. Numbers stay visible by default because the AI often needs them to debug.
5. **Paste stripped** (or Enter) sends the stripped text. **Paste original** is there when you need it.
6. Want to check every swap? Open the **What was hidden** tab in the preview (or the panel in the workspace): each original next to its stand-in, grouped by type — usernames, hostnames, IPs, classes, files… Secrets are listed only by type with a masked hint (`sk_l…(32 chars)`). Hover any highlighted stand-in to see what it replaced. If StackStrip hid something public — a library it doesn't know yet — click **Don't hide** on that row: the whole library (e.g. `org.bouncycastle.*`) stays visible from then on. Undo it under *Never hide these* in the toolbar menu.
7. Copy the AI's answer — by selecting it or with the chat's own Copy button — and the aliases turn back into your real names.

## Files too

Attach a file with the 📎 button, drag it onto the chat, or copy it in Finder and press ⌘V — StackStrip checks every file that turns out to be text (logs, configs, code, CSVs, notes — whatever the extension), shows the same preview with a tab per file, and attaches **stripped copies** instead. File names are cleaned too (`acmecorp-billing-prod.log` → `org2-billing-prod.log`). A text file with nothing private in it is attached straight away, no preview.

StackStrip never quietly sends a file it couldn't check. These stop and ask first: **Cancel**, **Leave it out**, or **Attach anyway — not checked**.

| File | Why it can't be checked |
|---|---|
| Images, PDFs, Office files, archives, audio, video | StackStrip only reads text. A screenshot of a log is still a log. |
| Text files over **25 MB** | Too large to check safely in the browser. Trim it, or split it. |
| Binary key stores (`.p12`, `.pfx`, `.jks`, `.keystore`, `.der`) | They're credentials, and StackStrip can't read inside them. Text key files (`.pem`, `id_rsa`, `.env`) are read like any other text, and the key or secret inside is replaced. |

If you attach screenshots all the time, you can turn the question off for images and PDFs only: tick *Don't ask again* in the dialog, or untick *Ask before attaching images or PDFs it can't check* in the popup. Oversized and credential files always ask.

In the workspace, **Open file…** (or drop a file on the box) loads it, and **Save as file** downloads the stripped copy — handy for Jira, Slack or email.

Prefer no preview? Switch to *Paste the stripped version right away* in the toolbar popup.

## The workspace (for Slack, Jira, email — anywhere)

Click the StackStrip icon → **Open StackStrip workspace**, or press **⌥⇧S** (Alt+Shift+S). It's a full tab: paste a log on the left, copy the stripped version from the right, and paste the AI's answer at the bottom to get your real names back. It stays open, and what you paste is kept until you close Chrome (only in memory, never written to disk).

By default nothing is cut. For a huge log you can tick **Trim long logs to the failure** — in the workspace or the popup.

## How it decides

| | What happens | Why |
|---|---|---|
| **Framework frames** — JDK, Spring, Tomcat, Hibernate, Netty, Express, node internals, starlette, Django, `System.*`, `Microsoft.*`… | Kept word for word. Runs longer than 6 are folded into `... 12 framework frames omitted (org.springframework.web, …)` | They're public and they're what the AI needs to diagnose the error |
| **Your frames** — everything else | Package → `app.mod1`, class → `Class1`, method → `method1`, file → `app/file1.ts`. Line numbers kept | Keeps the shape of the stack without its meaning |
| **Source lines** under your frames (Python, Node) | `<source hidden>` | That's your actual code |
| **Code** you paste (JS/TS, Java, Python, Go, SQL) | Declared names that describe business rules (`computeQuietDiscount`, `secret_partner_rates`, `royalty_rate`) are renamed. Plain names like `items`, `TodoList` or `handleClick` stay, so the code still reads. Tick *Rename every function and variable* in the popup to rename them all | Code names are where business logic hides |
| **Config** — YAML, JSON, `.env`, Kubernetes manifests, CI logs | Values of identifying keys (service, image, namespace, bucket, rollout, customer…) and private image registries are hidden. Keys, structure and indentation stay, so YAML and JSON stay valid | So you can still ask "why won't this deploy?" |
| **People and companies** in messages, emails and tickets | Names in `From:`/`To:` lines, `Name <email>`, @mentions, and company names with Bank, Capital, Labs, Inc… become `Person1`, `org1` | Chat pastes are full of them |
| **Exceptions** | `java.lang.*`, `TypeError`, `KeyError`… kept; `TierCapExceededException` → `AppError1` | Custom exception names describe business rules |
| **Messages and log lines** | Hosts, emails, IPs, UUIDs, IDs like `INV-2291` and home-folder paths aliased. Values of identifying keys — in config dumps, JSON, Python dicts, Prometheus labels or OpenTelemetry attributes (`bucket`, `endpoint`, `host`, `namespace`, `pod`, `service`, `kubernetes_pod`, `k8s.namespace.name`, `product_name`, `customer`, `serial_number`…) — are learned and hidden everywhere they appear. `'Quoted values'` are hidden only inside an exception's own message — error codes like `"InternalError"` and system paths like `/etc/app/config.toml` stay readable | Where most leaks hide, without blinding the AI |
| **You** — terminal prompts like `jdoe@Janes-MacBook-Pro ~/work/acme-billing %`, home folders (`/Users/jdoe`, `C:\Users\jdoe`), git `Author:` lines | Become `user1@machine1 ~/project1 %`. Once seen, the name is hidden on every line and in later pastes. `root`, `ubuntu`, `ec2-user` stay readable | Copying straight from the terminal gives away who you are and what you're working on |
| **Secrets** — AWS, GitHub, Stripe, OpenAI, Anthropic, Slack, Google keys, JWTs, bearer tokens, passwords in URLs, `password=` / `token=` pairs, private keys, card-length numbers | Replaced with `<secret:type>`. **Never stored, never restored** | |
| **Noise** *(only with "Trim long logs to the failure" on — off by default)* | Kept: the root exception and its cause chain, the few log lines right before it, ERROR lines, and the last 5 distinct WARN lines before the crash. Repeated lines collapse to `[×3]`; the same crash logged 25 times shows once with `[same stack trace repeated 24 more times]`. Everything else is dropped | Tested on a 2,000-line Spring log: **2,001 → 34 lines, ~74,900 → ~670 tokens (−99%)**, crash, root cause and the related warning all kept, in under 20 ms |

Your own packages installed from a private registry (`node_modules/@acme/…`, `site-packages/acme_…`) look like libraries. Add their prefix under **My company's code starts with** in the popup and they're treated as yours.

Languages: **Java / Kotlin / Scala**, **Python**, **JavaScript / TypeScript** (Node and browser), **C# / .NET**, **Go** (panics and goroutine dumps), plus plain **terminal output** — compiler errors (tsc, dotnet, gcc), npm, git, cargo, shell errors. Structured JSON log lines keep their keys.

Aliases are **stable** — the same class gets the same alias across pastes, so a follow-up question still lines up. The alias table lives only in `chrome.storage.local` on your machine. *Forget aliases* in the popup clears it.

## What it can't promise


StackStrip reduces what leaves your machine. It can't prove nothing private is left, and no fixed set of tests can prove that either.

Known gaps:

- **Business logic in plain words.** `Settlement failed because the reserve rule kicked in` passes as *✓ Known patterns hidden*. The words are ordinary English, and StackStrip can't tell "reserve rule" is internal. Numbers and formulas get flagged for review; ordinary sentences don't.
- **Names it has never seen, written like ordinary words.** `CamelCase` names, names next to cue words ("partner", "client", "project") and names in email headers are caught. A codename that's a plain lowercase word in a plain sentence may not be. Use **Hide word** once and it's hidden from then on.
- **Files it can't read** (images, PDFs, archives). It asks, but it can't look inside.
- **What you choose.** *Paste original* and *Attach anyway* do exactly that.
- **Browsers and sites.** Tested in Chrome against local copies of the chat pages. The real sites change their editors without notice; if a paste ever goes through without a preview when it should have one, report it.

That's what the preview, the Review tab and **Hide word** are for.

It also doesn't change your company's AI policy. If pasting logs into AI tools isn't allowed, it still isn't.

## Privacy

- Everything runs locally. No server, no network requests, no analytics.
- Permissions: `storage` (settings and the alias table) and `clipboardWrite` (restoring names on copy). It only runs on the AI chat sites listed in `manifest.json`.
- Copy-back only happens right after a real click or key press of yours. A page script can't fake that, so it can't use StackStrip to fill your clipboard with your real names. Scripted copy events are ignored too.
- A tiny page-world script ([`src/main-world.js`](src/main-world.js)) notices when a chat's Copy button writes to the clipboard. It only ever sees the aliased text; the real names are restored in the extension's isolated world, so the chat site's own scripts never see them.

## Sites

claude.ai · chatgpt.com · gemini.google.com · aistudio.google.com · copilot.microsoft.com · perplexity.ai · chat.deepseek.com · grok.com · chat.mistral.ai

## Development

```bash
npm test               # leak tests, adversarial corpus, false-alarm checks, alias-table tests
npm run score          # scorecard: what was hidden, flagged for review, or leaked, per scenario
npm run test:browser   # loads the extension in Chrome against a local mock chat page (CHROME=/path/to/chrome)
npm run docs           # regenerates docs/BEFORE-AFTER.md
npm run build:demo     # rebuilds demo/index.html (engine + samples inlined)
npm run zip            # stackstrip.zip for the Chrome Web Store
```

The engine ([`src/engine.js`](src/engine.js)) is dependency-free and works in Node too:

```js
const { strip, restore } = require('./src/engine.js');
const { text, table, report } = strip(log, { privateTerms: ['Acme'] });
const back = restore(aiAnswer, table).text;
```

The tests check that private names, hosts and secrets from every sample never appear in the output, that framework frames survive, and that `restore()` round-trips. Two adversarial corpora (`test/adversarial.js`, `test/adversarial-corpus.js`) cover unknown names, business rules, SQL, code, YAML, JSON, chat and email text, CI logs and Python and Go traces. `test/benign.js` checks that ordinary text isn't touched. See [docs/TEST-REPORT.md](docs/TEST-REPORT.md) and [docs/SECURITY.md](docs/SECURITY.md).

## Roadmap

- Rust, Ruby and PHP stack traces
- Reading text out of PDFs and screenshots (locally) so they can be checked, not just flagged
- An opt-in local model for the plain-English business-logic gap. Only with your say-so, and never a cloud service
- Firefox
- A CLI (`stackstrip < app.log | pbcopy`) and a VS Code command

## License

Apache-2.0
