const state = {
  screen: "idle", // "idle" | "question" | "done"
  round: null, // { roundId, questions }
  index: 0,
  answers: {}, // questionId -> string | string[]
  confirmed: {}, // questionId -> boolean
  highlighted: 0,
  history: [], // { roundId, questions, answers }
};

const els = {
  idleMessage: document.getElementById("idle-message"),
  screenIdle: document.getElementById("screen-idle"),
  screenDone: document.getElementById("screen-done"),
  screenQuestion: document.getElementById("screen-question"),
  roundIndicator: document.getElementById("round-indicator"),
  progress: document.getElementById("q-progress"),
  header: document.getElementById("q-header"),
  text: document.getElementById("q-text"),
  options: document.getElementById("q-options"),
  detail: document.getElementById("q-detail"),
  free: document.getElementById("q-free"),
  freeInput: document.getElementById("q-free-input"),
  custom: document.getElementById("q-custom"),
  customInput: document.getElementById("q-custom-input"),
  customToggle: document.getElementById("q-custom-toggle"),
  back: document.getElementById("btn-back"),
  next: document.getElementById("btn-next"),
  historyList: document.getElementById("history-list"),
};

function currentQuestion() {
  return state.round.questions[state.index];
}

function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function renderPreview(raw) {
  const escaped = escapeHtml(raw);
  let html = escaped.replace(/```[\w-]*\n([\s\S]*?)```/g, (_match, code) => `<pre><code>${code}</code></pre>`);
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  const segments = html.split(/(<pre>[\s\S]*?<\/pre>)/g);
  return segments.map((segment) => (segment.startsWith("<pre>") ? segment : segment.replace(/\n/g, "<br>"))).join("");
}

function render() {
  els.screenIdle.classList.toggle("hidden", state.screen !== "idle");
  els.screenDone.classList.toggle("hidden", state.screen !== "done");
  els.screenQuestion.classList.toggle("hidden", state.screen !== "question");

  if (state.screen === "idle") {
    els.idleMessage.textContent =
      state.history.length === 0 ? "Waiting for the first round…" : "Nice — waiting for the next round…";
    els.roundIndicator.textContent = "";
  } else if (state.screen === "question") {
    renderQuestion();
  } else {
    els.roundIndicator.textContent = "";
  }
}

function renderQuestion() {
  const q = currentQuestion();
  const hasOptions = Array.isArray(q.options) && q.options.length > 0;
  const existingAnswer = state.answers[q.id];

  els.header.textContent = q.header;
  els.text.textContent = q.question;
  els.roundIndicator.textContent = `Question ${state.index + 1} of ${state.round.questions.length}`;
  renderProgress();

  els.options.innerHTML = "";
  els.detail.classList.add("hidden");
  els.custom.classList.add("hidden");
  els.customInput.value = "";

  if (hasOptions) {
    els.free.classList.add("hidden");
    els.customToggle.classList.remove("hidden");

    if (state.highlighted == null || state.highlighted >= q.options.length) {
      state.highlighted =
        Number.isInteger(q.recommended) && q.recommended >= 0 && q.recommended < q.options.length
          ? q.recommended
          : 0;
    }

    if (q.multi) {
      const hint = document.createElement("div");
      hint.className = "multi-hint";
      hint.textContent = "Select any that apply — click, number keys, or Space to toggle.";
      els.options.appendChild(hint);
    }

    q.options.forEach((opt, i) => {
      els.options.appendChild(buildOptionRow(q, opt, i, existingAnswer));
    });

    updateDetailPanel();
  } else {
    els.options.innerHTML = "";
    els.customToggle.classList.add("hidden");
    els.free.classList.remove("hidden");
    els.freeInput.value = typeof existingAnswer === "string" ? existingAnswer : "";
    els.freeInput.focus();
  }

  const isLast = state.index === state.round.questions.length - 1;
  els.next.textContent = isLast ? "Submit" : "Next →";
  updateNextEnabled();
  els.back.disabled = state.index === 0;
}

function buildOptionRow(q, opt, i, existingAnswer) {
  const row = document.createElement("div");
  row.className = "option";
  row.dataset.index = String(i);
  if (i === state.highlighted) row.classList.add("highlighted");

  const isSelected = q.multi
    ? Array.isArray(existingAnswer) && existingAnswer.includes(opt.label)
    : existingAnswer === opt.label;
  if (isSelected) row.classList.add("selected");

  const key = document.createElement("div");
  key.className = q.multi ? "option-key checkbox" : "option-key radio";
  key.textContent = q.multi && isSelected ? "✓" : String(i + 1);

  const body = document.createElement("div");
  body.className = "option-body";

  const label = document.createElement("div");
  label.className = "option-label";
  label.textContent = opt.label;
  if (q.recommended === i) {
    const badge = document.createElement("span");
    badge.className = "badge";
    badge.textContent = "Recommended";
    label.appendChild(badge);
  }
  body.appendChild(label);

  if (opt.description) {
    const desc = document.createElement("div");
    desc.className = "option-desc";
    desc.textContent = opt.description;
    body.appendChild(desc);
  }

  row.appendChild(key);
  row.appendChild(body);

  row.addEventListener("mouseenter", () => {
    state.highlighted = i;
    updateHighlightClasses();
    updateDetailPanel();
  });
  row.addEventListener("click", () => {
    state.highlighted = i;
    if (q.multi) toggleHighlighted();
    else selectHighlighted();
  });

  return row;
}

function renderProgress() {
  els.progress.innerHTML = "";
  state.round.questions.forEach((q, i) => {
    const dot = document.createElement("span");
    dot.className = "progress-dot";
    if (i === state.index) dot.classList.add("current");
    else if (state.confirmed[q.id]) dot.classList.add("answered");
    els.progress.appendChild(dot);
  });
}

function updateHighlightClasses() {
  [...els.options.children].forEach((row, i) => {
    row.classList.toggle("highlighted", i === state.highlighted);
  });
}

function updateDetailPanel() {
  const q = currentQuestion();
  const opt = q.options?.[state.highlighted];
  if (!opt || !opt.preview) {
    els.detail.classList.add("hidden");
    els.detail.innerHTML = "";
    return;
  }
  els.detail.classList.remove("hidden");
  els.detail.innerHTML = renderPreview(opt.preview);
}

function selectHighlighted() {
  const q = currentQuestion();
  const opt = q.options[state.highlighted];
  state.answers[q.id] = opt.label;
  state.confirmed[q.id] = true;
  const isLast = state.index === state.round.questions.length - 1;
  if (isLast) {
    renderQuestion();
  } else {
    state.index += 1;
    state.highlighted = null;
    renderQuestion();
  }
}

function toggleHighlighted() {
  const q = currentQuestion();
  const opt = q.options[state.highlighted];
  const current = Array.isArray(state.answers[q.id]) ? state.answers[q.id] : [];
  state.answers[q.id] = current.includes(opt.label)
    ? current.filter((label) => label !== opt.label)
    : [...current, opt.label];
  renderQuestion();
}

// Reads whichever input is active for the current question and, if it holds
// a valid answer, commits it to state. Shared by the Submit/Next button, the
// global Enter handler, and the per-field Enter/Ctrl+Enter handlers, so
// every path confirms a question the same way instead of only some of them
// setting `state.confirmed`.
function confirmCurrentAnswer() {
  const q = currentQuestion();
  const hasOptions = Array.isArray(q.options) && q.options.length > 0;

  if (!els.custom.classList.contains("hidden")) {
    const value = els.customInput.value.trim();
    if (!value) return false;
    state.answers[q.id] = value;
    state.confirmed[q.id] = true;
    return true;
  }

  if (!hasOptions) {
    const value = els.freeInput.value.trim();
    if (!value) return false;
    state.answers[q.id] = value;
    state.confirmed[q.id] = true;
    return true;
  }

  if (q.multi) {
    state.answers[q.id] = state.answers[q.id] || [];
    state.confirmed[q.id] = true;
    return true;
  }

  // Single-select: a question always has a highlighted option (defaulting
  // to `recommended`), so Enter/Submit without a prior click accepts that
  // highlighted option instead of being a no-op.
  if (!state.confirmed[q.id]) {
    const opt = q.options[state.highlighted ?? q.recommended ?? 0];
    if (!opt) return false;
    state.answers[q.id] = opt.label;
    state.confirmed[q.id] = true;
  }
  return true;
}

// Reflects whether `confirmCurrentAnswer()` would currently succeed, without
// committing anything — keeps the Submit/Next button enabled the moment a
// valid answer exists instead of only after a keyboard shortcut fires.
function updateNextEnabled() {
  const q = currentQuestion();
  const hasOptions = Array.isArray(q.options) && q.options.length > 0;
  const customOpen = !els.custom.classList.contains("hidden");
  let enabled;
  if (customOpen) {
    enabled = els.customInput.value.trim().length > 0;
  } else if (!hasOptions) {
    enabled = els.freeInput.value.trim().length > 0;
  } else {
    // multi-select: zero toggles is valid. single-select: a highlighted
    // option (defaulting to `recommended`) always exists.
    enabled = true;
  }
  els.next.disabled = !enabled;
}

function goNext() {
  if (!confirmCurrentAnswer()) return;
  const isLast = state.index === state.round.questions.length - 1;
  if (isLast) {
    submitRound();
  } else {
    state.index += 1;
    state.highlighted = null;
    renderQuestion();
  }
}

function goBack() {
  if (state.index === 0) return;
  state.index -= 1;
  state.highlighted = null;
  renderQuestion();
}

function submitRound() {
  ws.send(JSON.stringify({ type: "submit", roundId: state.round.roundId, answers: state.answers }));
  state.history.push({ roundId: state.round.roundId, questions: state.round.questions, answers: state.answers });
  renderHistory();
  state.round = null;
  state.screen = "idle";
  render();
}

function renderHistory() {
  els.historyList.innerHTML = "";
  state.history.forEach((entry, i) => {
    const li = document.createElement("li");
    li.className = "history-round";

    const title = document.createElement("div");
    title.className = "history-round-title";
    title.textContent = `Round ${i + 1}`;
    li.appendChild(title);

    entry.questions.forEach((q) => {
      const answer = entry.answers[q.id];
      const answerText = Array.isArray(answer)
        ? answer.length
          ? answer.join(", ")
          : "(none selected)"
        : answer || "(no answer)";
      const row = document.createElement("div");
      row.className = "history-answer";
      row.innerHTML = `<span class="q">${escapeHtml(q.header)}:</span> <span class="a">${escapeHtml(answerText)}</span>`;
      li.appendChild(row);
    });

    els.historyList.appendChild(li);
  });
}

function startRound(roundId, questions) {
  state.round = { roundId, questions };
  state.index = 0;
  state.answers = {};
  state.confirmed = {};
  state.highlighted = null;
  state.screen = "question";
  render();
}

function showDone() {
  state.screen = "done";
  render();
}

function moveHighlight(delta) {
  const q = currentQuestion();
  if (!q.options || q.options.length === 0) return;
  const count = q.options.length;
  state.highlighted = ((state.highlighted ?? 0) + delta + count) % count;
  updateHighlightClasses();
  updateDetailPanel();
}

function selectByNumber(i) {
  const q = currentQuestion();
  if (!q.options || i >= q.options.length) return;
  state.highlighted = i;
  if (q.multi) toggleHighlighted();
  else selectHighlighted();
}

function focusCustomInput() {
  const q = currentQuestion();
  const hasOptions = Array.isArray(q.options) && q.options.length > 0;
  if (!hasOptions) return;
  els.custom.classList.remove("hidden");
  els.customInput.focus();
  updateNextEnabled();
}

document.getElementById("q-custom-toggle").addEventListener("click", focusCustomInput);
els.back.addEventListener("click", goBack);
els.next.addEventListener("click", goNext);
els.customInput.addEventListener("input", updateNextEnabled);
els.customInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    goNext();
  } else if (e.key === "Escape") {
    els.custom.classList.add("hidden");
    updateNextEnabled();
  }
});
els.freeInput.addEventListener("input", updateNextEnabled);
els.freeInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
    e.preventDefault();
    goNext();
  }
});

document.addEventListener("keydown", (e) => {
  if (state.screen !== "question") return;
  const active = document.activeElement;
  const typing = active && (active.tagName === "TEXTAREA" || active.tagName === "INPUT");
  if (typing) return;

  if (/^[1-9]$/.test(e.key)) {
    e.preventDefault();
    selectByNumber(Number(e.key) - 1);
    return;
  }

  switch (e.key) {
    case "ArrowDown":
    case "j":
      e.preventDefault();
      moveHighlight(1);
      break;
    case "ArrowUp":
    case "k":
      e.preventDefault();
      moveHighlight(-1);
      break;
    case "Enter":
      e.preventDefault();
      goNext();
      break;
    case " ": {
      const q = currentQuestion();
      if (q.multi) {
        e.preventDefault();
        toggleHighlighted();
      }
      break;
    }
    case "ArrowLeft":
    case "h":
    case "Backspace":
      e.preventDefault();
      goBack();
      break;
    case "ArrowRight":
    case "l":
      e.preventDefault();
      if (state.confirmed[currentQuestion().id] && state.index < state.round.questions.length - 1) {
        state.index += 1;
        state.highlighted = null;
        renderQuestion();
      }
      break;
    case "o":
    case "/":
      e.preventDefault();
      focusCustomInput();
      break;
    default:
      break;
  }
});

let ws;
let knownBootId = null;
function connect() {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  ws = new WebSocket(`${proto}://${location.host}/ws`);

  ws.addEventListener("message", (event) => {
    const msg = JSON.parse(event.data);
    if (msg.type === "boot") {
      if (knownBootId !== null && knownBootId !== msg.bootId) {
        // The server process restarted (picked up a code change, or
        // recovered from a crash) while this tab stayed open. Reload so the
        // tab runs the current app.js/style.css instead of a stale copy.
        location.reload();
        return;
      }
      knownBootId = msg.bootId;
    } else if (msg.type === "round") {
      if (!state.round || state.round.roundId !== msg.roundId) {
        startRound(msg.roundId, msg.questions);
      }
    } else if (msg.type === "history") {
      state.history.push({ roundId: msg.roundId, questions: msg.questions, answers: msg.answers });
      renderHistory();
    } else if (msg.type === "done") {
      showDone();
    }
  });

  ws.addEventListener("close", () => {
    setTimeout(connect, 1000);
  });
}

connect();
render();
