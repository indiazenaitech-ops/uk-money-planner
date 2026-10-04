# Money Planner (UK)

A white-label library of personal finance planning tools for customers of a UK financial institution:
retirement, savings and ISAs, investments, budgeting from bank statements, a "money inbox" for bills in
emails, take-home pay, mortgages and debt, and a **Dreams & goals** planner that ties everything together.

It is static HTML/CSS/JS. Open `index.html` from disk or host the folder anywhere (GitHub Pages, S3, the
bank's CDN). There is no backend.

## Privacy and security model

- **Sign in on the device.** A customer creates an account in the browser. Their data (the "vault") is
  encrypted with AES-GCM 256 using a key derived from their password (PBKDF2-SHA256, 310,000 iterations,
  random salt). The stored record holds only the salt and the ciphertext.
- **Session.** After sign-in, the derived key is kept in `sessionStorage` (this tab only), so moving between
  tools does not ask for the password again. Closing the tab, pressing *Sign out*, or 15 minutes of
  inactivity ends the session. Five wrong passwords lock sign-in with an increasing delay.
- **Files never leave the device.** Statements (CSV, OFX, QIF, PDF) and emails (.eml, pasted text) are read
  with `FileReader`. PDF reading loads pdf.js from cdnjs the first time; everything else works offline.
- **No password reset.** Only the customer holds the key. Customers can download a backup (plain JSON) from
  the home page and import it on another device.
- **Moving to production.** To link this to the institution's real customer login and data, replace
  `MP.auth` in `shared/core.js` with the bank's OpenID Connect flow, and swap the vault save and load for an
  authenticated API. Live email access (Gmail or Microsoft 365) needs an OAuth app registered by the
  institution. The inbox tool reads exported `.eml` files instead.

## Structure

```
index.html            sign in / create account
guide.html            guided setup (shared/guide.js): adaptive questions → personal plan
home.html             dashboard: About you, dreams summary, tools, activity, account and backup
config.js             white-label settings (brand, logo letters, auto-lock minutes)
shared/style.css      design system (tokens + classes; light and dark)
shared/core.js        window.MP runtime (auth, encrypted vault, shell, helpers, files, charts)
shared/uk.js          window.UK: 2026/27 tax figures and calculators. Update every April.
shared/tools.js       tool catalogue for the home page
apps/<id>/            one folder per tool: index.html, app.js, optional style.css / data.js
tests/check.js        headless checks: node tests/check.js [id|home|all]
tests/<id>.test.js    interaction test per tool
```

## Building a tool (contract)

`apps/<id>/index.html` loads, in order: `../../shared/style.css` (+ optional `style.css`), then scripts
`../../config.js`, `../../shared/uk.js`, `../../shared/glossary.js`, `../../shared/core.js`, optional `data.js`, `app.js`. Body is just
`<main id="app"></main>`. `app.js` starts with:

```js
MP.page({ id: '<id>', title: 'Tool title' }).then(function () { /* render into #app */ });
```

### MP runtime

```
MP.page({id,title}) → Promise        checks session (redirects to sign-in), draws header/back link/footer
MP.get(path, default) / MP.set(path, value)   read/write the encrypted vault (dot paths). Save tool inputs at
                                     'tools.<id>' so choices are remembered.
MP.summary(id, text)                 one-line summary shown on the home tile, e.g. "Retire at 67: £24,300/yr"
MP.log(text)                         add to "Recent activity" on home
MP.profile()                         {name, dob, region: england|wales|scotland|ni, salary, employment, riskAttitude: cautious|balanced|adventurous, dependants}
MP.goals() / MP.saveGoals(list)      shared dreams: {id, name, icon, target, saved, date, priority 1-3, home, rate, monthly, note}
MP.el(tag, props, ...children)       props: class, text, html, style{}, dataset{}, on<event>, any attribute
MP.$ / MP.$$ / MP.esc / MP.num(str) / MP.clamp / MP.uid
MP.money(n, pence?) "£1,234" · MP.pct(0.05) "5%" · MP.fmtNum · MP.fmtDate · MP.isoDate · MP.parseDate (UK formats)
MP.field(label, input, hint) · MP.moneyInput(attrs) → {wrap, input} · MP.seg(options, current, onChange, label)
MP.toast(msg) · MP.modal(node, {title}) → close() · MP.confirm(msg) · MP.download(name, data, mime)
MP.files.pick(accept, multiple) → File[] · .text(file) · .buffer(file) · .dropzone(node, onFiles) · .pdfText(file) → page strings
MP.csv.parse(text) → rows · MP.csv.stringify(rows)
MP.lineChart({series:[{name,color:'--c1',values,area,dash}], labels, marker:{index,label}, label})
MP.barChart({items:[{label,value,color}], format, label}) · MP.donut({items, center, label}) · MP.shortMoney
MP.css('--primary') · MP.theme() · MP.onTheme(fn): redraw charts on theme change
```

### Personalisation (guided setup)

New customers go through `guide.html` after sign-up. It asks how confident they are with money, how much detail they want,
and whether they want professional advice, then asks follow-up questions that depend on their priorities. It ends with a
personal plan of tools and creates dreams from their answers.

```
MP.prefs() → { knowledge: 'new'|'basics'|'confident', detail: 'simple'|'detailed', advice: 'diy'|'maybe'|'yes',
               lifeStage, priorities[], answers{}, plan[{tool, why, urgent}], onboarded }
MP.setPrefs(patch) · MP.onPrefs(fn) · MP.isDetailed() · MP.isBeginner()
MP.adviceCard(topic)   callout worded by advice preference: general | pension | investments | mortgage | protection | iht | tax | debt
                       ('yes' → unbiased.co.uk + FCA Register + questions to ask; 'maybe' → one line; 'diy' → MoneyHelper.
                        'debt' always points to free debt advice.)
MP.term(key, label?)   clickable jargon with its meaning (keys in shared/glossary.js)
MP.explain(key|null, text?)  inline 💡 explanation that only beginners see
```

CSS hooks (driven by `<html data-detail data-knowledge>`): put advanced inputs and breakdowns in `.detail-only`, and
simple-mode-only text in `.simple-only`. `.explain` and `.beginner-only` are hidden for confident users. Every tool gets
a Simple/Detailed switch in its breadcrumb bar automatically. Simple mode should still give a complete, correct answer,
using sensible defaults for the hidden inputs.

Guide answers useful for prefills (all optional, in `MP.prefs().answers`): `dob, region, salary, employment, partnerSalary,
savingsMonths, essentialCosts, leftover, debtFeel, debtTotal, homeFirst, homePrice, homeDeposit, homeWhen, saveGoal,
investExp, riskReaction, pensionKnow, pensionTotal, retireAge, dependants, cover, will, family, selfEmp, job`.
`MP.profile()` also gains `retireAge`, `partnerSalary` and `riskAttitude` from the guide.

### UK runtime (shared/uk.js)

```
UK.R                                  all figures (personal allowance, bands, NI, student loans, pension, State
                                      Pension, ISA, savings, dividends, CGT, growth low/mid/high, inflation)
UK.incomeTax(gross, region) → {tax, personalAllowance, bands[]}
UK.nationalInsurance(gross) · UK.studentLoan(gross, plan) · UK.taxBand(gross)
UK.statePensionAge(dob) · UK.age(dob)
UK.futureValue({start, monthly, years, rate, escalate}) → {balance, paid, growth, series[{month, balance, paid}]}
UK.monthlyNeeded(target, start, years, rate) · UK.real(amount, years, inflation)
```

### Quality bar

- Complete and useful within 5 seconds: sensible defaults, prefilled from `MP.profile()`.
- Plain English a non-expert understands. UK context: £, ISAs, HMRC, State Pension, FSCS.
- Every input is remembered (`MP.set('tools.<id>', …)`), and there is a Reset.
- A `<details class="card">` "How to use this, and tips" section.
- Mobile first: nothing scrolls sideways at 390 px. Wrap tables in `.scroll-x`. Touch targets are at least 40 px.
- Accessible: real buttons, labels, `aria-live` on results, works from the keyboard. Dark mode via tokens.
- Use logical CSS properties (`margin-inline-start`, `inset-inline-end`).
- Guidance, not advice: never recommend a specific product. State assumptions.

Run `node tests/check.js <id>`. It must print PASS. Then look at the screenshots in `tests/shots/<id>/`.
