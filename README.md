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
4. **Paste stripped** (or Enter) sends the stripped text. **Paste original** is there when you need it.
5. Want to check every swap? Open the **What was hidden** tab in the preview (or the panel in the workspace): each original next to its stand-in, grouped by type — usernames, hostnames, IPs, classes, files… Secrets are listed only by type with a masked hint (`sk_l…(32 chars)`). Hover any highlighted stand-in to see what it replaced. If StackStrip hid something public — a library it doesn't know yet — click **Don't hide** on that row: the whole library (e.g. `org.bouncycastle.*`) stays visible from then on. Undo it under *Never hide these* in the toolbar menu.
6. Copy the AI's answer — by selecting it or with the chat's own Copy button — and the aliases turn back into your real names.

## Files too

Attach a file with the 📎 button, drag it onto the chat, or copy it in Finder and press ⌘V — StackStrip checks every file that turns out to be text (logs, configs, code, CSVs, notes — whatever the extension), shows the same preview with a tab per file, and attaches **stripped copies** instead. File names are cleaned too (`acmecorp-billing-prod.log` → `org2-billing-prod.log`). Images, PDFs and archives can't be cleaned and go through as they are. A text file with nothing private in it is attached straight away, no preview.

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
| **Exceptions** | `java.lang.*`, `TypeError`, `KeyError`… kept; `TierCapExceededException` → `AppError1` | Custom exception names describe business rules |
| **Messages and log lines** | Hosts, emails, IPs, UUIDs, IDs like `INV-2291` and home-folder paths aliased. Values of identifying keys — in config dumps, JSON, Python dicts, Prometheus labels or OpenTelemetry attributes (`bucket`, `endpoint`, `host`, `namespace`, `pod`, `service`, `kubernetes_pod`, `k8s.namespace.name`, `product_name`, `customer`, `serial_number`…) — are learned and hidden everywhere they appear. `'Quoted values'` are hidden only inside an exception's own message — error codes like `"InternalError"` and system paths like `/etc/app/config.toml` stay readable | Where most leaks hide, without blinding the AI |
| **You** — terminal prompts like `jdoe@Janes-MacBook-Pro ~/work/acme-billing %`, home folders (`/Users/jdoe`, `C:\Users\jdoe`), git `Author:` lines | Become `user1@machine1 ~/project1 %`. Once seen, the name is hidden on every line and in later pastes. `root`, `ubuntu`, `ec2-user` stay readable | Copying straight from the terminal gives away who you are and what you're working on |
| **Secrets** — AWS, GitHub, Stripe, OpenAI, Anthropic, Slack, Google keys, JWTs, bearer tokens, passwords in URLs, `password=` / `token=` pairs, private keys, card-length numbers | Replaced with `<secret:type>`. **Never stored, never restored** | |
| **Noise** *(only with "Trim long logs to the failure" on — off by default)* | Kept: the root exception and its cause chain, the few log lines right before it, ERROR lines, and the last 5 distinct WARN lines before the crash. Repeated lines collapse to `[×3]`; the same crash logged 25 times shows once with `[same stack trace repeated 24 more times]`. Everything else is dropped | Tested on a 2,000-line Spring log: **2,001 → 34 lines, ~74,900 → ~670 tokens (−99%)**, crash, root cause and the related warning all kept, in under 20 ms |

Your own packages installed from a private registry (`node_modules/@acme/…`, `site-packages/acme_…`) look like libraries. Add their prefix under **My company's code starts with** in the popup and they're treated as yours.

Languages: **Java / Kotlin / Scala**, **Python**, **JavaScript / TypeScript** (Node and browser), **C# / .NET**, plus plain **terminal output** — compiler errors (tsc, dotnet, gcc), npm, git, cargo, shell errors. Structured JSON log lines keep their keys.

Aliases are **stable** — the same class gets the same alias across pastes, so a follow-up question still lines up. The alias table lives only in `chrome.storage.local` on your machine. *Forget aliases* in the popup clears it.

## What it can't promise


StackStrip reduces what leaves your machine. It can't prove nothing private is left. Business logic can sit in plain words in an error message — `GOLD tier discount 46% exceeds cap 40%` passes through, because the words are ordinary English. That's what the preview and **Hide word** are for.

It also doesn't change your company's AI policy. If pasting logs into AI tools isn't allowed, it still isn't.

## Privacy

- Everything runs locally. No server, no network requests, no analytics.
- Permissions: `storage` (settings and the alias table) and `clipboardWrite` (restoring names on copy). It only runs on the AI chat sites listed in `manifest.json`.
- A tiny page-world script ([`src/main-world.js`](src/main-world.js)) notices when a chat's Copy button writes to the clipboard. It only ever sees the aliased text; the real names are restored in the extension's isolated world, so the chat site's own scripts never see them.

## Sites

claude.ai · chatgpt.com · gemini.google.com · aistudio.google.com · copilot.microsoft.com · perplexity.ai · chat.deepseek.com · grok.com · chat.mistral.ai

## Development

```bash
npm test               # leak tests on the sample logs in samples/
npm run build:demo     # rebuilds demo/index.html (engine + samples inlined)
npm run zip            # stackstrip.zip for the Chrome Web Store
```

The engine ([`src/engine.js`](src/engine.js)) is dependency-free and works in Node too:

```js
const { strip, restore } = require('./src/engine.js');
const { text, table, report } = strip(log, { privateTerms: ['Acme'] });
const back = restore(aiAnswer, table).text;
```

The tests check that private names, hosts and secrets from every sample never appear in the output, that framework frames survive, and that `restore()` round-trips.

## Roadmap

- Go, Rust, Ruby and PHP stack traces
- Dropped and uploaded `.log` files, not just pastes
- Firefox
- A CLI (`stackstrip < app.log | pbcopy`) and a VS Code command

## License

Apache-2.0
