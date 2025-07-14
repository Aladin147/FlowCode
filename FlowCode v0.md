# **FlowCode v0.1 — Working Blueprint**

*(“FlowCode” is a placeholder name until a trademark search clears it.)*

---

## **1 • Why FlowCode Exists**

Solo builders and small teams love the velocity boost from Copilot‑style completions—but they hate second‑guessing whether the AI just slipped a secret, broke lint, or tanked the test suite. **FlowCode** keeps the speed yet refuses to let sloppy or unsafe code reach `main`. It runs a light local model for everyday edits, bursts to a large remote model only when *you* ask, and proves—before every push—that the diff passes lint, smoke tests and a fast security scan.

---

## **2 • Beach‑head User**

A two‑to‑five‑person startup team or indie dev on a 16 GB laptop who already trusts Git, Jest/PyTest and a linter but won’t pay Copilot Enterprise prices or wrangle SonarQube. They crave flow, certainty and a bill that rounds to pocket money.

---

## **3 • Design Pillars**

**Local first** – 2‑4 GB Phi‑3 / Code‑Llama via Ollama.

**Guard‑rails on every save** – an always‑on *Companion Guard* runs incremental lint, type snap and smoke tests in ≤ 500 ms; if it can’t, it downgrades to *Deferred* and keeps you moving.

**Burst on demand** – click **Elevate to Architect** for a sweeping refactor; the prompt goes to GPT‑4‑class cloud under your own API key.

**Git native** – every FlowCode ticket \= a normal branch; pre‑commit and pre‑push hooks inject checks; conflicts use VS Code’s merge UI.

**Graph when you ask** – right‑click → “Show callers/taint path”; the full CPG lives in an *Experimental* tab only if you want it.

**Hot‑patch escape hatch** – `flow hotfix` lands an emergency one‑liner with syntax \+ smoke tests only; FlowCode logs debt and CI nags until repaid.

**Observable trust** – daemon records latency, waiver count, test‑pass ratios; drifts trigger toasts and throttle misbehaving pieces.

---

## **4 • What Ships in v0.1**

### **4.1 flowd (Rust daemon)**

* On‑demand tree‑sitter parse ➜ sled incremental graph.

* Always‑on Guard Service (ESLint/Ruff, tsc \--watch, Jest/PyTest \--watch).

* Local model calls; HTTPS burst proxy with BYO API key.

### **4.2 VS Code Thin Client**

* Auto‑download/launch flowd.

* Inline completions, diff badges, error toasts.

* Web‑view for scoped graph pop‑overs.

### **4.3 Companion Guard**

* Resident Node worker—no subprocess storms.

* Incremental checks in ≤ 0.5 s; else badge \= grey “deferred”.

### **4.4 Final Guard**

* Pre‑push hook runs full test script \+ Semgrep in host shell.

* Firecracker/Docker isolation deferred to v0.2 “Pro”.

### **4.5 Burst Architect**

* Manual trigger only.

* Sends prompt \+ minimal context to GPT‑4‑turbo / Claude‑Opus (user‑supplied key).

* Result re‑checked by Companion Guard.

### **4.6 Hot‑patch & Debt Tracker**

* `flow hotfix path -m "quick prod fix"` ➜ scratch branch, single `HOTFIX:` commit, debt file with 48 h SLA.

### **4.7 Lazy CPG**

* Nodes generated on first graph request.

* Optional CI job precomputes full snapshot and uploads compressed blob.

---

## **5 • Day‑in‑the‑Life Scenario**

`flow init` hashes files in seconds. Each Ctrl‑S flashes a green badge. Need a deep rewrite? **Elevate to Architect**; diff and context hop to GPT‑4‑turbo, Guard re‑checks, commit. Pre‑push runs full tests, pushes clean. When main moves, worktree rebases; conflicts open in VS Code merge UI. Hot‑patch for prod fires keep‑alive fix in 30 s, logs debt, CI nags next day.

---

## **6 • Road to Public Alpha (12 Weeks)**

| Phase | Weeks | Deliverable |
| ----- | ----- | ----- |
| Core daemon \+ warm Guard | 0‑2 | Streaming local completions, sub‑second checks |
| VS Code client \+ hot‑patch | 3‑4 | Inline diffs, debt tracker |
| Branch workflow \+ provenance | 5‑6 | Pre‑commit/push hooks, bundle logs |
| Scoped graph pop‑overs | 7‑8 | Callers/taint path, perf on 100 k LOC |
| Manual Burst Architect | 9‑10 | Remote refactor via BYO key |
| Hallway test & polish | 11‑12 | Cross‑OS installer, telemetry, v0.1‑alpha tag |

Billing, Firecracker isolation, plugin SDK and enterprise knobs slide to v0.2+.

---

## **7 • Yellow‑Flag Risks & Mitigations**

| Risk | Mitigation |
| ----- | ----- |
| Companion \> 500 ms on cold start | One‑time progress bar; warm watchers thereafter |
| Graph overwhelms | Off by default; scoped pop‑overs only |
| Guard RAM spike on 8 GB laptop | Daemon unloads weights after 10 min idle; burst becomes default |
| User abuses hotfix | CI fails after 48 h debt; dashboard nags |
| BYO key reveals inconsistent style | Companion Guard enforces dep allow‑list; user signs off |
| Cross‑OS hook conflicts (nvm, Husky) | Hooks detect env, fall back to plain shell, prompt user to resolve |

---

## **8 • Glossary**

* **flowd** – Rust daemon hosting parse, graph, guard, model.

* **Companion Guard** – \<0.5 s incremental lint/type/test.

* **Final Guard** – pre‑push full tests \+ Semgrep in host shell.

* **Burst Architect** – on‑demand GPT‑4‑class refactor via BYO key.

* **Lazy CPG** – graph nodes built the first time you ask.

* **Debt Tracker** – record of skipped checks from hotfixes, SLA 48 h.

---

*Version: 22 Jun 2025 – distilled for indie‑friendly v0.1 alpha. Heavy enterprise features postponed to v0.2.*

