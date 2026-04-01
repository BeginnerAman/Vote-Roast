import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getDatabase,
  ref,
  get,
  set,
  update,
  remove,
  onValue,
  off,
  push,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyBUz5w9wOt1DJ6URheQtQyDmmKfUY1miWc",
  authDomain: "player-game-1d034.firebaseapp.com",
  databaseURL: "https://player-game-1d034-default-rtdb.firebaseio.com",
  projectId: "player-game-1d034",
  storageBucket: "player-game-1d034.firebasestorage.app",
  messagingSenderId: "496095734585",
  appId: "1:496095734585:web:18c5b634f89ff13e4a16e8"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

const QUESTIONS = [
  "Sabse lazy kaun? (the one who calls 2pm 'early morning')",
  "Kaun sabse zyada fake promises karta hai?",
  "Group ka certified drama department kaun hai?"
];

const ROASTS = [
  "{name} is so lazy, loading screen says 'bro take your time'.",
  "{name} writes 'on my way' from bed at 93% blanket mode.",
  "{name} could win Olympics in postponing simple tasks.",
  "{name}'s consistency? Consistently late.",
  "{name} gives motivational talks while doing nothing.",
  "Breaking news: {name} found in natural habitat... avoiding responsibility."
];

const TOAST_MS = 1800;
const MAX_PLAYERS = 6;
const MIN_PLAYERS = 2;

const state = {
  roomCode: "",
  playerId: "",
  playerName: "",
  roomData: null,
  isHost: false,
  unsubRoom: null
};

const el = {
  screens: {
    home: byId("home-screen"),
    lobby: byId("lobby-screen"),
    question: byId("question-screen"),
    roast: byId("roast-screen"),
    anonWrite: byId("anon-write-screen"),
    guess: byId("guess-screen"),
    results: byId("results-screen")
  },
  nameInput: byId("name-input"),
  roomInput: byId("room-input"),
  createRoomBtn: byId("create-room-btn"),
  joinRoomBtn: byId("join-room-btn"),
  copyRoomBtn: byId("copy-room-btn"),
  startGameBtn: byId("start-game-btn"),
  leaveRoomBtn: byId("leave-room-btn"),
  roomCodeDisplay: byId("room-code-display"),
  playerCount: byId("player-count"),
  playersList: byId("players-list"),
  questionIndex: byId("question-index"),
  currentQuestion: byId("current-question"),
  voteOptions: byId("vote-options"),
  voteProgress: byId("vote-progress"),
  voteStatus: byId("vote-status"),
  roastTarget: byId("roast-target"),
  roastMessage: byId("roast-message"),
  roastSubtext: byId("roast-subtext"),
  anonMessageInput: byId("anon-message-input"),
  submitAnonBtn: byId("submit-anon-btn"),
  anonSubmitStatus: byId("anon-submit-status"),
  guessIndex: byId("guess-index"),
  guessTotal: byId("guess-total"),
  guessMessage: byId("guess-message"),
  guessOptions: byId("guess-options"),
  guessStatus: byId("guess-status"),
  scoreboardList: byId("scoreboard-list"),
  replayBtn: byId("replay-btn"),
  resultsLeaveBtn: byId("results-leave-btn"),
  toast: byId("toast")
};

wireEvents();
showScreen("home");

function wireEvents() {
  el.createRoomBtn.addEventListener("click", onCreateRoom);
  el.joinRoomBtn.addEventListener("click", onJoinRoom);
  el.copyRoomBtn.addEventListener("click", onCopyCode);
  el.startGameBtn.addEventListener("click", onStartGame);
  el.leaveRoomBtn.addEventListener("click", leaveRoom);
  el.submitAnonBtn.addEventListener("click", submitAnonMessage);
  el.replayBtn.addEventListener("click", onReplay);
  el.resultsLeaveBtn.addEventListener("click", leaveRoom);
  window.addEventListener("beforeunload", cleanupOnExit);
}

async function onCreateRoom() {
  const playerName = sanitizeName(el.nameInput.value);
  if (!playerName) {
    return toast("Enter your name first.");
  }
  const roomCode = generateRoomCode();
  const playerId = crypto.randomUUID();
  const roomRef = ref(db, `rooms/${roomCode}`);
  const payload = initialRoomPayload(roomCode, playerId, playerName);
  await set(roomRef, payload);
  await afterJoin(roomCode, playerId, playerName, true);
}

async function onJoinRoom() {
  const playerName = sanitizeName(el.nameInput.value);
  const roomCode = sanitizeRoomCode(el.roomInput.value);
  if (!playerName || !roomCode) {
    return toast("Name and room code are required.");
  }
  const roomRef = ref(db, `rooms/${roomCode}`);
  const snap = await get(roomRef);
  if (!snap.exists()) {
    return toast("Room not found.");
  }
  const room = snap.val();
  const players = room.players ? Object.values(room.players) : [];
  if (players.length >= MAX_PLAYERS) {
    return toast("Room is full.");
  }
  if (room.game?.phase !== "lobby") {
    return toast("Game already started. Ask host for replay.");
  }
  const playerId = crypto.randomUUID();
  await set(ref(db, `rooms/${roomCode}/players/${playerId}`), {
    id: playerId,
    name: playerName,
    score: 0,
    joinedAt: Date.now()
  });
  await afterJoin(roomCode, playerId, playerName, room.hostId === playerId);
}

async function afterJoin(roomCode, playerId, playerName, isHost) {
  state.roomCode = roomCode;
  state.playerId = playerId;
  state.playerName = playerName;
  state.isHost = isHost;
  el.roomInput.value = roomCode;
  listenRoom(roomCode);
  showScreen("lobby");
  toast("Joined room.");
}

function listenRoom(roomCode) {
  if (state.unsubRoom) {
    off(state.unsubRoom.ref, "value", state.unsubRoom.handler);
  }
  const roomRef = ref(db, `rooms/${roomCode}`);
  const handler = (snap) => {
    const room = snap.val();
    if (!room) {
      toast("Room closed.");
      hardResetLocal();
      showScreen("home");
      return;
    }
    state.roomData = room;
    state.isHost = room.hostId === state.playerId;
    renderRoom(room);
  };
  onValue(roomRef, handler);
  state.unsubRoom = { ref: roomRef, handler };
}

function renderRoom(room) {
  const playersObj = room.players || {};
  const players = Object.values(playersObj).sort((a, b) => a.joinedAt - b.joinedAt);
  el.roomCodeDisplay.textContent = state.roomCode;
  el.playerCount.textContent = String(players.length);
  el.playersList.innerHTML = "";
  players.forEach((p) => {
    const item = document.createElement("div");
    const hostBadge = room.hostId === p.id ? "👑 Host" : "";
    const meBadge = p.id === state.playerId ? "You" : "";
    item.className = "player-pill";
    item.innerHTML = `<span>${escapeHtml(p.name)}</span><span class="text-xs text-slate-300">${hostBadge} ${meBadge}</span>`;
    el.playersList.appendChild(item);
  });

  const phase = room.game?.phase || "lobby";
  el.startGameBtn.disabled = !(state.isHost && players.length >= MIN_PLAYERS && phase === "lobby");
  if (phase === "lobby") {
    showScreen("lobby");
    return;
  }
  if (phase === "question") {
    renderQuestionPhase(room, players);
    return;
  }
  if (phase === "roast") {
    renderRoastPhase(room);
    return;
  }
  if (phase === "anonWrite") {
    renderAnonWritePhase(room, players);
    return;
  }
  if (phase === "guess") {
    renderGuessPhase(room, players);
    return;
  }
  if (phase === "results") {
    renderResults(room, players);
  }
}

async function onStartGame() {
  if (!state.isHost || !state.roomData) return;
  const room = state.roomData;
  const players = Object.keys(room.players || {});
  if (players.length < MIN_PLAYERS) return toast("Need at least 2 players.");
  const updates = {};
  players.forEach((pid) => {
    updates[`rooms/${state.roomCode}/players/${pid}/score`] = 0;
  });
  updates[`rooms/${state.roomCode}/game`] = {
    phase: "question",
    qIndex: 0,
    votes: {},
    round1Totals: {},
    roastWinnerId: "",
    roastText: "",
    anonMessages: {},
    guessIndex: 0,
    guesses: {}
  };
  await update(ref(db), updates);
}

function renderQuestionPhase(room, players) {
  showScreen("question");
  const qIndex = room.game.qIndex || 0;
  el.questionIndex.textContent = String(qIndex + 1);
  el.currentQuestion.textContent = QUESTIONS[qIndex];
  const votes = room.game.votes || {};
  const totalVotes = Object.keys(votes).length;
  const myVote = votes[state.playerId];
  const progress = players.length ? Math.round((totalVotes / players.length) * 100) : 0;
  el.voteProgress.style.width = `${progress}%`;
  el.voteStatus.textContent = `${totalVotes}/${players.length} votes submitted`;
  el.voteOptions.innerHTML = "";
  players.forEach((p) => {
    const btn = document.createElement("button");
    btn.className = "btn btn-secondary";
    if (myVote === p.id) btn.classList.add("pulse");
    btn.textContent = p.name;
    btn.disabled = Boolean(myVote);
    btn.addEventListener("click", () => submitVote(p.id));
    el.voteOptions.appendChild(btn);
  });
  if (state.isHost && totalVotes === players.length && players.length > 0) {
    finalizeVotesRound(room, players).catch(() => toast("Failed to process votes."));
  }
}

async function submitVote(targetId) {
  if (!state.roomCode) return;
  await set(ref(db, `rooms/${state.roomCode}/game/votes/${state.playerId}`), targetId);
}

async function finalizeVotesRound(room, players) {
  const votes = room.game.votes || {};
  if (!Object.keys(votes).length) return;
  const tally = {};
  Object.values(votes).forEach((pid) => {
    tally[pid] = (tally[pid] || 0) + 1;
  });
  const totals = { ...(room.game.round1Totals || {}) };
  Object.entries(tally).forEach(([pid, count]) => {
    totals[pid] = (totals[pid] || 0) + count;
  });
  const qIndex = room.game.qIndex || 0;
  const isLastQuestion = qIndex >= QUESTIONS.length - 1;
  const updates = {};
  updates[`rooms/${state.roomCode}/game/round1Totals`] = totals;
  updates[`rooms/${state.roomCode}/game/votes`] = {};
  if (!isLastQuestion) {
    updates[`rooms/${state.roomCode}/game/qIndex`] = qIndex + 1;
    await update(ref(db), updates);
    return;
  }
  const sorted = Object.entries(totals).sort((a, b) => b[1] - a[1]);
  const topCount = sorted[0]?.[1] ?? 0;
  const topIds = sorted.filter((x) => x[1] === topCount).map((x) => x[0]);
  const winnerId = topIds[Math.floor(Math.random() * topIds.length)];
  const winnerName = players.find((p) => p.id === winnerId)?.name || "Unknown";
  const roast = ROASTS[Math.floor(Math.random() * ROASTS.length)].replace("{name}", winnerName);
  const currentScore = room.players[winnerId]?.score || 0;
  updates[`rooms/${state.roomCode}/players/${winnerId}/score`] = currentScore - 1;
  updates[`rooms/${state.roomCode}/game/phase`] = "roast";
  updates[`rooms/${state.roomCode}/game/roastWinnerId`] = winnerId;
  updates[`rooms/${state.roomCode}/game/roastText`] = roast;
  await update(ref(db), updates);

  setTimeout(async () => {
    const latest = (await get(ref(db, `rooms/${state.roomCode}/game`))).val();
    if (latest?.phase === "roast" && state.isHost) {
      await update(ref(db, `rooms/${state.roomCode}/game`), { phase: "anonWrite" });
    }
  }, 3500);
}

function renderRoastPhase(room) {
  showScreen("roast");
  const winnerId = room.game.roastWinnerId;
  const winner = room.players?.[winnerId];
  el.roastTarget.textContent = winner?.name || "Mystery Human";
  el.roastMessage.textContent = room.game.roastText || "Silence is the roast.";
  el.roastSubtext.textContent = winner ? `${winner.name}, group therapy starts tomorrow.` : "No hard feelings, only hard laughs.";
}

function renderAnonWritePhase(room, players) {
  showScreen("anonWrite");
  const anon = room.game.anonMessages || {};
  const mine = anon[state.playerId];
  el.submitAnonBtn.disabled = Boolean(mine);
  el.anonMessageInput.disabled = Boolean(mine);
  if (mine) {
    el.anonSubmitStatus.textContent = "Message submitted. Waiting for others...";
  } else {
    el.anonSubmitStatus.textContent = `${Object.keys(anon).length}/${players.length} submitted`;
  }
  if (state.isHost && Object.keys(anon).length === players.length && players.length > 0) {
    moveToGuessPhase(room).catch(() => toast("Failed to start guessing."));
  }
}

async function submitAnonMessage() {
  const msg = (el.anonMessageInput.value || "").trim().slice(0, 140);
  if (msg.length < 6) return toast("At least 6 characters please.");
  await set(ref(db, `rooms/${state.roomCode}/game/anonMessages/${state.playerId}`), msg);
  el.anonMessageInput.value = "";
}

async function moveToGuessPhase(room) {
  const anon = room.game.anonMessages || {};
  const items = Object.entries(anon).map(([authorId, text]) => ({ authorId, text }));
  shuffle(items);
  const guessMap = {};
  items.forEach((m, idx) => {
    guessMap[idx] = { ...m, guesses: {} };
  });
  await update(ref(db, `rooms/${state.roomCode}/game`), {
    phase: "guess",
    guessIndex: 0,
    guesses: guessMap
  });
}

function renderGuessPhase(room, players) {
  showScreen("guess");
  const guessIndex = room.game.guessIndex || 0;
  const guesses = room.game.guesses || {};
  const keys = Object.keys(guesses);
  const total = keys.length;
  el.guessTotal.textContent = String(total || 1);
  el.guessIndex.textContent = String(Math.min(guessIndex + 1, Math.max(total, 1)));
  const current = guesses[guessIndex];
  if (!current) {
    if (state.isHost) {
      finishGame().catch(() => toast("Could not finish game."));
    }
    return;
  }
  el.guessMessage.textContent = current.text;
  const myGuess = current.guesses?.[state.playerId];
  const responses = Object.keys(current.guesses || {}).length;
  el.guessStatus.textContent = `${responses}/${players.length} guesses in`;
  el.guessOptions.innerHTML = "";
  players.forEach((p) => {
    const btn = document.createElement("button");
    btn.className = "btn btn-secondary";
    if (myGuess === p.id) btn.classList.add("pulse");
    btn.textContent = p.name;
    btn.disabled = Boolean(myGuess);
    btn.addEventListener("click", () => submitGuess(guessIndex, p.id));
    el.guessOptions.appendChild(btn);
  });
  if (state.isHost && responses === players.length && players.length > 0) {
    finalizeCurrentGuess(room, players, guessIndex).catch(() => toast("Guess round update failed."));
  }
}

async function submitGuess(index, targetId) {
  await set(ref(db, `rooms/${state.roomCode}/game/guesses/${index}/guesses/${state.playerId}`), targetId);
}

async function finalizeCurrentGuess(room, players, guessIndex) {
  const current = room.game.guesses?.[guessIndex];
  if (!current) return;
  const guessEntries = Object.entries(current.guesses || {});
  const updates = {};
  guessEntries.forEach(([guesserId, predictedId]) => {
    if (predictedId === current.authorId) {
      const oldScore = room.players?.[guesserId]?.score || 0;
      updates[`rooms/${state.roomCode}/players/${guesserId}/score`] = oldScore + 1;
    }
  });
  const allKeys = Object.keys(room.game.guesses || {});
  const isLast = guessIndex >= allKeys.length - 1;
  if (isLast) {
    updates[`rooms/${state.roomCode}/game/phase`] = "results";
  } else {
    updates[`rooms/${state.roomCode}/game/guessIndex`] = guessIndex + 1;
  }
  await update(ref(db), updates);
}

async function finishGame() {
  await update(ref(db, `rooms/${state.roomCode}/game`), { phase: "results" });
}

function renderResults(room, players) {
  showScreen("results");
  const sorted = [...players].sort((a, b) => (b.score || 0) - (a.score || 0));
  el.scoreboardList.innerHTML = "";
  sorted.forEach((p, idx) => {
    const row = document.createElement("div");
    row.className = "score-card";
    const medal = idx === 0 ? "🏆" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : "😎";
    row.innerHTML = `<span>${medal} ${escapeHtml(p.name)}</span><span>${p.score || 0} pts</span>`;
    el.scoreboardList.appendChild(row);
  });
}

async function onReplay() {
  if (!state.isHost) return toast("Only host can replay.");
  const room = state.roomData;
  if (!room?.players) return;
  const updates = {};
  Object.keys(room.players).forEach((pid) => {
    updates[`rooms/${state.roomCode}/players/${pid}/score`] = 0;
  });
  updates[`rooms/${state.roomCode}/game`] = {
    phase: "lobby",
    qIndex: 0,
    votes: {},
    round1Totals: {},
    roastWinnerId: "",
    roastText: "",
    anonMessages: {},
    guessIndex: 0,
    guesses: {}
  };
  await update(ref(db), updates);
}

async function leaveRoom() {
  if (!state.roomCode || !state.playerId) {
    hardResetLocal();
    showScreen("home");
    return;
  }
  const roomCode = state.roomCode;
  const myPath = ref(db, `rooms/${roomCode}/players/${state.playerId}`);
  await remove(myPath);
  const snap = await get(ref(db, `rooms/${roomCode}/players`));
  const players = snap.val() || {};
  const ids = Object.keys(players);
  if (!ids.length) {
    await remove(ref(db, `rooms/${roomCode}`));
  } else if (state.roomData?.hostId === state.playerId) {
    await update(ref(db, `rooms/${roomCode}`), { hostId: ids[0] });
  }
  hardResetLocal();
  showScreen("home");
}

function cleanupOnExit() {
  if (!state.roomCode || !state.playerId) return;
  remove(ref(db, `rooms/${state.roomCode}/players/${state.playerId}`));
}

function showScreen(name) {
  Object.entries(el.screens).forEach(([key, section]) => {
    section.classList.toggle("hidden", key !== name);
  });
  animateScreen(el.screens[name]);
}

function animateScreen(node) {
  if (!node || !window.gsap) return;
  window.gsap.fromTo(node, { y: 12, opacity: 0.55 }, { y: 0, opacity: 1, duration: 0.35, ease: "power2.out" });
}

function toast(msg) {
  el.toast.textContent = msg;
  el.toast.classList.remove("hidden");
  if (window.gsap) {
    window.gsap.fromTo(el.toast, { y: 12, opacity: 0 }, { y: 0, opacity: 1, duration: 0.2 });
  }
  setTimeout(() => el.toast.classList.add("hidden"), TOAST_MS);
}

function hardResetLocal() {
  if (state.unsubRoom) {
    off(state.unsubRoom.ref, "value", state.unsubRoom.handler);
  }
  state.roomCode = "";
  state.playerId = "";
  state.playerName = "";
  state.roomData = null;
  state.isHost = false;
  state.unsubRoom = null;
  el.roomInput.value = "";
  el.anonMessageInput.value = "";
  el.anonMessageInput.disabled = false;
}

function initialRoomPayload(roomCode, hostId, hostName) {
  return {
    roomCode,
    hostId,
    createdAt: serverTimestamp(),
    players: {
      [hostId]: {
        id: hostId,
        name: hostName,
        score: 0,
        joinedAt: Date.now()
      }
    },
    game: {
      phase: "lobby",
      qIndex: 0,
      votes: {},
      round1Totals: {},
      roastWinnerId: "",
      roastText: "",
      anonMessages: {},
      guessIndex: 0,
      guesses: {}
    }
  };
}

function byId(id) {
  return document.getElementById(id);
}

function sanitizeName(v) {
  return (v || "").trim().replace(/\s+/g, " ").slice(0, 18);
}

function sanitizeRoomCode(v) {
  return (v || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
}

function generateRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 6; i += 1) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
