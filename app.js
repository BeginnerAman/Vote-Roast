import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getDatabase, ref, set, get, onValue, update, remove, onDisconnect } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js";

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

// Game State
let myName = "";
let room = "";
let isHost = false;
let roomRef = null;
let localState = null;
let currentScreen = 'screen-login';

const questions = [
    "Who is most likely to survive a zombie apocalypse by hiding?",
    "Who definitely has the weirdest search history?",
    "If we were all in a horror movie, who dies first?",
    "Who is the most chronically online person here?"
];

// --- UTILS ---
const getAvatar = (name) => `https://api.dicebear.com/8.x/bottts-neutral/svg?seed=${name}&backgroundColor=transparent`;

const showToast = (msg) => {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = "bg-red-500/90 text-white px-4 py-2 rounded-lg shadow-lg backdrop-blur-sm text-sm font-bold transform transition-all duration-300 translate-y-[-20px] opacity-0";
    toast.innerText = msg;
    container.appendChild(toast);
    
    // Animate In
    setTimeout(() => { toast.classList.remove('translate-y-[-20px]', 'opacity-0'); }, 10);
    // Animate Out
    setTimeout(() => {
        toast.classList.add('translate-y-[-20px]', 'opacity-0');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
};

const switchScreen = (newScreenId) => {
    if (currentScreen === newScreenId) return;
    const oldScreen = document.getElementById(currentScreen);
    const newScreen = document.getElementById(newScreenId);
    
    gsap.to(oldScreen, { opacity: 0, y: -20, duration: 0.2, onComplete: () => {
        oldScreen.classList.add('hidden');
        newScreen.classList.remove('hidden');
        gsap.fromTo(newScreen, {opacity: 0, y: 20}, {opacity: 1, y: 0, duration: 0.3});
        currentScreen = newScreenId;
    }});
};

const triggerEmojis = (emoji) => {
    for(let i=0; i<20; i++) {
        const el = document.createElement('div');
        el.className = 'floating-emoji';
        el.innerText = emoji;
        el.style.left = Math.random() * 100 + 'vw';
        el.style.top = '100vh';
        document.body.appendChild(el);
        
        gsap.to(el, {
            y: -(window.innerHeight + 100),
            x: (Math.random() - 0.5) * 200,
            rotation: Math.random() * 360,
            duration: Math.random() * 2 + 2,
            ease: "power1.out",
            onComplete: () => el.remove()
        });
    }
};

// --- CORE LOGIC ---

document.getElementById('btn-join').addEventListener('click', async () => {
    myName = document.getElementById('playerName').value.trim();
    room = document.getElementById('roomCode').value.trim().toUpperCase();
    
    if (!myName || !room) return showToast("Enter Name and Room Code!");
    if (myName.length > 12) return showToast("Name too long!");

    roomRef = ref(db, `rooms/${room}`);
    const snap = await get(roomRef);
    
    if (!snap.exists()) {
        isHost = true;
        await set(roomRef, {
            state: 'lobby',
            host: myName,
            players: { [myName]: { score: 0, avatar: getAvatar(myName) } }
        });
    } else {
        const data = snap.val();
        if (data.state !== 'lobby' && !data.players[myName]) {
            return showToast("Game already started!");
        }
        await update(ref(db, `rooms/${room}/players`), {
            [myName]: { score: data.players[myName]?.score || 0, avatar: getAvatar(myName) }
        });
    }

    // Handle Disconnect (Anti-Ghosting)
    const myPlayerRef = ref(db, `rooms/${room}/players/${myName}`);
    onDisconnect(myPlayerRef).remove();

    document.getElementById('display-room-code').innerText = room;
    listenToRoom();
    switchScreen('screen-lobby');
});

function listenToRoom() {
    onValue(roomRef, (snapshot) => {
        localState = snapshot.val();
        if (!localState) {
            showToast("Room closed!");
            setTimeout(() => window.location.reload(), 2000);
            return;
        }

        const players = Object.keys(localState.players || {});
        const pCount = players.length;

        // UI Updates based on state
        switch(localState.state) {
            case 'lobby':
                document.getElementById('player-list').innerHTML = Object.entries(localState.players).map(([name, data]) => `
                    <li class="bg-white/5 rounded-lg p-3 flex items-center gap-3 border border-white/10">
                        <img src="${data.avatar}" class="w-10 h-10 bg-white/20 rounded-full">
                        <span class="font-bold truncate">${name}</span>
                    </li>
                `).join('');
                
                if (isHost) {
                    document.getElementById('btn-start').classList.remove('hidden');
                    document.getElementById('wait-msg').classList.add('hidden');
                } else {
                    document.getElementById('wait-msg').classList.remove('hidden');
                }
                switchScreen('screen-lobby');
                break;

            case 'vote':
                document.getElementById('vote-question').innerText = localState.currentQuestion;
                const vCount = Object.keys(localState.votes || {}).length;
                document.getElementById('vote-counter').innerText = `${vCount}/${pCount}`;
                
                if(currentScreen !== 'screen-vote') {
                    const btnContainer = document.getElementById('vote-buttons');
                    btnContainer.innerHTML = '';
                    btnContainer.style.pointerEvents = 'auto';
                    
                    players.forEach(p => {
                        if (p !== myName) {
                            const btn = document.createElement('button');
                            btn.className = "flex flex-col items-center gap-2 bg-white/5 hover:bg-cyan-500/20 border border-white/10 hover:border-cyan-500 p-4 rounded-xl transition";
                            btn.innerHTML = `<img src="${getAvatar(p)}" class="w-12 h-12"><span class="font-bold">${p}</span>`;
                            btn.onclick = async () => {
                                btnContainer.style.pointerEvents = 'none';
                                btn.classList.add('bg-cyan-500/50', 'border-cyan-500');
                                await update(ref(db, `rooms/${room}/votes`), { [myName]: p });
                                checkAdvancement('vote', pCount);
                            };
                            btnContainer.appendChild(btn);
                        }
                    });
                    switchScreen('screen-vote');
                }
                break;

            case 'roast':
                if(currentScreen !== 'screen-roast') {
                    triggerEmojis('🔥');
                    document.getElementById('roast-victim').innerText = localState.roastVictim;
                    document.getElementById('roast-text').innerText = `"Highest voted... exposed."`;
                    switchScreen('screen-roast');
                    
                    // Auto advance timer
                    gsap.fromTo("#roast-timer-bar", {width: "100%"}, {width: "0%", duration: 6, ease: "linear", onComplete: () => {
                        if(isHost) update(roomRef, { state: 'submit_msg', messages: null });
                    }});
                }
                break;

            case 'submit_msg':
                const mCount = Object.keys(localState.messages || {}).length;
                document.getElementById('submit-counter').innerText = `${mCount}/${pCount}`;
                
                if(currentScreen !== 'screen-submit') {
                    document.getElementById('anonymous-msg').value = '';
                    document.getElementById('anonymous-msg').disabled = false;
                    document.getElementById('btn-submit-msg').innerText = "Lock It In";
                    document.getElementById('btn-submit-msg').disabled = false;
                    document.getElementById('submit-status').classList.add('hidden');
                    switchScreen('screen-submit');
                }
                break;

            case 'guess':
                const gCount = Object.keys(localState.guesses || {}).length;
                document.getElementById('guess-counter').innerText = `${gCount}/${pCount}`;
                document.getElementById('current-guess-msg').innerText = localState.currentMsg;

                if(currentScreen !== 'screen-guess' || localState.currentMsgIndex !== document.getElementById('screen-guess').dataset.index) {
                    document.getElementById('screen-guess').dataset.index = localState.currentMsgIndex;
                    const gContainer = document.getElementById('guess-buttons');
                    gContainer.innerHTML = '';
                    gContainer.style.pointerEvents = 'auto';

                    players.forEach(p => {
                        const btn = document.createElement('button');
                        btn.className = "bg-white/5 hover:bg-purple-500/30 border border-white/10 p-3 rounded-lg font-bold transition";
                        btn.innerText = p;
                        btn.onclick = async () => {
                            gContainer.style.pointerEvents = 'none';
                            btn.classList.add('bg-purple-500/50');
                            await update(ref(db, `rooms/${room}/guesses`), { [myName]: p });
                            checkAdvancement('guess', pCount);
                        };
                        gContainer.appendChild(btn);
                    });
                    switchScreen('screen-guess');
                }
                break;

            case 'leaderboard':
                if(currentScreen !== 'screen-leaderboard') {
                    triggerEmojis('🎉');
                    const sorted = Object.entries(localState.players).sort((a,b) => b[1].score - a[1].score);
                    document.getElementById('leaderboard-list').innerHTML = sorted.map(([name, data], i) => `
                        <li class="bg-white/10 p-4 rounded-xl flex items-center justify-between ${i===0?'border-2 border-yellow-400':''}">
                            <div class="flex items-center gap-3">
                                <span class="text-2xl">${i===0?'👑':(i+1)}</span>
                                <img src="${data.avatar}" class="w-10 h-10">
                                <span class="font-bold text-lg">${name}</span>
                            </div>
                            <span class="text-cyan-400 font-black text-xl">${data.score} pts</span>
                        </li>
                    `).join('');

                    if(isHost) {
                        document.getElementById('btn-replay').classList.remove('hidden');
                        document.getElementById('replay-msg').classList.add('hidden');
                    } else {
                        document.getElementById('replay-msg').classList.remove('hidden');
                    }
                    switchScreen('screen-leaderboard');
                }
                break;
        }
    });
}

// --- DECENTRALIZED ADVANCEMENT ---
// Anyone who completes an action checks if they were the last one.
// If yes, THEY trigger the next state. No host bottleneck.

async function checkAdvancement(phase, pCount) {
    const snap = await get(roomRef);
    const data = snap.val();
    
    if (phase === 'vote') {
        const vCount = Object.keys(data.votes || {}).length;
        if (vCount === pCount) {
            // Calculate victim
            const counts = {};
            Object.values(data.votes).forEach(v => counts[v] = (counts[v] || 0) + 1);
            const victim = Object.keys(counts).reduce((a, b) => counts[a] > counts[b] ? a : b);
            await update(roomRef, { state: 'roast', roastVictim: victim });
        }
    } 
    else if (phase === 'submit_msg') {
        const mCount = Object.keys(data.messages || {}).length;
        if (mCount === pCount) {
            const authors = Object.keys(data.messages);
            await update(roomRef, { 
                state: 'guess', 
                currentMsgIndex: 0, 
                msgQueue: authors,
                currentMsgAuthor: authors[0],
                currentMsg: data.messages[authors[0]],
                guesses: null
            });
        }
    }
    else if (phase === 'guess') {
        const gCount = Object.keys(data.guesses || {}).length;
        if (gCount === pCount) {
            // Score Calc
            let scoreUpdates = {};
            Object.entries(data.guesses).forEach(([guesser, guess]) => {
                if (guess === data.currentMsgAuthor && guesser !== data.currentMsgAuthor) {
                    scoreUpdates[`players/${guesser}/score`] = data.players[guesser].score + 10;
                }
            });
            await update(roomRef, scoreUpdates);

            // Next Msg or Leaderboard
            const nextIdx = data.currentMsgIndex + 1;
            if (nextIdx < data.msgQueue.length) {
                const nextAuthor = data.msgQueue[nextIdx];
                await update(roomRef, {
                    currentMsgIndex: nextIdx,
                    currentMsgAuthor: nextAuthor,
                    currentMsg: data.messages[nextAuthor],
                    guesses: null
                });
            } else {
                await update(roomRef, { state: 'leaderboard' });
            }
        }
    }
}

// --- BUTTON BINDS ---
document.getElementById('btn-start').addEventListener('click', () => {
    if(Object.keys(localState.players).length < 2) return showToast("Need at least 2 players!");
    const q = questions[Math.floor(Math.random() * questions.length)];
    update(roomRef, { state: 'vote', currentQuestion: q, votes: null, messages: null });
});

document.getElementById('btn-submit-msg').addEventListener('click', async () => {
    const msg = document.getElementById('anonymous-msg').value.trim();
    if(!msg) return showToast("Write something first!");
    
    document.getElementById('anonymous-msg').disabled = true;
    document.getElementById('btn-submit-msg').innerText = "Submitted!";
    document.getElementById('btn-submit-msg').disabled = true;
    document.getElementById('submit-status').classList.remove('hidden');

    await update(ref(db, `rooms/${room}/messages`), { [myName]: msg });
    checkAdvancement('submit_msg', Object.keys(localState.players).length);
});

document.getElementById('btn-replay').addEventListener('click', () => {
    update(roomRef, { state: 'lobby', votes: null, messages: null, guesses: null });
});
