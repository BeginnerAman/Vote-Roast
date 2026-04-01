import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getDatabase, ref, set, get, onValue, update, remove } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js";

// 1. FIREBASE CONFIGURATION
const firebaseConfig = {
    apiKey: "AIzaSyBvk4riEC5qhNFNMA9O_rx-S1kAwrHzvbw",
    authDomain: "voteroast-57ecf.firebaseapp.com",
    projectId: "voteroast-57ecf",
    storageBucket: "voteroast-57ecf.firebasestorage.app",
    messagingSenderId: "654433059396",
    appId: "1:654433059396:web:8105dfa734d040ec4df211",
    databaseURL: "https://voteroast-57ecf-default-rtdb.firebaseio.com"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// Game Variables
let playerName = "";
let roomId = "";
let isHost = false;
let roomRef = null;
let roomData = null;

const roasts = [
    "Even a sloth looks at them and says 'bhai thoda toh hile le'.",
    "Their screen time is higher than their bank balance.",
    "Will cancel plans just to stare at the ceiling.",
    "Certified couch potato. Do not disturb."
];

// DOM Elements
const screens = document.querySelectorAll('.screen');
const switchScreen = (screenId) => {
    screens.forEach(s => {
        if (!s.classList.contains('hidden')) {
            gsap.to(s, { opacity: 0, y: -20, duration: 0.3, onComplete: () => {
                s.classList.add('hidden');
                const next = document.getElementById(screenId);
                next.classList.remove('hidden');
                gsap.fromTo(next, {opacity: 0, y: 20}, {opacity: 1, y: 0, duration: 0.4});
            }});
        }
    });
};

const triggerEmojis = (emojiType = '😂') => {
    const container = document.getElementById('emoji-container');
    for(let i=0; i<15; i++) {
        const emoji = document.createElement('div');
        emoji.className = 'floating-emoji';
        emoji.innerText = emojiType;
        emoji.style.left = Math.random() * 100 + 'vw';
        emoji.style.top = (Math.random() * 20 + 80) + 'vh'; // start near bottom
        container.appendChild(emoji);
        setTimeout(() => emoji.remove(), 3000);
    }
};

// ================= FLOW LOGIC =================

// JOIN ROOM
document.getElementById('btn-join').addEventListener('click', async () => {
    playerName = document.getElementById('playerName').value.trim();
    roomId = document.getElementById('roomCode').value.trim().toUpperCase();
    
    if (!playerName || !roomId) return alert("Enter Name and Room Code!");

    roomRef = ref(db, `rooms/${roomId}`);
    const snapshot = await get(roomRef);
    
    if (!snapshot.exists()) {
        // Create Room - Become Host
        isHost = true;
        await set(roomRef, {
            state: 'lobby',
            players: { [playerName]: { score: 0 } }
        });
        document.getElementById('btn-start').classList.remove('hidden');
    } else {
        // Join existing
        if(snapshot.val().state !== 'lobby') return alert("Game already in progress!");
        await update(ref(db, `rooms/${roomId}/players`), {
            [playerName]: { score: 0 }
        });
    }

    document.getElementById('display-room-code').innerText = roomId;
    listenToRoom();
    switchScreen('screen-lobby');
});

// LISTEN TO REALTIME CHANGES
function listenToRoom() {
    onValue(roomRef, (snapshot) => {
        roomData = snapshot.val();
        if (!roomData) return; // Room deleted

        updateLobbyUI();

        // State Machine
        if (roomData.state === 'vote' && document.getElementById('screen-vote').classList.contains('hidden')) {
            setupVoteScreen();
            switchScreen('screen-vote');
        } else if (roomData.state === 'roast' && document.getElementById('screen-roast').classList.contains('hidden')) {
            showRoastScreen();
            switchScreen('screen-roast');
        } else if (roomData.state === 'submit_msg' && document.getElementById('screen-submit').classList.contains('hidden')) {
            switchScreen('screen-submit');
        } else if (roomData.state === 'guess' && document.getElementById('screen-guess').classList.contains('hidden')) {
            setupGuessScreen();
            switchScreen('screen-guess');
        } else if (roomData.state === 'leaderboard' && document.getElementById('screen-leaderboard').classList.contains('hidden')) {
            showLeaderboard();
            switchScreen('screen-leaderboard');
        }
    });
}

function updateLobbyUI() {
    if(!roomData.players) return;
    const players = Object.keys(roomData.players);
    document.getElementById('player-count').innerText = players.length;
    document.getElementById('player-list').innerHTML = players.map(p => 
        `<li class="bg-black/30 p-2 rounded-lg flex justify-between"><span>${p}</span> ${p === playerName ? '(You)' : ''}</li>`
    ).join('');
}

// HOST: START GAME
document.getElementById('btn-start').addEventListener('click', () => {
    if(Object.keys(roomData.players).length < 2) return alert("Need at least 2 players!");
    update(roomRef, { state: 'vote', votes: null, messages: null, guesses: null, currentMsgIndex: 0 });
});

// VOTE LOGIC
function setupVoteScreen() {
    document.getElementById('vote-status').classList.add('hidden');
    const container = document.getElementById('vote-buttons');
    container.innerHTML = '';
    
    Object.keys(roomData.players).forEach(p => {
        if(p !== playerName) {
            const btn = document.createElement('button');
            btn.className = "w-full bg-black/40 hover:bg-pink-500/50 border border-pink-500/30 font-semibold py-3 rounded-xl transition";
            btn.innerText = p;
            btn.onclick = async () => {
                btn.classList.add('bg-pink-500', 'text-white');
                container.style.pointerEvents = 'none';
                document.getElementById('vote-status').classList.remove('hidden');
                await update(ref(db, `rooms/${roomId}/votes`), { [playerName]: p });
                checkAllVotes();
            };
            container.appendChild(btn);
        }
    });
}

async function checkAllVotes() {
    if(!isHost) return; // Only host checks and moves state
    const snapshot = await get(roomRef);
    const data = snapshot.val();
    const playerCount = Object.keys(data.players).length;
    const voteCount = data.votes ? Object.keys(data.votes).length : 0;
    
    if(voteCount === playerCount) {
        // Calculate victim
        const counts = {};
        Object.values(data.votes).forEach(v => counts[v] = (counts[v] || 0) + 1);
        const victim = Object.keys(counts).reduce((a, b) => counts[a] > counts[b] ? a : b);
        
        await update(roomRef, { 
            state: 'roast', 
            roastVictim: victim, 
            roastText: roasts[Math.floor(Math.random() * roasts.length)]
        });

        // Move to Round 2 after 7 seconds
        setTimeout(() => {
            update(roomRef, { state: 'submit_msg' });
        }, 7000);
    }
}

function showRoastScreen() {
    triggerEmojis('🔥');
    document.getElementById('roast-victim').innerText = roomData.roastVictim;
    document.getElementById('roast-text').innerText = `"${roomData.roastText}"`;
}

// SUBMIT MESSAGE LOGIC
document.getElementById('btn-submit-msg').addEventListener('click', async () => {
    const msg = document.getElementById('anonymous-msg').value.trim();
    if(!msg) return;
    
    document.getElementById('anonymous-msg').disabled = true;
    document.getElementById('btn-submit-msg').innerText = "Submitted!";
    document.getElementById('btn-submit-msg').disabled = true;

    await update(ref(db, `rooms/${roomId}/messages`), { [playerName]: msg });
    checkAllMessages();
});

async function checkAllMessages() {
    if(!isHost) return;
    const snapshot = await get(roomRef);
    const data = snapshot.val();
    const playerCount = Object.keys(data.players).length;
    const msgCount = data.messages ? Object.keys(data.messages).length : 0;
    
    if(msgCount === playerCount) {
        // Shuffle authors to pick the first message to guess
        const authors = Object.keys(data.messages);
        await update(roomRef, { state: 'guess', targetAuthor: authors[0] });
    }
}

// GUESS LOGIC
function setupGuessScreen() {
    document.getElementById('guess-status').classList.add('hidden');
    document.getElementById('current-guess-msg').innerText = `"${roomData.messages[roomData.targetAuthor]}"`;
    
    const container = document.getElementById('guess-buttons');
    container.innerHTML = '';
    container.style.pointerEvents = 'auto';

    Object.keys(roomData.players).forEach(p => {
        const btn = document.createElement('button');
        btn.className = "bg-black/40 hover:bg-blue-500/50 border border-blue-500/30 py-2 rounded-lg transition";
        btn.innerText = p;
        btn.onclick = async () => {
            container.style.pointerEvents = 'none';
            btn.classList.add('bg-blue-500');
            document.getElementById('guess-status').classList.remove('hidden');
            await update(ref(db, `rooms/${roomId}/guesses`), { [playerName]: p });
            checkAllGuesses();
        };
        container.appendChild(btn);
    });
}

async function checkAllGuesses() {
    if(!isHost) return;
    const snapshot = await get(roomRef);
    const data = snapshot.val();
    const playerCount = Object.keys(data.players).length;
    const guessCount = data.guesses ? Object.keys(data.guesses).length : 0;

    if(guessCount === playerCount) {
        // Calculate scores
        let updates = {};
        Object.entries(data.guesses).forEach(([guesser, guess]) => {
            if(guess === data.targetAuthor && guesser !== data.targetAuthor) {
                updates[`players/${guesser}/score`] = data.players[guesser].score + 10;
            }
        });
        
        await update(roomRef, { ...updates, state: 'leaderboard' });
    }
}

// LEADERBOARD LOGIC
function showLeaderboard() {
    triggerEmojis('🎉');
    const list = document.getElementById('leaderboard-list');
    
    // Sort players by score
    const sortedPlayers = Object.entries(roomData.players).sort((a, b) => b[1].score - a[1].score);
    
    list.innerHTML = sortedPlayers.map(([name, data], i) => `
        <li class="bg-black/30 p-4 rounded-xl flex justify-between items-center ${i===0 ? 'border-2 border-yellow-400' : ''}">
            <span class="font-bold text-lg">${i===0?'👑 ':''}${name}</span>
            <span class="text-pink-400 font-bold">${data.score} pts</span>
        </li>
    `).join('');

    if(isHost) {
        document.getElementById('btn-replay').classList.remove('hidden');
    }
}

document.getElementById('btn-replay').addEventListener('click', () => {
    update(roomRef, { state: 'lobby', votes: null, messages: null, guesses: null });
    // Reset local inputs
    document.getElementById('anonymous-msg').value = '';
    document.getElementById('anonymous-msg').disabled = false;
    document.getElementById('btn-submit-msg').innerText = "Send Anonymously";
    document.getElementById('btn-submit-msg').disabled = false;
});
