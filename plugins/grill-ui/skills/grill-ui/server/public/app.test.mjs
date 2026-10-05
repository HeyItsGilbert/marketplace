// Regression coverage for a real consumer-visible bug found during live use:
// the Submit/Next button could be left permanently disabled (or, for a
// multi-select final question, enabled but a no-op) because only the
// keyboard-shortcut paths ever set `state.confirmed`. These tests exercise
// app.js against real DOM via jsdom, driving it the way a user actually
// would — typing and clicking, never invoking the keyboard shortcuts.
//
// Runs under Node (`node --test`), not `bun test`: jsdom's script execution
// relies on Node's `vm` module, which Bun does not yet implement compatibly
// (confirmed independently — both `window.eval` and real <script> execution
// throw inside jsdom under Bun). The server itself still requires Bun; only
// this DOM test needs Node.

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { JSDOM, VirtualConsole } from "jsdom";

const publicDir = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(publicDir, "index.html"), "utf8");
const appJs = readFileSync(join(publicDir, "app.js"), "utf8");

class FakeWebSocket {
  static instances = [];

  constructor(url) {
    this.url = url;
    this.sent = [];
    this.handlers = {};
    FakeWebSocket.instances.push(this);
  }

  addEventListener(type, handler) {
    this.handlers[type] = handler;
  }

  send(data) {
    this.sent.push(JSON.parse(data));
  }

  emit(type, data) {
    this.handlers[type]?.({ data: JSON.stringify(data) });
  }
}

function mountApp() {
  FakeWebSocket.instances = [];
  let reloadAttempted = false;
  const virtualConsole = new VirtualConsole();
  virtualConsole.on("jsdomError", (err) => {
    // jsdom doesn't implement real navigation; attempting location.reload()
    // surfaces here instead of actually reloading. That's exactly the
    // signal the reload-on-restart test needs.
    if (String(err.message).includes("navigation")) reloadAttempted = true;
  });
  const dom = new JSDOM(html, {
    url: "http://127.0.0.1:4829/s/test-session",
    runScripts: "outside-only",
    virtualConsole,
  });
  const { window } = dom;
  window.WebSocket = FakeWebSocket;
  window.eval(appJs);
  const ws = FakeWebSocket.instances[0];
  assert.ok(ws, "app.js did not open a WebSocket on load");
  assert.equal(ws.url, "ws://127.0.0.1:4829/s/test-session/ws", "WS connects scoped to the page's session id");
  return { window, ws, reloadAttempted: () => reloadAttempted };
}

describe("free-text question", () => {
  test("Submit starts disabled, then enables as soon as the user types (no keyboard shortcut needed)", () => {
    const { window, ws } = mountApp();
    ws.emit("message", {
      type: "round",
      roundId: "r1",
      questions: [{ id: "rollback", header: "Rollback", question: "Plan?" }],
    });

    const button = window.document.getElementById("btn-next");
    assert.equal(button.disabled, true);

    const textarea = window.document.getElementById("q-free-input");
    textarea.value = "Flip the flag off and redeploy the previous tag.";
    textarea.dispatchEvent(new window.Event("input", { bubbles: true }));
    assert.equal(button.disabled, false);

    button.click();
    assert.equal(ws.sent.length, 1);
    assert.equal(ws.sent[0].type, "submit");
    assert.equal(ws.sent[0].answers.rollback, "Flip the flag off and redeploy the previous tag.");
  });
});

describe("multi-select question as the final question in a round", () => {
  test("toggling via click (not the keyboard shortcut) and clicking Submit actually submits", () => {
    const { window, ws } = mountApp();
    ws.emit("message", {
      type: "round",
      roundId: "r2",
      questions: [
        {
          id: "features",
          header: "Features",
          question: "Which ship in v1?",
          multi: true,
          options: [
            { label: "Metrics", description: "d" },
            { label: "Tracing", description: "d" },
          ],
        },
      ],
    });

    const button = window.document.getElementById("btn-next");
    assert.equal(button.disabled, false, "zero selections is a valid multi-select answer");

    const firstOption = window.document.querySelector(".option");
    firstOption.click();
    assert.equal(ws.sent.length, 0, "a toggle must not itself submit");

    button.click();
    assert.equal(ws.sent.length, 1);
    assert.deepEqual(ws.sent[0].answers.features, ["Metrics"]);
  });

  test("multi-select options render as checkboxes with a hint, distinct from single-select", () => {
    const { window } = mountApp();
    const ws = FakeWebSocket.instances[0];
    ws.emit("message", {
      type: "round",
      roundId: "r4",
      questions: [
        {
          id: "features",
          header: "Features",
          question: "Which?",
          multi: true,
          options: [{ label: "A", description: "d" }],
        },
      ],
    });

    const key = window.document.querySelector(".option-key");
    assert.equal(key.classList.contains("checkbox"), true);
    assert.equal(key.classList.contains("radio"), false);
    assert.notEqual(window.document.querySelector(".multi-hint"), null);
  });
});

describe("option accessibility semantics", () => {
  test("single-select options expose radiogroup/radio roles, aria-checked, and a roving tabindex", () => {
    const { window } = mountApp();
    const ws = FakeWebSocket.instances[0];
    ws.emit("message", {
      type: "round",
      roundId: "r-a11y-1",
      questions: [
        {
          id: "storage",
          header: "Storage",
          question: "Which?",
          options: [
            { label: "Postgres", description: "d" },
            { label: "SQLite", description: "d" },
          ],
          recommended: 0,
        },
      ],
    });

    const container = window.document.getElementById("q-options");
    assert.equal(container.getAttribute("role"), "radiogroup");

    const options = [...window.document.querySelectorAll(".option")];
    assert.equal(options.length, 2);
    for (const row of options) assert.equal(row.getAttribute("role"), "radio");

    // Only the highlighted (recommended) option is in the Tab order; the
    // rest are reachable via arrow keys, not Tab, per the roving-tabindex
    // pattern — and it is also the element that actually holds DOM focus.
    assert.equal(options[0].tabIndex, 0);
    assert.equal(options[1].tabIndex, -1);
    assert.equal(options[0].getAttribute("aria-checked"), "false");
    assert.equal(window.document.activeElement, options[0]);

    options[1].click();
    window.document.getElementById("btn-next").click();
    assert.equal(ws.sent.length, 1);
    assert.equal(ws.sent[0].answers.storage, "SQLite");
  });

  test("arrow-key navigation moves the roving tabindex/focus to the real highlighted option, not an off-by-one DOM child (the multi-select hint occupies slot 0)", () => {
    const { window } = mountApp();
    const ws = FakeWebSocket.instances[0];
    ws.emit("message", {
      type: "round",
      roundId: "r-a11y-2",
      questions: [
        {
          id: "features",
          header: "Features",
          question: "Which ship in v1?",
          multi: true,
          options: [
            { label: "Metrics", description: "d" },
            { label: "Tracing", description: "d" },
          ],
        },
      ],
    });

    const container = window.document.getElementById("q-options");
    assert.equal(container.getAttribute("role"), "group");
    assert.equal(container.children[0].className, "multi-hint", "hint is DOM child 0, ahead of the options");

    window.document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));

    const options = [...window.document.querySelectorAll(".option")];
    assert.equal(options[0].classList.contains("highlighted"), false);
    assert.equal(options[1].classList.contains("highlighted"), true, "highlight landed on option 1, not the hint");
    assert.equal(options[1].tabIndex, 0);
    assert.equal(window.document.activeElement, options[1], "DOM focus followed the highlight, not the hint div");

    window.document.dispatchEvent(new window.KeyboardEvent("keydown", { key: " ", bubbles: true }));
    // The space toggle re-renders the option list from scratch, so the
    // previously queried `options[1]` is now a detached stale node —
    // re-query to read the current DOM's attributes.
    const toggled = [...window.document.querySelectorAll(".option")][1];
    assert.equal(toggled.getAttribute("aria-checked"), "true");
  });
});

describe("single-select question", () => {
  test("picking an option auto-advances, and renders as a radio (not checkbox)", () => {
    const { window, ws } = mountApp();
    ws.emit("message", {
      type: "round",
      roundId: "r3",
      questions: [
        {
          id: "storage",
          header: "Storage",
          question: "Which?",
          options: [
            { label: "Postgres", description: "d" },
            { label: "SQLite", description: "d" },
          ],
          recommended: 0,
        },
        { id: "notes", header: "Notes", question: "Anything else?" },
      ],
    });

    const key = window.document.querySelector(".option-key");
    assert.equal(key.classList.contains("radio"), true);

    window.document.querySelector(".option").click();
    assert.equal(window.document.getElementById("q-header").textContent, "Notes");

    const textarea = window.document.getElementById("q-free-input");
    textarea.value = "no notes";
    textarea.dispatchEvent(new window.Event("input", { bubbles: true }));
    window.document.getElementById("btn-next").click();

    assert.equal(ws.sent.length, 1);
    assert.equal(ws.sent[0].answers.storage, "Postgres");
    assert.equal(ws.sent[0].answers.notes, "no notes");
  });

  test("pressing Enter without clicking first confirms the highlighted (recommended) option", () => {
    const { window, ws } = mountApp();
    ws.emit("message", {
      type: "round",
      roundId: "r5",
      questions: [
        {
          id: "storage",
          header: "Storage",
          question: "Which?",
          options: [
            { label: "Postgres", description: "d" },
            { label: "SQLite", description: "d" },
          ],
          recommended: 1,
        },
      ],
    });

    const button = window.document.getElementById("btn-next");
    assert.equal(button.disabled, false, "single-select is enabled by default via its highlighted option");

    window.document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));

    assert.equal(ws.sent.length, 1);
    assert.equal(ws.sent[0].answers.storage, "SQLite");
  });

  test("a number-key answer that auto-advances to a free-text question prevents the browser's default key action", () => {
    // Regression: selectByNumber() can synchronously focus the next
    // question's textarea (via renderQuestion -> auto-advance) while still
    // inside the same keydown's dispatch. If that keydown's default action
    // isn't prevented, the browser then inserts the pressed digit into
    // whatever now has focus — typing "1" into the next question's textbox.
    const { window } = mountApp();
    const ws = FakeWebSocket.instances[0];
    ws.emit("message", {
      type: "round",
      roundId: "r6",
      questions: [
        {
          id: "storage",
          header: "Storage",
          question: "Which?",
          options: [{ label: "Postgres", description: "d" }],
          recommended: 0,
        },
        { id: "notes", header: "Notes", question: "Anything else?" },
      ],
    });

    const event = new window.KeyboardEvent("keydown", { key: "1", bubbles: true, cancelable: true });
    window.document.dispatchEvent(event);

    assert.equal(window.document.getElementById("q-header").textContent, "Notes", "advanced to question 2");
    assert.equal(event.defaultPrevented, true, "keydown's default action must be prevented once handled");
  });
});

describe("server restart detection", () => {
  // Regression: the browser tab stays open across an entire session by
  // design (no page reload between rounds), so if the server process
  // restarts — picking up a code fix, or recovering from a crash — the
  // already-open tab would otherwise keep running stale app.js forever.
  test("a changed boot id on a later connection triggers a page reload", () => {
    const { ws, reloadAttempted } = mountApp();
    ws.emit("message", { type: "boot", bootId: "boot-1" });
    assert.equal(reloadAttempted(), false, "the first boot id seen is just a baseline, not a restart");

    ws.emit("message", { type: "boot", bootId: "boot-1" });
    assert.equal(reloadAttempted(), false, "the same boot id again is not a restart");

    ws.emit("message", { type: "boot", bootId: "boot-2" });
    assert.equal(reloadAttempted(), true, "a different boot id means the server process restarted");
  });
});

describe("session label", () => {
  test("the boot message's label is shown in the top bar so concurrent tabs on different sessions are distinguishable", () => {
    const { window, ws } = mountApp();
    ws.emit("message", { type: "boot", bootId: "boot-1", label: "API redesign" });
    assert.equal(window.document.getElementById("session-label").textContent, "API redesign");
  });
});

describe("session picker", () => {
  // A tab opened at `/` (no session id in the URL) never had anywhere to
  // get an id from, so it can't open a session-scoped WebSocket at all —
  // it fetches the session list over plain HTTP instead and renders it as
  // a list of links, each navigating to that session's `/s/<id>` URL.
  function mountPicker(sessions) {
    FakeWebSocket.instances = [];
    const dom = new JSDOM(html, { url: "http://127.0.0.1:4829/", runScripts: "outside-only" });
    const { window } = dom;
    window.WebSocket = FakeWebSocket;
    window.fetch = async (url) => {
      assert.equal(url, "/sessions");
      return { json: async () => ({ sessions }) };
    };
    window.eval(appJs);
    return { window };
  }

  test("no session id in the URL renders the picker instead of opening a WebSocket", async () => {
    const { window } = mountPicker([
      { id: "a", label: "API redesign", done: false, pending: true, rounds: 1 },
      { id: "b", label: "Schema cleanup", done: true, pending: false, rounds: 3 },
    ]);
    // loadPicker() is async; let its promise settle before asserting.
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.equal(FakeWebSocket.instances.length, 0, "no session id means no WebSocket to connect");
    assert.equal(window.document.getElementById("screen-picker").classList.contains("hidden"), false);

    const items = [...window.document.querySelectorAll(".picker-item")];
    assert.equal(items.length, 2);
    assert.equal(items[0].getAttribute("href"), "/s/a");
    assert.equal(items[0].querySelector(".picker-item-label").textContent, "API redesign");
    assert.equal(items[0].querySelector(".picker-item-status").textContent, "Waiting on your answer");
    assert.equal(items[1].querySelector(".picker-item-status").textContent, "Done — 3 rounds");
  });

  test("an empty session list shows a hint instead of an empty list", async () => {
    const { window } = mountPicker([]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(window.document.querySelectorAll(".picker-item").length, 0);
    assert.match(window.document.getElementById("picker-list").textContent, /No sessions yet/);
  });
});
