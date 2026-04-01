import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getDatabase, ref, set, get, onValue, update, onDisconnect, remove } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js";

// FIREBASE CONFIG (Aapka diya hua)
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
let myName = "";
let room = "";
let isHost = false;
let roomRef = null;
let localState = null;
let currentScreen = 'screen-login';

// HINGLISH QUESTIONS
const questions = [
    "Sabse zyada phone pe kaun laga rehta hai bhai?",
    "Zombie attack hua toh sabse pehle kaun marega?",
    "Kaun bina nahaye 3 din tak maje se reh sakta hai?",
    "Kiski browser history check kari jaye toh woh jail jayega?",
    "Kaun sabse bada flirts hai par single hi marega?",
    "Group ka sabse bada kanjoos (makkhi-choos) kaun hai?",
    "Dieting ke naam pe sabse zyada junk food kaun khata hai?"
];

// --- UI UTILS ---
const getAvatar = (name) => `https://api.dicebear.com/8.x/bottts-neutral/svg?seed=${name}&backgroundColor=transparent`;

const showToast = (msg, type = 'error') => {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    const bg = type === 'success' ? 'bg-green-600' : 'bg-red-600';
    toast.className = `${bg} text-white px-5 py-3 rounded-xl shadow-2xl border border-white/20 text-sm font-bold transform transition-all duration-300 translate-y-[-20px] opacity-0 text-center`;
    toast.innerText = msg;
    container.appendChild(toast);
    
    setTimeout(() => toast.classList.remove('translate-y-[-20px]', 'opacity-0'), 10);
    setTimeout(() => {
        toast.classList.add('translate-y-[-20px]', 'opacity-0');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
};

const switchScreen = (newScreenId) => {
    if (currentScreen === newScreenId) return;
    const oldScreen = document.getElementById(currentScreen);
    const newScreen = document.getElementById(newScreenId);
    
    gsap.to(oldScreen, { opacity: 0, scale: 0.95, duration: 0.2, onComplete: () => {
        oldScreen.classList.add('hidden');
        newScreen.classList.remove('hidden');
        gsap.fromTo(newScreen, {opacity: 0, scale: 1.05}, {opacity: 1, scale: 1, duration: 0.3, ease: "back.out(1.5)"});
        currentScreen = newScreenId;
    }});
};

// --- CORE LOGIC (Bug Fixes applied here) ---

document.getElementById('btn-join').addEventListener('click', async () => {
    const nameInput = document.getElementById('playerName').value.trim();
    const roomInput = document.getElementById('roomCode').value.trim().toUpperCase();
    
    if (!nameInput || !roomInput) return showToast("Naam aur Room Code dono daalo!");
    if (nameInput.length > 12) return showToast("Bhai naam thoda chhota rakh!");

    // Capitalize first letter of name
    myName = nameInput.charAt(0).toUpperCase() + nameInput.slice(1);
    room = roomInput;
    roomRef = ref(db, `rooms/${room}`);

    const btn = document.getElementById('btn-join');
    btn.innerText = "Loading...";
    btn.disabled = true;

    try {
        const snap = await get(roomRef);
        
        // BUG FIX: Agar room exist nahi karta YA room mein 0 active players hain (Ghost room), toh naya banao
        if (!snap.exists() || !snap.val().players || Object.keys(snap.val().players).length === 0) {
            isHost = true;
            await set(roomRef, {
                state: 'lobby',
                host: myName,
                players: { [myName]: { score: 0, avatar: getAvatar(myName) } }
            });
            showToast("Naya Room Ban Gaya!", "success");
        } else {
            const data = snap.val();
            // Agar game chalu ho gaya hai, aur player pehle se nahi tha, toh block karo
            if (data.state !== 'lobby' && !data.players[myName]) {
                btn.innerText = "Ghuso Room Mein 🚀";
                btn.disabled = false;
                return showToast("Bhai, game already start ho chuka hai! (Room Full)");
            }
            // Agar sab theek hai toh join karo
            await update(ref(db, `rooms/${room}/players`), {
                [myName]: { score: data.players[myName]?.score || 0, avatar: getAvatar(myName) }
            });
            showToast("Room Join Kar Liya!", "success");
        }

        // ANTI-GHOSTING FIX: Jab tab close kare, player remove ho jaye
        const myPlayerRef = ref(db, `rooms/${room}/players/${myName}`);
        onDisconnect(myPlayerRef).remove();

        // Agar last banda nikla toh pura room auto-delete ho jayega
        const disconnectRoomRef = ref(db, `rooms/${room}`);
        onDisconnect(disconnectRoomRef).update({ checkCleanup: Date.now() });

        document.getElementById('display-room-code').innerText = room;
        listenToRoom();
        switchScreen('screen-lobby');

    } catch(err) {
        showToast("Error aa gaya connection mein.");
        btn.innerText = "Ghuso Room Mein 🚀";
        btn.disabled = false;
    }
});

function listenToRoom() {
    onValue(roomRef, (snapshot) => {
        localState = snapshot.val();
        
        // Agar host / saare players disconnect ho gaye toh auto-kick
        if (!localState || !localState.players || Object.keys(localState.players).length === 0) {
            showToast("Sab log bhag gaye! Room close ho gaya.");
            setTimeout(() => window.location.reload(), 2000);
            return;
        }

        // Make sure if my name was removed by host/glitch, I am booted
        if(!localState.players[myName]) {
            showToast("Aapko game se nikal diya gaya.");
            setTimeout(() => window.location.reload(), 1500);
            return;
        }

        const playersList = Object.keys(localState.players);
        const pCount = playersList.length;
        document.getElementById('player-count').innerText = pCount;

        // Sync UI with Firebase State
        switch(localState.state) {
            case 'lobby':
                document.getElementById('player-list').innerHTML = Object.entries(localState.players).map(([name, data]) => `
                    <li class="bg-slate-800/80 rounded-2xl p-3 flex items-center gap-3 border border-slate-700">
                        <img src="${data.avatar}" class="w-10 h-10 bg-slate-900 rounded-full">
                        <span class="font-bold truncate text-sm">${name} ${name===localState.host ? '👑' : ''}</span>
                    </li>
                `).join('');
                
                // Only host sees the start button
                if (myName === localState.host) {
                    document.getElementById('btn-start').classList.remove('hidden');
                    document.getElementById('wait-msg').classList.add('hidden');
                } else {
                    document.getElementById('btn-start').classList.add('hidden');
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
                    
                    playersList.forEach(p => {
                        if (p !== myName) {
                            const btn = document.createElement('button');
                            btn.className = "flex flex-col items-center gap-2 bg-slate-800 hover:bg-pink-600/20 border border-slate-700 hover:border-pink-500 p-4 rounded-2xl transition active:scale-95";
                            btn.innerHTML = `<img src="${getAvatar(p)}" class="w-14 h-14"><span class="font-bold text-sm">${p}</span>`;
                            btn.onclick = async () => {
                                btnContainer.style.pointerEvents = 'none';
                                btn.classList.add('bg-pink-600/40', 'border-pink-500');
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
                    document.getElementById('roast-victim').innerText = localState.roastVictim;
                    document.getElementById('roast-text').innerText = `"Bhai ne sabse zyada votes khaye hai 😂"`;
                    switchScreen('screen-roast');
                    
                    // Auto advance timer
                    gsap.fromTo("#roast-timer-bar", {width: "100%"}, {width: "0%", duration: 7, ease: "linear", onComplete: () => {
                        if(myName === localState.host) update(roomRef, { state: 'submit_msg', messages: null });
                    }});
                }
                break;

            case 'submit_msg':
                const mCount = Object.keys(localState.messages || {}).length;
                document.getElementById('submit-counter').innerText = `${mCount}/${pCount}`;
                
                if(currentScreen !== 'screen-submit') {
                    document.getElementById('anonymous-msg').value = '';
                    document.getElementById('anonymous-msg').disabled = false;
                    document.getElementById('btn-submit-msg').innerText = "Lock Kar Do 🔒";
                    document.getElementById('btn-submit-msg').disabled = false;
                    document.getElementById('submit-status').classList.add('hidden');
                    switchScreen('screen-submit');
                }
                break;

            case 'guess':
                const gCount = Object.keys(localState.guesses || {}).length;
                document.getElementById('guess-counter').innerText = `${gCount}/${pCount}`;
                document.getElementById('current-guess-msg').innerText = `"${localState.currentMsg}"`;

                if(currentScreen !== 'screen-guess' || localState.currentMsgIndex !== document.getElementById('screen-guess').dataset.index) {
                    document.getElementById('screen-guess').dataset.index = localState.currentMsgIndex;
                    const gContainer = document.getElementById('guess-buttons');
                    gContainer.innerHTML = '';
                    gContainer.style.pointerEvents = 'auto';

                    playersList.forEach(p => {
                        const btn = document.createElement('button');
                        btn.className = "bg-slate-800 hover:bg-cyan-600/30 border border-slate-700 hover:border-cyan-500 p-4 rounded-2xl font-bold transition active:scale-95";
                        btn.innerText = p;
                        btn.onclick = async () => {
                            gContainer.style.pointerEvents = 'none';
                            btn.classList.add('bg-cyan-600/50', 'border-cyan-500');
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
                    const sorted = Object.entries(localState.players).sort((a,b) => b[1].score - a[1].score);
                    document.getElementById('leaderboard-list').innerHTML = sorted.map(([name, data], i) => `
                        <li class="bg-slate-800/80 p-4 rounded-2xl flex items-center justify-between border ${i===0?'border-yellow-500 bg-yellow-500/10 shadow-[0_0_15px_rgba(234,179,8,0.2)]':'border-slate-700'}">
                            <div class="flex items-center gap-3">
                                <span class="text-2xl font-bold w-6 text-center">${i===0?'👑':(i+1)}</span>
                                <img src="${data.avatar}" class="w-12 h-12 bg-slate-900 rounded-full">
                                <span class="font-bold text-lg">${name}</span>
                            </div>
                            <span class="text-cyan-400 font-black text-2xl">${data.score}</span>
                        </li>
                    `).join('');

                    if(myName === localState.host) {
                        document.getElementById('btn-replay').classList.remove('hidden');
                        document.getElementById('replay-msg').classList.add('hidden');
                    } else {
                        document.getElementById('btn-replay').classList.add('hidden');
                        document.getElementById('replay-msg').classList.remove('hidden');
                    }
                    switchScreen('screen-leaderboard');
                }
                break;
        }
    });
}

// Decentralized logic
async function checkAdvancement(phase, pCount) {
    const snap = await get(roomRef);
    const data = snap.val();
    
    if (phase === 'vote') {
        const vCount = Object.keys(data.votes || {}).length;
        if (vCount === pCount) {
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
            let scoreUpdates = {};
            Object.entries(data.guesses).forEach(([guesser, guess]) => {
                if (guess === data.currentMsgAuthor && guesser !== data.currentMsgAuthor) {
                    scoreUpdates[`players/${guesser}/score`] = data.players[guesser].score + 10;
                }
            });
            await update(roomRef, scoreUpdates);

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

// Button Listeners
document.getElementById('btn-start').addEventListener('click', () => {
    if(Object.keys(localState.players).length < 2) return showToast("Kam se kam 2 log toh chahiye game ke liye!");
    const q = questions[Math.floor(Math.random() * questions.length)];
    update(roomRef, { state: 'vote', currentQuestion: q, votes: null, messages: null });
});

document.getElementById('btn-submit-msg').addEventListener('click', async () => {
    const msg = document.getElementById('anonymous-msg').value.trim();
    if(!msg) return showToast("Bhai kuch toh likh!");
    
    document.getElementById('anonymous-msg').disabled = true;
    document.getElementById('btn-submit-msg').innerText = "Submit Ho Gaya ✅";
    document.getElementById('btn-submit-msg').disabled = true;
    document.getElementById('submit-status').classList.remove('hidden');

    await update(ref(db, `rooms/${room}/messages`), { [myName]: msg });
    checkAdvancement('submit_msg', Object.keys(localState.players).length);
});

document.getElementById('btn-replay').addEventListener('click', () => {
    update(roomRef, { state: 'lobby', votes: null, messages: null, guesses: null });
});
