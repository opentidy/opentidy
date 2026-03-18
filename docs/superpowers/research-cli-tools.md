# CLI Tools Research for Alfred

> Research conducted 2026-03-16. Tools evaluated for use by an autonomous AI assistant (Alfred) running Claude Code on macOS Mac Mini 24/7, handling administrative dossiers for a freelance developer (Acme Corp, Belgium).

**Evaluation criteria**: Can Claude Code call it non-interactively? Does it work on macOS? Is it actively maintained? Does it require API keys or authentication?

---

## 1. Finance & Accounting

### Currency Conversion

| Tool | Description | Install | Auth | Status | Alfred Use Case |
|------|-------------|---------|------|--------|-----------------|
| **cash-cli** | Convert currency rates in terminal. Uses exchangerate.host API. | `npm i -g cash-cli` or `brew install cash-cli` | None (free API) | Active | Quick EUR/USD/GBP conversions for invoicing |
| **exch** | Rust CLI for exchange rates with defaults support | `cargo install exch` | None (free API) | Small project | Set EUR as default base, convert on demand |
| **Frankfurter API** (via curl) | Free open API using ECB rates, no key needed | `curl api.frankfurter.dev/latest?from=EUR` | **None** | Active, reliable | Best option: no API key, ECB official rates, callable via curl/httpie. Supports historical rates. |
| **CurrencyConverter** (Python) | Offline converter using ECB historical data | `pip install CurrencyConverter` | None | Active (updated Jan 2026) | Offline fallback, historical rate lookups |

**Recommendation for Alfred**: Use **Frankfurter API via curl/httpie** -- no API key, official ECB rates, supports historical queries. Dead simple: `curl "https://api.frankfurter.dev/latest?from=EUR&to=USD,GBP"`.

### Cryptocurrency

| Tool | Description | Install | Auth | Status | Alfred Use Case |
|------|-------------|---------|------|--------|-----------------|
| **coingecko-cli** | Official CoinGecko CLI in Go. TUI + CLI modes, 7-day charts, CSV export, 500+ categories, 10+ years history. | `go install github.com/coingecko/coingecko-cli@latest` | Free tier (no key for basic), API key for higher limits | Beta, active (official) | `cg price --symbols btc,eth --vs eur` for crypto portfolio checks |
| **cointop** | Interactive htop-like TUI for crypto tracking. Vim keybindings. | `brew install cointop` or `go install` | None (uses CoinGecko API) | Active, mature | Portfolio tracking, price alerts, lightweight (~1.9MB) |

**Recommendation for Alfred**: **coingecko-cli** for scriptable price queries (`cg price --ids bitcoin --vs eur`). No API key needed for basic usage. **cointop** is better for interactive monitoring but less useful for automation.

### Invoice Generation

| Tool | Description | Install | Auth | Status | Alfred Use Case |
|------|-------------|---------|------|--------|-----------------|
| **invoice** (maaslalani) | Go CLI, generates PDF invoices from flags/env vars. Supports --from, --to, --item, --quantity, --rate, --tax, --discount. | `brew install invoice` or `go install github.com/maaslalani/invoice@main` | None | Active | Generate PDF invoices: `invoice generate --from "Acme Corp" --to "Client" --item "Dev" --quantity 40 --rate 85 --tax 0.21`. Env vars for recurring fields. |
| **clinvoice** (bartman) | Shell-based invoicing with templates | Build from source | None | Low activity | Simpler alternative |

**Recommendation for Alfred**: **invoice** (maaslalani) -- installable via brew, generates clean PDFs, supports env vars for company defaults. Perfect for `invoice generate` calls from Claude sessions.

### Plain Text Accounting

| Tool | Description | Install | Auth | Status | Alfred Use Case |
|------|-------------|---------|------|--------|-----------------|
| **hledger** | Robust, fast plain text accounting (Haskell). CLI + TUI + web UI. Double-entry bookkeeping. | `brew install hledger` | None | Very active (v1.51, Jan 2026) | Track income/expenses, generate reports, multi-currency support. `hledger bal`, `hledger reg`, `hledger is` (income statement). |
| **beancount** (v3) | Python-based double-entry accounting from text files. | `pip install beancount` | None | Active (v3 stable since Jun 2024) | Alternative to hledger. Python ecosystem, good for scripting. **fava** web UI for visualization. |
| **ledger-cli** | Original plain text accounting tool (C++) | `brew install ledger` | None | Mature, slower development | Compatible with hledger format |

**Recommendation for Alfred**: **hledger** -- most active development, great CLI, supports multiple currencies (essential for EUR invoicing), generates income statements and balance sheets. Can read/write `.journal` files that Claude can also edit directly.

### Expense Tracking

| Tool | Description | Install | Auth | Status | Alfred Use Case |
|------|-------------|---------|------|--------|-----------------|
| **plutus** | Single-file Python script, no deps. Income + expense tracking. | `curl` download | None | Active | Quick expense/income logging, tax prep |
| **budgetwarrior** | C++ CLI personal finance manager | Build from source | None | Maintained | Budget tracking with monthly views |

**Recommendation for Alfred**: Better to use **hledger** (above) as the central accounting tool and track expenses there. Avoids maintaining two systems.

### Bank Statement Parsing

| Tool | Description | Install | Auth | Status | Alfred Use Case |
|------|-------------|---------|------|--------|-----------------|
| **ofxstatement** | Convert proprietary bank statements to OFX. Plugin-based for different banks. | `pip install ofxstatement` | None | Active | Parse Belgian bank statements (may need custom plugin for bpost/KBC/ING.be) |
| **csv2ofx** | Convert CSV bank exports to OFX/QIF for import into accounting tools | `pip install csv2ofx` | None | Active | Bridge between bank CSV exports and hledger/beancount |

### IBAN & BIC Validation

| Tool | Description | Install | Auth | Status | Alfred Use Case |
|------|-------------|---------|------|--------|-----------------|
| **python-stdnum** | 200+ standard number formats: IBAN, BIC, VAT, national IDs, company numbers. | `pip install python-stdnum` | None | Very active (v2.2, Jan 2026) | **Swiss army knife**: validate IBAN, BIC, Belgian enterprise numbers (KBO/BCE), EU VAT numbers, all from one library. Use via `python -c "from stdnum import iban; print(iban.is_valid('BE68539007547034'))"` |
| **schwifty** | Python IBAN/BIC library. Parse, validate, generate. Pydantic support. | `pip install schwifty` | None | Active (CalVer) | IBAN component extraction (country, bank code, account), BIC lookup from IBAN |
| **ibantools** (npm) | TypeScript/JS IBAN/BIC validation, creation, extraction | `npm install ibantools` | None | Active | Good if staying in Node.js ecosystem |

**Recommendation for Alfred**: **python-stdnum** is the clear winner -- single library for IBAN, BIC, VAT numbers, Belgian enterprise numbers, and 200+ more formats. Scriptable from command line.

### EU VAT Number Validation (VIES)

| Tool | Description | Install | Auth | Status | Alfred Use Case |
|------|-------------|---------|------|--------|-----------------|
| **VATValidation** (dseichter) | Python tool using official VIES, BZSt, HMRC, Swiss UID APIs. Single + batch validation. CSV/XLSX/JSON output. | `pip install` or clone from GitHub | None (uses official free APIs) | Active | Validate client VAT numbers before invoicing: `vatvalidation --vies BE0123456789` |
| **python-stdnum** (eu.vat module) | Validate EU VAT numbers including VIES online check | `pip install python-stdnum` | None | Very active | `python -c "from stdnum.eu import vat; print(vat.check_vies('BE0123456789'))"` |
| **VIES API** (direct curl) | EC SOAP/REST API for VAT validation | curl | None | Official EU service | `curl` call to VIES REST endpoint |

**Recommendation for Alfred**: **python-stdnum** covers VIES validation already. For batch validation or more detail, add **VATValidation**.

---

## 2. Travel & Transport

### Weather

| Tool | Description | Install | Auth | Status | Alfred Use Case |
|------|-------------|---------|------|--------|-----------------|
| **wttr.in** | curl-based weather. No install needed. 3-day forecast, city/airport codes. | `curl wttr.in/Brussels` | **None** | Active, handles millions of queries/day | Dead simple: `curl "wttr.in/Brussels?format=%t+%w+%h"` for one-line output. Custom format strings. |
| **stormy** | Go-based neofetch-style weather CLI. Uses OpenMeteo (no API key). | `go install github.com/ashish0kumar/stormy@latest` | **None** (OpenMeteo default) | Active (2025) | Alternative with better structured output, 0.3s response time |

**Recommendation for Alfred**: **wttr.in via curl** -- zero install, no API key, custom format strings for machine-readable output. `curl "wttr.in/Brussels?format=j1"` returns JSON.

### Flight Tracking

| Tool | Description | Install | Auth | Status | Alfred Use Case |
|------|-------------|---------|------|--------|-----------------|
| **aviationstack API** (via curl) | REST API for real-time flight tracking, status, airports, airlines. | curl | **Free API key** (500 req/month) | Active, reliable | Track flights for travel dossiers: `curl "api.aviationstack.com/v1/flights?flight_iata=SN3175&access_key=KEY"` |
| **FlightLabs API** (via curl) | Alternative flight tracking REST API | curl | API key (free trial) | Active | Backup option |
| **flight-tracker** (npm) | Basic flight tracking CLI | `npm install -g flight-tracker` | None | Low activity | Simple but limited |

**Recommendation for Alfred**: **aviationstack via curl** -- 500 free requests/month is plenty for personal admin. Returns JSON with departure/arrival times, delays, gate info.

### Train Schedules (Belgium)

| Tool | Description | Install | Auth | Status | Alfred Use Case |
|------|-------------|---------|------|--------|-----------------|
| **iRail API** (via curl) | Open data API for Belgian railway (SNCB/NMBS). Stations, departures, connections, disturbances. | curl | **None** | Active, community-maintained | `curl "https://api.irail.be/connections/?from=Brussels-South&to=Ghent-Sint-Pieters&format=json"`. Real-time departures, delays, platform info. |
| **iRail MCP Server** | MCP server wrapping iRail API | MCP config | None | Available | Could be added as MCP tool for Claude sessions |

**Recommendation for Alfred**: **iRail API via curl** -- free, no auth, returns JSON. Perfect for train travel planning dossiers. Covers all SNCB stations, connections, real-time disturbances.

### SNCF (France) - No dedicated CLI found. Best approach: use Trainline API or scrape SNCF via Camoufox.

---

## 3. Package/Parcel Tracking

| Tool | Description | Install | Auth | Status | Alfred Use Case |
|------|-------------|---------|------|--------|-----------------|
| **ship** (jessfraz) | Go CLI for AfterShip API. Create/get/list/delete shipments. | `go install github.com/jessfraz/ship@latest` | **AfterShip API key** (free tier: 50 trackings/month) | Maintained | `ship create --tracking-number 1Z999... --slug ups`, `ship get --tracking-number 1Z999...` |
| **AfterShip API** (via curl) | REST API, 1290+ carriers including bpost, PostNL, DHL, UPS, FedEx | curl | API key (free: 50/month) | Active, reliable | Direct curl calls for tracking. Supports bpost (Belgium) natively. |
| **TrackingMore API** (via curl) | 1569 carriers, auto-detect carrier from tracking number | curl | API key | Active | Alternative with more carriers |
| **Karrio** | Open-source multi-carrier shipping platform. Labels + tracking + rates. Python/Django. | Docker or `pip install karrio` | Carrier-specific API keys | Active (v2026.1) | Full shipping management: generate labels, track parcels, compare rates. Overkill for just tracking. |
| **ParcelsApp API** (via curl) | Universal tracking, free tier (10/month) | curl | API key (free: 10/month) | Active | Lightweight alternative |

**Recommendation for Alfred**: **AfterShip API via curl or ship CLI** -- 50 free trackings/month covers personal use. Supports bpost, PostNL, DHL, all relevant Belgian/EU carriers. Auto-detects carrier from tracking number.

---

## 4. Government & Admin

### Number/ID Validation

| Tool | Description | Install | Auth | Status | Alfred Use Case |
|------|-------------|---------|------|--------|-----------------|
| **python-stdnum** | Validates 200+ number formats: Belgian enterprise numbers (KBO/BCE), national numbers, IBAN, VAT, etc. | `pip install python-stdnum` | None | Very active | **Essential**: validate Belgian enterprise numbers (`stdnum.be.vat`), national register numbers, EU VAT, IBAN -- all in one library |

### Tax Calculation

No dedicated CLI tool exists for Belgian tax calculation. Options:
- Build a simple Python script using the 2025 Belgian tax brackets (25%/40%/45%/50%)
- Use **hledger** reports with custom tags for tax categories
- Use **Accountable.eu** API if they expose one (currently web-only)

### Legal Documents

| Tool | Description | Install | Auth | Status | Alfred Use Case |
|------|-------------|---------|------|--------|-----------------|
| **pandoc** | Universal document converter. Markdown to PDF/DOCX/HTML and 40+ formats. | `brew install pandoc` | None | Very active | Convert markdown contracts/letters to professional PDFs. Supports templates, headers, ToC. |

### EU Digital Identity (eIDAS 2.0)

No CLI tools available yet. The EU Digital Identity Wallet is still in development (mandatory by Sep 2026). Reference implementation is on GitHub but not usable for production yet.

---

## 5. Productivity

### Calendar & Scheduling

| Tool | Description | Install | Auth | Status | Alfred Use Case |
|------|-------------|---------|------|--------|-----------------|
| **icalPal** | Query macOS Calendar and Reminders from CLI. Outputs JSON/CSV/YAML/Markdown. Modern icalBuddy replacement. | `gem install icalPal` or build | None (reads local Calendar.app DB) | Active | `icalPal eventsToday --output json` -- read calendar events directly from macOS. No API needed. |
| **gcalcli** | Google Calendar CLI. List/add/edit/delete events, agenda view. | `pip install gcalcli` | **Google OAuth** | Active | Full Google Calendar management. `gcalcli agenda`, `gcalcli add "Meeting" "2026-03-20 10:00"` |
| **khal + vdirsyncer** | CalDAV-syncing calendar CLI. Standards-based. | `pip install khal vdirsyncer` | CalDAV server credentials | Active | If using CalDAV server. More complex setup. |

**Recommendation for Alfred**: **icalPal** for reading macOS Calendar (zero auth, local). **gcalcli** if managing Google Calendar (needs OAuth setup once). On macOS, can also use `osascript` to interact with Calendar.app natively.

### Timer/Pomodoro

| Tool | Description | Install | Auth | Status | Alfred Use Case |
|------|-------------|---------|------|--------|-----------------|
| **pomo** | Simple Pomodoro CLI with task tracking and history | `brew install pomo` or `go install` | None | Active | Time-box dossier work sessions |
| **pydoro** | Python terminal Pomodoro timer | `pip install pydoro` | None | Active | Simple timer |

Less relevant for Alfred (autonomous assistant doesn't need Pomodoro), but could be used to time-box sessions.

### Translation

| Tool | Description | Install | Auth | Status | Alfred Use Case |
|------|-------------|---------|------|--------|-----------------|
| **DeepL CLI** (official) | Official DeepL CLI. Translate text + documents (PDF/DOCX/PPTX). TypeScript-based. | `npm install -g @deepl/cli` | **DeepL API key** (free tier: 500k chars/month) | Active (official) | Translate admin documents: `deepl translate --from en --to fr "text"`. Document translation preserves formatting. |
| **translate-shell** | Multi-engine translator (Google, Bing, Yandex, Apertium). `trans` command. | `brew install translate-shell` | **None** (uses free APIs) | Active | Quick translations: `trans :fr "Hello"`. No API key needed. Supports 100+ languages. |

**Recommendation for Alfred**: **translate-shell** for quick text translations (no auth). **DeepL CLI** for high-quality document translations (worth the free API key for 500k chars/month).

### QR Code Generation & Reading

| Tool | Description | Install | Auth | Status | Alfred Use Case |
|------|-------------|---------|------|--------|-----------------|
| **qrencode** | Generate QR codes. Multiple output formats (PNG, SVG, terminal). | `brew install qrencode` | None | Stable, mature | Generate QR codes for invoices, WiFi sharing, contact cards: `qrencode -o qr.png "https://example.com"` |
| **zbar** (zbarimg) | Read/decode QR codes and barcodes from images | `brew install zbar` | None | Stable | Decode QR codes from screenshots/PDFs: `zbarimg --raw image.png` |
| **qrrs** | Rust CLI QR generator + reader in one tool | `cargo install qrrs` | None | Active | Single tool for both generate and read |
| **segno** | Python QR code generator with CLI | `pip install segno` | None | Active | `segno "text" --output qr.svg` -- supports SVG natively |

### URL Shortening

| Tool | Description | Install | Auth | Status | Alfred Use Case |
|------|-------------|---------|------|--------|-----------------|
| **Bitly CLI** | Shorten/expand URLs via Bitly API | Haskell package | **Bitly API key** | Older | URL shortening for Telegram notifications |
| **curl + tinyurl** | Direct API call | curl | None | Always works | `curl -s "https://tinyurl.com/api-create.php?url=LONG_URL"` |

**Recommendation for Alfred**: Just use curl + TinyURL API (no auth needed) or Bitly API (free key).

### Password Generation

| Tool | Description | Install | Auth | Status | Alfred Use Case |
|------|-------------|---------|------|--------|-----------------|
| **pwgen** | Generate pronounceable or random passwords | `brew install pwgen` | None | Stable | `pwgen -sy 32 1` for secure passwords |
| **openssl** | Crypto-quality random generation | Pre-installed on macOS | None | System tool | `openssl rand -base64 32` |

Both are already available or trivially installable. `openssl rand` is already on macOS.

### Task Management

| Tool | Description | Install | Auth | Status | Alfred Use Case |
|------|-------------|---------|------|--------|-----------------|
| **taskwarrior** | Powerful CLI task manager. Tags, projects, priorities, urgency scoring, recurring tasks, reports. | `brew install task` | None | Very active (v3.4.2) | Could complement Alfred's workspace system for tracking sub-tasks within dossiers. `task add "Send invoice to client" project:dossier-42 due:tomorrow` |

**Recommendation for Alfred**: Alfred already has its own workspace/state.md system. Taskwarrior could be useful for the user's personal tasks, but adding it to Alfred's autonomous workflow would create competing state systems.

### Clipboard

macOS native: `pbcopy` and `pbpaste` are built-in. No additional tools needed.

---

## 6. Data Processing

| Tool | Description | Install | Auth | Status | Alfred Use Case |
|------|-------------|---------|------|--------|-----------------|
| **jq** | JSON processor. Filter, transform, query JSON. | `brew install jq` | None | Essential, ubiquitous | Parse API responses, transform data. Already likely installed. |
| **yq** (mikefarah) | YAML/JSON/XML/CSV/TOML processor. jq-like syntax, Go binary. | `brew install yq` | None | Very active | Process YAML configs, convert formats. Single binary, no deps. |
| **xq** (via python-yq) | XML processor, jq wrapper. Converts XML to JSON and pipes to jq. | `brew install python-yq` (installs both yq and xq) | None | Active | Parse XML responses (SOAP APIs, EU services often use XML) |
| **htmlq** / **pup** | HTML parsing with CSS selectors. Like jq for HTML. | `brew install pup` | None | Stable | Extract data from HTML pages when Camoufox is overkill |
| **qsv** | Blazing-fast CSV toolkit (Rust). Fork of xsv with 90+ commands. | `brew install qsv` | None | Very active | Process bank CSV exports, expense reports. `qsv stats`, `qsv select`, `qsv search`, `qsv join`. Handles millions of rows. |
| **csvkit** | Python CSV toolkit. Convert, clean, query CSVs. Includes csvsql. | `pip install csvkit` | None | Active | SQL queries on CSV: `csvsql --query "SELECT * FROM expenses WHERE amount > 100" expenses.csv` |
| **fq** | jq for binary formats. Decode media, packets, executables. | `brew install fq` | None | Active | Inspect binary files, decode media formats |
| **pandoc** | Universal document converter (40+ formats) | `brew install pandoc` | None | Very active | Markdown to PDF/DOCX, convert between document formats |

### Date/Time Calculation

| Tool | Description | Install | Auth | Status | Alfred Use Case |
|------|-------------|---------|------|--------|-----------------|
| **dateutils** | Date arithmetic, diff, sequence, conversion. Financial-data focused. | `brew install dateutils` | None | Stable | Calculate due dates, invoice periods: `dateadd 2026-03-16 +30d`, `datediff 2026-01-01 2026-03-16` |
| **pdd** | Tiny Python date/time diff calculator with timers | `pip install pdd` | None | Stable | Quick date diffs: `pdd 2026 Apr 15` (days until tax deadline) |

### Math & Units

| Tool | Description | Install | Auth | Status | Alfred Use Case |
|------|-------------|---------|------|--------|-----------------|
| **bc** | Arbitrary precision calculator | Pre-installed on macOS | None | System tool | `echo "scale=2; 8500 * 0.21" \| bc` for VAT calculations |
| **calc** | C-style arbitrary precision calculator with programming | `brew install calc` | None | Stable | More powerful than bc, supports functions |
| **GNU units** | Unit conversion with 3000+ units | `brew install gnu-units` | None | Stable | `gunits "100 EUR/hour" "EUR/day"` -- though currency rates aren't updated |

---

## 7. Network & API

| Tool | Description | Install | Auth | Status | Alfred Use Case |
|------|-------------|---------|------|--------|-----------------|
| **httpie** | User-friendly HTTP client. JSON support, colors, sessions. | `brew install httpie` | None | Very active | More readable than curl for API calls: `http GET api.frankfurter.dev/latest from==EUR to==USD` |
| **xh** | Rust reimplementation of httpie. ~30% faster. Same syntax. | `brew install xh` | None | Active | Drop-in httpie replacement with better performance |
| **curlie** | curl frontend with httpie-like output. Uses curl under the hood. | `brew install curlie` | None | Active | Best of both worlds: curl features + readable output |
| **grpcurl** | Like curl, but for gRPC services. Auto-discovery via reflection. | `brew install grpcurl` | None | Active | Interact with gRPC services if needed |
| **websocat** | WebSocket client for CLI. Like netcat for ws://. | `brew install websocat` | None | Active | Test WebSocket connections, real-time data feeds |

**Recommendation for Alfred**: **xh** as the primary HTTP client (fast, httpie syntax). **curl** remains available as universal fallback. **websocat** if Alfred needs to consume WebSocket APIs.

---

## Priority Installation List for Alfred

### Tier 1 -- Install Now (high-value, zero/minimal auth)

```bash
# Data processing (essential plumbing)
brew install jq yq python-yq pup qsv

# Finance
brew install hledger invoice
pip install python-stdnum schwifty

# Documents
brew install pandoc qrencode

# HTTP
brew install xh

# Translation
brew install translate-shell

# Date/time
brew install dateutils
```

### Tier 2 -- Install When Needed (requires API keys or specific use case)

```bash
# Crypto
go install github.com/coingecko/coingecko-cli@latest

# Package tracking (needs AfterShip API key)
go install github.com/jessfraz/ship@latest

# Translation (needs DeepL API key for document translation)
npm install -g @deepl/cli

# Calendar (needs Google OAuth for gcalcli)
pip install gcalcli

# VAT validation
pip install VATValidation

# Flight tracking (needs aviationstack API key)
# Just use curl with API key

# QR reading
brew install zbar
```

### Tier 3 -- Nice to Have

```bash
brew install cointop            # Interactive crypto TUI
brew install pwgen              # Password generation (openssl already available)
brew install fq                 # Binary format inspection
brew install websocat           # WebSocket client
brew install gnu-units          # Unit conversion
pip install pdd                 # Date diff calculator
pip install ofxstatement        # Bank statement parsing
pip install csvkit              # SQL on CSV files
```

### Already Available on macOS (no install needed)

- `curl` -- HTTP client
- `bc` -- Calculator
- `openssl` -- Password/random generation
- `pbcopy` / `pbpaste` -- Clipboard
- `osascript` -- Calendar, Contacts, Messages, Finder integration

### Free APIs (just curl, no install)

- **Frankfurter**: `curl api.frankfurter.dev/latest?from=EUR` (ECB rates, no key)
- **wttr.in**: `curl "wttr.in/Brussels?format=j1"` (weather, no key)
- **iRail**: `curl "api.irail.be/connections/?from=Bruxelles-Midi&to=Gand-Saint-Pierre&format=json"` (Belgian trains, no key)
- **TinyURL**: `curl "tinyurl.com/api-create.php?url=URL"` (URL shortening, no key)

---

## Sources

### Finance
- [exch - currency exchange CLI](https://github.com/anshulxyz/exch)
- [cash-cli](https://github.com/xxczaki/cash-cli)
- [Frankfurter API](https://frankfurter.dev/)
- [CurrencyConverter (Python)](https://pypi.org/project/CurrencyConverter/)
- [CoinGecko CLI](https://github.com/coingecko/coingecko-cli)
- [cointop](https://github.com/cointop-sh/cointop)
- [invoice (maaslalani)](https://github.com/maaslalani/invoice)
- [hledger](https://hledger.org/)
- [beancount](https://github.com/beancount/beancount)
- [plaintextaccounting.org](https://plaintextaccounting.org/)
- [python-stdnum](https://pypi.org/project/python-stdnum/)
- [schwifty](https://github.com/mdomke/schwifty)
- [ibantools (npm)](https://www.npmjs.com/package/ibantools)
- [VATValidation](https://github.com/dseichter/VATValidation)
- [ofxstatement](https://github.com/kedder/ofxstatement)
- [csv2ofx](https://github.com/reubano/csv2ofx)
- [plutus](https://github.com/nickjj/plutus)

### Travel & Transport
- [wttr.in](https://github.com/chubin/wttr.in)
- [stormy](https://github.com/ashish0kumar/stormy)
- [iRail API docs](https://docs.irail.be)
- [iRail MCP Server](https://github.com/HansF/irail-mcp)
- [aviationstack](https://aviationstack.com/)
- [FlightLabs](https://goflightlabs.com)

### Parcel Tracking
- [ship (jessfraz)](https://github.com/jessfraz/ship)
- [AfterShip API](https://www.aftership.com/docs/tracking/quickstart/api-quick-start)
- [Karrio](https://github.com/karrioapi/karrio)
- [ParcelsApp API](https://parcelsapp.com/api-docs/)
- [TrackingMore](https://www.trackingmore.com/tracking-api)

### Productivity
- [icalPal](https://github.com/ajrosen/icalPal)
- [gcalcli](https://github.com/insanum/gcalcli)
- [Taskwarrior](https://taskwarrior.org/)
- [DeepL CLI (official)](https://github.com/DeepLcom/deepl-cli)
- [translate-shell](https://github.com/soimort/translate-shell)
- [qrencode](https://www.x-cmd.com/pkg/qrencode/)
- [zbar](https://zbar.sourceforge.net/)
- [segno](https://segno.readthedocs.io/)
- [pomo](https://kevinschoon.github.io/pomo/)
- [pandoc](https://pandoc.org/)

### Data Processing
- [jq](https://github.com/jqlang/jq)
- [yq (mikefarah)](https://github.com/mikefarah/yq)
- [xq (python-yq)](https://github.com/kislyuk/yq)
- [pup](https://github.com/ericchiang/pup)
- [htmlq](https://github.com/avan06/htmlq)
- [qsv](https://github.com/dathere/qsv)
- [csvkit](https://csvkit.readthedocs.io/)
- [fq](https://github.com/wader/fq)
- [dateutils](https://github.com/hroptatyr/dateutils)
- [pdd](https://github.com/jarun/pdd)
- [calc](https://github.com/lcn2/calc)
- [GNU Units](https://www.gnu.org/software/units/)

### Network & API
- [HTTPie](https://httpie.io/cli)
- [xh](https://www.x-cmd.com/pkg/xh/)
- [curlie](https://github.com/rs/curlie)
- [grpcurl](https://github.com/fullstorydev/grpcurl)
- [websocat](https://github.com/vi/websocat)
