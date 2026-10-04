# ElevenLabs data processing: checklist for the institution

**Status: DRAFT, prepared for the institution's DPO, procurement and legal teams. It is not legal advice and is not a signed agreement.**
The institution (not the app developer) must sign a Data Processing Agreement (DPA) with ElevenLabs before real customers use the live guide.
Prepared 4 October 2026 for the "Money Planner Guide" agent (`agent_9201m445gfbxfkd9jjep093q5rqy`).

## 1. Roles

| Party | Role under UK GDPR | Notes |
|---|---|---|
| The institution | Controller | Decides why and how the guide is used |
| ElevenLabs | Processor (Art. 28) | Runs speech-to-text, the conversation, text-to-speech and post-call analysis |
| ElevenLabs' sub-processors | Sub-processors | Include the LLM provider. The agent currently uses **Google Gemini 2.5 Flash**, for both the conversation and the evaluations. Ask for the full current list and for notice of changes |

## 2. What data flows to ElevenLabs

| Category | When | Notes |
|---|---|---|
| Customer voice audio (streamed) | Voice mode | Transcribed in real time. Recordings are **off** (`record_voice: false`, `delete_audio: true`) |
| Transcript of what the customer says or types | Always, during a conversation | Kept **30 days** (`retention_days: 30`) |
| Dynamic variables | At start | Knowledge level, Simple/Detailed, advice preference, current page, whether the plan is shared. First name **only** if the customer ticked "Let the guide see my plan" |
| Plan summary (priorities, plan steps, dreams, one-line results) | Only if the customer opted in | Returned by `get_my_plan` / `read_screen`, so it appears in the transcript |
| Screen control labels and values the guide fills in | When the guide acts on screen | For example "salary 38000". Values come from the customer's own words |
| Files uploaded into the widget | Possible: widget file input is **enabled** | **Action:** decide whether to switch this off (`conversation.file_input.enabled`). The app itself never sends statements or emails to ElevenLabs |
| Technical data | Always | IP address, browser, origin (the allowlist checks the origin) |

**Special category or vulnerability data** (health, bereavement, financial difficulty) may be volunteered in conversation. The DPIA must cover this.

**Never sent:** passwords, the encrypted vault, statements or emails read by the app's tools, or backups. These stay on the device.

## 3. DPA clauses to confirm (UK GDPR Art. 28(3))

- [ ] Processing only on documented instructions, with subject matter, duration, nature, purpose, data types and data subjects listed
- [ ] Confidentiality obligations on staff
- [ ] Security measures (Art. 32): encryption in transit and at rest, access control, logging
- [ ] Sub-processors: prior written authorisation or general authorisation with notice and a right to object; the same obligations flow down
- [ ] Help with data subject rights (access, erasure, objection), including finding and deleting a conversation by ID
- [ ] Help with Art. 32–36: breach notification **without undue delay** (ask for 24–48 hours so the institution can meet the ICO's 72-hour deadline), and DPIA support
- [ ] Deletion or return of data at the end of the contract
- [ ] Audit and inspection rights, plus the right to the information needed to show compliance
- [ ] **No training of ElevenLabs' or sub-processors' models on customer conversations**, in writing
- [ ] Voice data is not used for voice cloning or biometric identification

## 4. International transfers

- [ ] Where data is processed and stored (ElevenLabs offers EU data residency on some plans; check UK and EU options)
- [ ] Transfer mechanism for any processing outside the UK: UK adequacy regulations, the **IDTA**, or the **UK Addendum** to the EU SCCs, plus a transfer risk assessment
- [ ] The same for the LLM sub-processor (Google). If data residency is used, the LLM must be one supported in that region

## 5. Retention and deletion

| Setting | Current | Recommendation |
|---|---|---|
| Voice recording | Off | Keep off |
| Transcript retention | 30 days | Agree with the DPO. Shorter, or **zero-retention mode** (Enterprise), if transcripts aren't needed for QA |
| PII redaction in transcripts | **Not available on the current plan.** The API returned 403: Enterprise only | Enable on Enterprise (names, contact numbers, financial IDs, passwords, location) |
| Post-call webhook / cloud export | Workspace setting sends transcript events | **Action:** confirm where they go, or switch them off |

## 6. Security and assurance to request

- [ ] SOC 2 Type II report and/or ISO 27001 certificate (with scope covering Agents)
- [ ] Pen-test summary
- [ ] Information security policy, incident response and BCP/DR summaries
- [ ] Sub-processor list with locations
- [ ] AI-specific controls: prompt-injection protection (guardrail **on**) and content safety

## 7. Regulatory overlay (FCA-regulated firm)

- [ ] **SYSC 8 / outsourcing:** decide whether this is a material outsourcing. It is customer-facing, but the service is guidance only and has a non-AI fallback (the app works without the guide)
- [ ] **Operational resilience (SYSC 15A):** the guide must not be part of an important business service without a fallback. The app keeps working when the guide is off or unavailable, and removing `agentId` switches it off
- [ ] **Third-party risk:** exit plan, concentration risk and contract termination rights
- [ ] **DPIA (Art. 35):** required. New technology, AI, possible vulnerable customers and voice data. The DPIA should also cover the **agent acting on screen**; see `consumer-duty-assessment.md`
- [ ] Privacy notice update: the guide, ElevenLabs as processor, retention and the opt-in plan sharing
- [ ] Records of processing (Art. 30) updated

## 8. Current technical configuration (checked 4 October 2026)

| Control | Status |
|---|---|
| Domain allowlist | ✅ `apnipathshala.ai`, `www.apnipathshala.ai`, origin header required. **Change to the institution's own domain before go-live** |
| Signed-token auth (`enable_auth`) | ❌ Off. Consider turning it on so only signed-in customers can start a conversation (needs a small backend to sign tokens) |
| Voice recording | ✅ Off |
| Transcript retention | ✅ 30 days |
| PII redaction / zero retention | ❌ Needs Enterprise |
| Prompt-injection guardrail | ✅ On |
| Topic (focus) guardrail | ✅ On |
| Consent before the widget loads | ✅ In `shared/live-guide.js` (`consent()`); no network call until the customer agrees |
| Plan sharing | ✅ Opt-in, can be turned off at any time in Guide settings |
| Terms shown in widget | ✅ Explains ElevenLabs, retention and no recordings |
| Post-call evaluation | ✅ 5 Consumer Duty criteria (see the assessment) |
| Widget file upload | ⚠️ Enabled. Decide |
| Daily call limit | ⚠️ 100,000 (default). Set a sensible cap |

## 9. Sign-off

| Role | Name | Decision | Date |
|---|---|---|---|
| Data Protection Officer | | | |
| Procurement / Third-party risk | | | |
| Legal | | | |
| Information Security | | | |
