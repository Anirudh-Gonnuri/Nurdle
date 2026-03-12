(function () {
  'use strict';

  // ================================================================
  //  FIREBASE CONFIG — FILL THIS IN FOR BATTLE MODE
  //
  //  See setup instructions at the bottom of this file.
  //  Daily and Practice modes work without Firebase.
  // ================================================================
  var FIREBASE_CONFIG = {
    apiKey: "AIzaSyAwWzu1S6Uj4xpxCR0IQAv92kBI3xUgL5U",
    authDomain: "nurdle-aa83c.firebaseapp.com",
    databaseURL: "https://nurdle-aa83c-default-rtdb.firebaseio.com",
    projectId: "nurdle-aa83c",
    storageBucket: "nurdle-aa83c.firebasestorage.app",
    messagingSenderId: "838521593900",
    appId: "1:838521593900:web:73ca45a9fa24dd3e0b7189"
  };

  // ================================================================
  //  CONSTANTS
  // ================================================================
  var MAX_GUESSES = 6;
  var NUM_DIGITS = 3;
  // The game starts counting days from this date (Day 1 is the day AFTER this date)
  var EPOCH = new Date(2026, 2, 11); // March 11, 2026 (Month is 0-indexed)

  // ================================================================
  //  GAME STATE
  // ================================================================
  var game = {};
  var battleResultShown = false;

  var battle = {
    active: false,
    roomCode: null,
    mySlot: null,
    oppSlot: null,
    playerId: getPlayerId(),
    oppGuesses: 0,
    oppSolved: false,
    oppDone: false,
    roomRef: null
  };

  var firebaseReady = false;

  // ================================================================
  //  DOM REFERENCES
  // ================================================================
  var dom = {
    board: document.getElementById('board'),
    keypad: document.getElementById('keypad'),
    toasts: document.getElementById('toast-container'),
    confetti: document.getElementById('confetti'),
    overlay: document.getElementById('overlay'),
    modal: document.getElementById('modal'),
    puzzleNum: document.getElementById('puzzleNum'),
    helpBtn: document.getElementById('helpBtn'),
    statsBtn: document.getElementById('statsBtn'),
    dailyBtn: document.getElementById('dailyBtn'),
    practiceBtn: document.getElementById('practiceBtn'),
    battleBtn: document.getElementById('battleBtn'),
    battleLobby: document.getElementById('battle-lobby'),
    battleWaiting: document.getElementById('battle-waiting'),
    battleCountdown: document.getElementById('battle-countdown'),
    battleTracker: document.getElementById('battle-tracker'),
    keypadContainer: document.getElementById('keypad-container'),
    createRoomBtn: document.getElementById('createRoomBtn'),
    joinRoomBtn: document.getElementById('joinRoomBtn'),
    roomCodeInput: document.getElementById('roomCodeInput'),
    roomCodeDisplay: document.getElementById('roomCodeDisplay'),
    copyCodeBtn: document.getElementById('copyCodeBtn'),
    cancelRoomBtn: document.getElementById('cancelRoomBtn'),
    countdownBig: document.getElementById('countdownBig'),
    myProgress: document.getElementById('myProgress'),
    oppProgress: document.getElementById('oppProgress')
  };

  // ================================================================
  //  SEEDED RANDOM
  // ================================================================
  function mulberry32(seed) {
    return function () {
      seed |= 0;
      seed = (seed + 0x6d2b79f5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function getPuzzleNumber() {
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.floor((today - EPOCH) / 86400000);
  }

  function generateSecret(seed) {
    var rng = mulberry32(seed * 31 + 7919);
    var pool = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    var result = [];
    for (var i = 0; i < NUM_DIGITS; i++) {
      var idx = Math.floor(rng() * pool.length);
      result.push(pool[idx]);
      pool.splice(idx, 1);
    }
    return result;
  }

  function randomSecret() {
    var pool = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    var result = [];
    for (var i = 0; i < NUM_DIGITS; i++) {
      var idx = Math.floor(Math.random() * pool.length);
      result.push(pool[idx]);
      pool.splice(idx, 1);
    }
    return result;
  }

  // ================================================================
  //  GAME LOGIC
  // ================================================================
  function checkGuess(guess, secret) {
    var correct = 0, wrongPos = 0;
    var s = secret.slice(), g = guess.slice();
    var i;
    for (i = 0; i < NUM_DIGITS; i++) {
      if (g[i] === s[i]) { correct++; s[i] = -1; g[i] = -2; }
    }
    for (i = 0; i < NUM_DIGITS; i++) {
      if (g[i] >= 0) {
        var idx = s.indexOf(g[i]);
        if (idx !== -1) { wrongPos++; s[idx] = -1; }
      }
    }
    return { correct: correct, wrongPos: wrongPos, absent: NUM_DIGITS - correct - wrongPos };
  }

  // ================================================================
  //  PLAYER ID
  // ================================================================
  function getPlayerId() {
    var id = localStorage.getItem('nurdle_pid');
    if (!id) {
      id = Math.random().toString(36).substr(2, 12);
      localStorage.setItem('nurdle_pid', id);
    }
    return id;
  }

  // ================================================================
  //  VIEW MANAGEMENT
  // ================================================================
  function showView(view) {
    dom.board.classList.toggle('hidden', view !== 'game');
    dom.battleLobby.classList.toggle('hidden', view !== 'lobby');
    dom.battleWaiting.classList.toggle('hidden', view !== 'waiting');
    dom.battleCountdown.classList.toggle('hidden', view !== 'countdown');
    dom.keypadContainer.classList.toggle('hidden', view !== 'game');
    dom.battleTracker.classList.toggle('hidden', !(view === 'game' && battle.active));
  }

  function updateModeButtons(mode) {
    document.querySelectorAll('.mode-btn').forEach(function (b) {
      b.classList.toggle('active', b.dataset.mode === mode);
    });
  }

  // ================================================================
  //  GAME INIT
  // ================================================================
  function newGame(mode) {
    var puzzleNum = getPuzzleNumber();
    game = {
      mode: mode,
      puzzleNum: puzzleNum,
      secret: mode === 'daily' ? generateSecret(puzzleNum) : randomSecret(),
      guesses: [],
      currentGuess: [],
      currentRow: 0,
      gameOver: false,
      won: false,
      keyStates: {},
      startTime: Date.now()
    };
    for (var i = 0; i <= 9; i++) game.keyStates[i] = 'default';

    if (mode === 'daily') {
      var saved = loadDaily();
      if (saved && saved.puzzleNum === puzzleNum) {
        Object.assign(game, saved);
        showView('game');
        updateModeButtons('daily');
        renderAll();
        if (game.gameOver) setTimeout(showResult, 600);
        return;
      }
    }

    showView('game');
    updateModeButtons(mode);
    renderAll();
  }

  // ================================================================
  //  INPUT
  // ================================================================
  function inputDigit(d) {
    if (game.gameOver || game.currentGuess.length >= NUM_DIGITS) return;
    game.currentGuess.push(d);
    renderCurrentRow();
    var cell = getCellEl(game.currentRow, game.currentGuess.length - 1);
    if (cell) {
      cell.classList.remove('filled');
      void cell.offsetWidth;
      cell.classList.add('filled');
    }
  }

  function deleteDigit() {
    if (game.gameOver || game.currentGuess.length === 0) return;
    game.currentGuess.pop();
    renderCurrentRow();
  }

  function submitGuess() {
    if (game.gameOver) return;
    if (game.currentGuess.length < NUM_DIGITS) {
      shakeRow(game.currentRow);
      showToast('Enter ' + NUM_DIGITS + ' digits');
      return;
    }

    var unique = [];
    for (var u = 0; u < game.currentGuess.length; u++) {
      if (unique.indexOf(game.currentGuess[u]) !== -1) {
        shakeRow(game.currentRow);
        showToast('No duplicate digits');
        return;
      }
      unique.push(game.currentGuess[u]);
    }

    var guess = game.currentGuess.slice();
    var result = checkGuess(guess, game.secret);
    var entry = { digits: guess, correct: result.correct, wrongPos: result.wrongPos };
    game.guesses.push(entry);

    if (result.correct === 0 && result.wrongPos === 0) {
      guess.forEach(function (d) {
        if (game.keyStates[d] === 'default') game.keyStates[d] = 'absent';
      });
    }

    var row = game.currentRow;
    game.currentRow++;
    game.currentGuess = [];

    renderSubmittedRow(row, entry);
    animateFeedback(row, result, function () {
      var isBattle = game.mode === 'battle' && battle.active;

      if (result.correct === NUM_DIGITS) {
        game.won = true;
        game.gameOver = true;
        celebrateWin(row);

        if (isBattle) {
          syncBattleProgress();
          renderBattleTracker();
        } else {
          updateStats(true, game.guesses.length);
          if (game.mode === 'daily') saveDaily();
          setTimeout(showResult, 1800);
        }
      } else if (game.currentRow >= MAX_GUESSES) {
        game.gameOver = true;

        if (isBattle) {
          syncBattleProgress();
          renderBattleTracker();
          if (battle.oppDone) {
            endBattle(battle.oppSolved ? 'lose' : 'draw');
          }
        } else {
          updateStats(false, game.guesses.length);
          if (game.mode === 'daily') saveDaily();
          setTimeout(showResult, 1000);
        }
      } else {
        if (isBattle) {
          syncBattleProgress();
          renderBattleTracker();
        }
        renderCurrentRow();
        if (game.mode === 'daily') saveDaily();
      }
      renderKeypad();
    });
  }

  function toggleEliminate(d) {
    if (game.gameOver) return;
    if (game.keyStates[d] === 'eliminated') {
      game.keyStates[d] = 'default';
    } else if (game.keyStates[d] === 'default') {
      game.keyStates[d] = 'eliminated';
    }
    renderKeypad();
    if (navigator.vibrate) navigator.vibrate(30);
  }

  // ================================================================
  //  FIREBASE & BATTLE
  // ================================================================
  function isFirebaseConfigured() {
    return FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.apiKey.length > 5;
  }

  function initFirebase() {
    if (firebaseReady) return true;
    if (!isFirebaseConfigured()) return false;
    try {
      if (!firebase.apps.length) {
        firebase.initializeApp(FIREBASE_CONFIG);
      }
      firebaseReady = true;
      return true;
    } catch (e) {
      console.error('Firebase init error:', e);
      return false;
    }
  }

  function generateRoomCode() {
    var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    var code = '';
    for (var i = 0; i < 5; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
  }

  function showBattleLobby() {
    updateModeButtons('battle');
    dom.roomCodeInput.value = '';
    showView('lobby');
  }

  function createRoom() {
    if (!initFirebase()) {
      showFirebaseSetup();
      return;
    }

    var code = generateRoomCode();
    var secret = randomSecret();
    var ref = firebase.database().ref('rooms/' + code);

    ref.set({
      secret: secret,
      status: 'waiting',
      createdAt: firebase.database.ServerValue.TIMESTAMP,
      p1: { id: battle.playerId, guesses: 0, done: false, solved: false },
      p2: null,
      winner: null
    }).then(function () {
      battle.roomCode = code;
      battle.mySlot = 'p1';
      battle.oppSlot = 'p2';
      battle.roomRef = ref;

      dom.roomCodeDisplay.textContent = code;
      showView('waiting');

      ref.child('p1').onDisconnect().update({ disconnected: true });
      listenForOpponentJoin();
    }).catch(function (err) {
      showToast('Failed to create room');
      console.error(err);
    });
  }

  function joinRoom() {
    if (!initFirebase()) {
      showFirebaseSetup();
      return;
    }

    var code = dom.roomCodeInput.value.trim().toUpperCase();
    if (code.length < 4) {
      showToast('Enter a valid room code');
      return;
    }

    var ref = firebase.database().ref('rooms/' + code);
    ref.once('value').then(function (snap) {
      var room = snap.val();
      if (!room) { showToast('Room not found'); return; }
      if (room.status !== 'waiting') { showToast('Room already started'); return; }
      if (room.p1 && room.p1.id === battle.playerId) { showToast('Cannot join your own room'); return; }

      ref.update({
        status: 'playing',
        p2: { id: battle.playerId, guesses: 0, done: false, solved: false }
      }).then(function () {
        battle.roomCode = code;
        battle.mySlot = 'p2';
        battle.oppSlot = 'p1';
        battle.roomRef = ref;

        ref.child('p2').onDisconnect().update({ disconnected: true });
        startCountdownSequence(room.secret);
      });
    }).catch(function () {
      showToast('Error joining room');
    });
  }

  function cancelRoom() {
    if (battle.roomRef) {
      battle.roomRef.off();
      battle.roomRef.remove();
    }
    resetBattleState();
    showBattleLobby();
  }

  function listenForOpponentJoin() {
    battle.roomRef.child('status').on('value', function (snap) {
      if (snap.val() === 'playing') {
        battle.roomRef.child('status').off();
        battle.roomRef.child('secret').once('value').then(function (s) {
          startCountdownSequence(s.val());
        });
      }
    });
  }

  function startCountdownSequence(secret) {
    showView('countdown');
    var el = dom.countdownBig;
    var count = 3;

    el.textContent = count;
    el.className = 'countdown-big';
    el.style.animation = 'none';
    void el.offsetWidth;
    el.style.animation = 'countdownPop 0.7s ease';

    var interval = setInterval(function () {
      count--;
      if (count > 0) {
        el.textContent = count;
        el.className = 'countdown-big';
        el.style.animation = 'none';
        void el.offsetWidth;
        el.style.animation = 'countdownPop 0.7s ease';
      } else if (count === 0) {
        el.textContent = 'GO';
        el.className = 'countdown-big go';
        el.style.animation = 'none';
        void el.offsetWidth;
        el.style.animation = 'countdownPop 0.7s ease';
      } else {
        clearInterval(interval);
        startBattleGame(secret);
      }
    }, 800);
  }

  function startBattleGame(secret) {
    game = {
      mode: 'battle',
      puzzleNum: 0,
      secret: secret,
      guesses: [],
      currentGuess: [],
      currentRow: 0,
      gameOver: false,
      won: false,
      keyStates: {},
      startTime: Date.now()
    };
    for (var i = 0; i <= 9; i++) game.keyStates[i] = 'default';

    battle.active = true;
    battle.oppGuesses = 0;
    battle.oppSolved = false;
    battle.oppDone = false;
    battleResultShown = false;

    showView('game');
    renderAll();
    renderBattleTracker();
    listenForBattleUpdates();
  }

  function syncBattleProgress() {
    if (!battle.active || !battle.roomRef) return;
    battle.roomRef.child(battle.mySlot).update({
      guesses: game.guesses.length,
      solved: game.won,
      done: game.gameOver
    });

    if (game.won) {
      battle.roomRef.child('winner').transaction(function (current) {
        if (current === null) return battle.mySlot;
        return undefined;
      });
    }
  }

  function listenForBattleUpdates() {
    // Listen for opponent progress
    battle.roomRef.child(battle.oppSlot).on('value', function (snap) {
      var data = snap.val();
      if (!data) return;

      battle.oppGuesses = data.guesses || 0;
      battle.oppSolved = data.solved || false;
      battle.oppDone = data.done || false;
      renderBattleTracker();

      if (data.disconnected && !game.gameOver) {
        showToast('Opponent disconnected');
        game.gameOver = true;
        endBattle('win');
        return;
      }

      // Both done, no winner set => draw
      if (data.done && !data.solved && game.gameOver && !game.won) {
        endBattle('draw');
      }
    });

    // Listen for winner
    battle.roomRef.child('winner').on('value', function (snap) {
      var winner = snap.val();
      if (!winner) return;

      if (winner === battle.mySlot) {
        if (game.won) {
          setTimeout(function () { endBattle('win'); }, 1600);
        }
      } else {
        game.gameOver = true;
        setTimeout(function () { endBattle('lose'); }, 600);
      }
    });
  }

  function endBattle(result) {
    if (battleResultShown) return;
    battleResultShown = true;
    game.gameOver = true;

    if (result === 'win' && !game.won) {
      // Won by default (opponent disconnected)
    }

    setTimeout(function () {
      showBattleResultModal(result);
    }, result === 'win' ? 400 : 200);
  }

  function resetBattleState() {
    if (battle.roomRef) {
      battle.roomRef.off();
    }
    battle.active = false;
    battle.roomCode = null;
    battle.roomRef = null;
    battle.mySlot = null;
    battle.oppSlot = null;
    battle.oppGuesses = 0;
    battle.oppSolved = false;
    battle.oppDone = false;
    battleResultShown = false;
  }

  function renderBattleTracker() {
    renderTrackerDots(dom.myProgress, game.guesses.length, game.won, game.gameOver && !game.won);
    renderTrackerDots(dom.oppProgress, battle.oppGuesses, battle.oppSolved, battle.oppDone && !battle.oppSolved);
  }

  function renderTrackerDots(container, guessCount, solved, failed) {
    container.innerHTML = '';
    for (var i = 0; i < MAX_GUESSES; i++) {
      var dot = document.createElement('div');
      dot.className = 'tracker-dot';
      if (i < guessCount) {
        if (solved && i === guessCount - 1) {
          dot.classList.add('solved');
        } else if (failed && i === guessCount - 1) {
          dot.classList.add('failed');
        } else {
          dot.classList.add('used');
        }
      }
      container.appendChild(dot);
    }
  }

  // ================================================================
  //  RENDERING
  // ================================================================
  function buildBoard() {
    dom.board.innerHTML = '';
    for (var r = 0; r < MAX_GUESSES; r++) {
      var row = document.createElement('div');
      row.className = 'row';
      row.id = 'row-' + r;

      var cells = document.createElement('div');
      cells.className = 'cells';
      for (var c = 0; c < NUM_DIGITS; c++) {
        var cell = document.createElement('div');
        cell.className = 'cell';
        cell.id = 'cell-' + r + '-' + c;
        cells.appendChild(cell);
      }

      var fb = document.createElement('div');
      fb.className = 'feedback';
      for (var d = 0; d < NUM_DIGITS; d++) {
        var dot = document.createElement('div');
        dot.className = 'dot';
        dot.id = 'dot-' + r + '-' + d;
        fb.appendChild(dot);
      }

      row.appendChild(cells);
      row.appendChild(fb);
      dom.board.appendChild(row);
    }
  }

  function buildKeypad() {
    dom.keypad.innerHTML = '';
    var layout = [1, 2, 3, 4, 5, 6, 7, 8, 9, 'del', 0, 'go'];

    layout.forEach(function (k) {
      var btn = document.createElement('button');
      btn.className = 'key';

      if (k === 'del') {
        btn.classList.add('fn');
        btn.textContent = 'DEL';
        btn.setAttribute('data-key', 'del');
        btn.addEventListener('click', deleteDigit);
      } else if (k === 'go') {
        btn.classList.add('fn', 'submit-key');
        btn.textContent = 'GO';
        btn.setAttribute('data-key', 'go');
        btn.addEventListener('click', submitGuess);
      } else {
        btn.textContent = k;
        btn.setAttribute('data-digit', k);
        setupLongPress(btn, k);
      }

      dom.keypad.appendChild(btn);
    });
  }

  function setupLongPress(btn, digit) {
    var timer = null, isLong = false, pressing = false;

    function start(e) {
      if (e.type === 'touchstart') pressing = true;
      isLong = false;
      btn.classList.remove('long-pressing');
      void btn.offsetWidth;
      btn.classList.add('long-pressing');
      timer = setTimeout(function () {
        isLong = true;
        toggleEliminate(digit);
        btn.classList.remove('long-pressing');
      }, 500);
    }

    function end(e) {
      clearTimeout(timer);
      btn.classList.remove('long-pressing');
      if (!isLong) {
        if (e.type === 'touchend' && pressing) {
          e.preventDefault();
          inputDigit(digit);
        } else if (e.type === 'mouseup') {
          inputDigit(digit);
        }
      }
      if (e.type === 'touchend') pressing = false;
    }

    function cancel() {
      clearTimeout(timer);
      btn.classList.remove('long-pressing');
      pressing = false;
    }

    btn.addEventListener('mousedown', start);
    btn.addEventListener('mouseup', end);
    btn.addEventListener('mouseleave', cancel);
    btn.addEventListener('touchstart', start, { passive: true });
    btn.addEventListener('touchend', end);
    btn.addEventListener('touchcancel', cancel);
  }

  function getCellEl(r, c) {
    return document.getElementById('cell-' + r + '-' + c);
  }

  function renderCurrentRow() {
    var r = game.currentRow;
    if (r >= MAX_GUESSES) return;
    for (var c = 0; c < NUM_DIGITS; c++) {
      var cell = getCellEl(r, c);
      if (!cell) continue;
      if (c < game.currentGuess.length) {
        cell.textContent = game.currentGuess[c];
        cell.classList.add('active-row');
      } else {
        cell.textContent = '';
        cell.classList.remove('filled');
      }
      cell.classList.remove('submitted', 'won');
    }
  }

  function renderSubmittedRow(r, entry) {
    for (var c = 0; c < NUM_DIGITS; c++) {
      var cell = getCellEl(r, c);
      cell.textContent = entry.digits[c];
      cell.classList.remove('filled', 'active-row');
      cell.classList.add('submitted');
    }
  }

  function animateFeedback(row, result, callback) {
    var dots = [];
    var i;
    for (i = 0; i < result.correct; i++) dots.push('correct');
    for (i = 0; i < result.wrongPos; i++) dots.push('present');
    for (i = 0; i < result.absent; i++) dots.push('absent-dot');

    dots.forEach(function (cls, idx) {
      setTimeout(function () {
        var dot = document.getElementById('dot-' + row + '-' + idx);
        dot.classList.add(cls, 'revealed');
        dot.style.animation = 'dotReveal 0.35s ease forwards';
      }, 200 + idx * 150);
    });

    setTimeout(callback, 200 + dots.length * 150 + 200);
  }

  function renderKeypad() {
    document.querySelectorAll('.key[data-digit]').forEach(function (btn) {
      var d = parseInt(btn.getAttribute('data-digit'), 10);
      var st = game.keyStates[d];
      btn.classList.remove('key-absent', 'key-eliminated');
      if (st === 'absent') btn.classList.add('key-absent');
      if (st === 'eliminated') btn.classList.add('key-eliminated');
    });
  }

  function renderAll() {
    buildBoard();
    game.guesses.forEach(function (entry, r) {
      renderSubmittedRow(r, entry);
      var result = {
        correct: entry.correct,
        wrongPos: entry.wrongPos,
        absent: NUM_DIGITS - entry.correct - entry.wrongPos
      };
      var dots = [];
      var i;
      for (i = 0; i < result.correct; i++) dots.push('correct');
      for (i = 0; i < result.wrongPos; i++) dots.push('present');
      for (i = 0; i < result.absent; i++) dots.push('absent-dot');
      dots.forEach(function (cls, idx) {
        var dot = document.getElementById('dot-' + r + '-' + idx);
        dot.classList.add(cls, 'revealed');
        dot.style.transform = 'scale(1)';
      });
      if (entry.correct === NUM_DIGITS) {
        for (var c = 0; c < NUM_DIGITS; c++) getCellEl(r, c).classList.add('won');
      }
    });
    renderCurrentRow();
    renderKeypad();
    dom.puzzleNum.textContent = '#' + getPuzzleNumber();
  }

  // ================================================================
  //  ANIMATIONS
  // ================================================================
  function shakeRow(r) {
    var row = document.getElementById('row-' + r);
    row.style.animation = 'none';
    void row.offsetWidth;
    row.style.animation = 'shake 0.5s ease';
    setTimeout(function () { row.style.animation = ''; }, 500);
  }

  function celebrateWin(row) {
    for (var c = 0; c < NUM_DIGITS; c++) {
      var cell = getCellEl(row, c);
      cell.classList.add('won');
      cell.style.animation = 'none';
      void cell.offsetWidth;
      cell.style.animationDelay = c * 100 + 'ms';
      cell.style.animation = 'bounce 0.6s ease ' + c * 100 + 'ms';
    }
    launchConfetti();
  }

  function launchConfetti() {
    dom.confetti.innerHTML = '';
    var colors = ['#22c55e', '#eab308', '#ef4444', '#3b82f6', '#a855f7', '#ec4899', '#f97316', '#06b6d4'];
    for (var i = 0; i < 80; i++) {
      var piece = document.createElement('div');
      piece.className = 'confetti-piece ' + (Math.random() > 0.5 ? 'rect' : 'circle');
      piece.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
      piece.style.left = Math.random() * 100 + '%';
      piece.style.width = (Math.random() * 8 + 6) + 'px';
      piece.style.height = (Math.random() * 8 + 6) + 'px';
      piece.style.setProperty('--rot', (Math.random() * 1440 - 720) + 'deg');
      piece.style.animationDuration = (Math.random() * 2 + 1.5) + 's';
      piece.style.animationDelay = (Math.random() * 0.8) + 's';
      dom.confetti.appendChild(piece);
    }
    setTimeout(function () { dom.confetti.innerHTML = ''; }, 4000);
  }

  // ================================================================
  //  TOAST
  // ================================================================
  function showToast(msg, duration) {
    duration = duration || 1900;
    var toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = msg;
    dom.toasts.appendChild(toast);
    setTimeout(function () { if (toast.parentNode) toast.remove(); }, duration);
  }

  // ================================================================
  //  MODALS
  // ================================================================
  function openModal(html) {
    dom.modal.innerHTML = html;
    dom.overlay.classList.remove('hidden');
    dom.modal.classList.remove('hidden');
  }

  function closeModal() {
    dom.overlay.classList.add('hidden');
    dom.modal.classList.add('hidden');
  }

  window.closeModal = closeModal;
  window.shareResult = shareResult;

  window.newPracticeGame = function () {
    closeModal();
    newGame('practice');
  };

  window.backToBattleLobby = function () {
    closeModal();
    resetBattleState();
    showBattleLobby();
  };

  function showHelp() {
    openModal(
      '<button class="modal-close" onclick="closeModal()">x</button>' +
      '<div class="modal-title">HOW TO PLAY</div>' +
      '<div class="modal-section">' +
        '<p>Guess the secret <strong>3-digit number</strong> in 6 tries. All digits are unique (no repeats).</p>' +
        '<p style="margin-top:8px">After each guess, feedback dots show how close you are ' +
        '- but <em>not which digit</em> they refer to.</p>' +
      '</div>' +
      '<div class="modal-section">' +
        '<h3>Feedback Dots</h3>' +
        '<div class="help-example"><div class="help-dot g"></div><span>Digit is correct and in the right position</span></div>' +
        '<div class="help-example"><div class="help-dot y"></div><span>Digit exists but in the wrong position</span></div>' +
        '<div class="help-example"><div class="help-dot a"></div><span>Digit is not in the number</span></div>' +
      '</div>' +
      '<div class="modal-section">' +
        '<h3>Example</h3>' +
        '<p>Secret: <strong>4 1 8</strong>  |  Guess: <strong>1 0 8</strong></p>' +
        '<div class="help-example" style="gap:6px">' +
          '<div class="help-dot g"></div><div class="help-dot y"></div><div class="help-dot a"></div>' +
          '<span style="margin-left:6px">1 correct, 1 misplaced, 1 absent</span>' +
        '</div>' +
      '</div>' +
      '<div class="modal-section">' +
        '<h3>Modes</h3>' +
        '<p><strong>Daily</strong> - Same number for everyone, resets at midnight.</p>' +
        '<p style="margin-top:4px"><strong>Practice</strong> - Unlimited random puzzles.</p>' +
        '<p style="margin-top:4px"><strong>Battle</strong> - Race a friend in real-time.</p>' +
        '<p style="margin-top:8px"><strong>Long press</strong> any key to cross it out as scratch work.</p>' +
      '</div>' +
      '<button class="modal-btn btn-close" onclick="closeModal()">Got it</button>'
    );
  }

  function showResult() {
    var won = game.won;
    var tries = game.guesses.length;
    var secret = game.secret;
    var elapsed = Math.floor((Date.now() - game.startTime) / 1000);
    var mins = Math.floor(elapsed / 60);
    var secs = elapsed % 60;
    var timeStr = mins + ':' + (secs < 10 ? '0' : '') + secs;

    var titles = ['Genius!', 'Magnificent!', 'Impressive!', 'Splendid!', 'Great!', 'Phew!'];
    var title = won ? titles[tries - 1] : 'Better luck next time';

    var digitHtml = '';
    secret.forEach(function (d) {
      digitHtml += '<div class="result-digit ' + (won ? 'rg' : 'rr') + '">' + d + '</div>';
    });

    var subtitle = won
      ? 'Solved in ' + tries + '/' + MAX_GUESSES + ' -- ' + timeStr
      : 'The number was ' + secret.join('');

    var nextPuzzle = '';
    if (game.mode === 'daily') {
      nextPuzzle = '<div class="countdown">Next Nurdle in <span id="countdown-timer">--:--:--</span></div>';
    }

    var buttons = '';
    if (won || game.mode === 'daily') {
      buttons += '<button class="modal-btn btn-share" onclick="shareResult()">Share Result</button>';
    }
    if (game.mode === 'practice') {
      buttons += '<button class="modal-btn btn-new" onclick="newPracticeGame()">New Game</button>';
    }
    buttons += '<button class="modal-btn btn-close" onclick="closeModal()">Close</button>';

    openModal(
      '<button class="modal-close" onclick="closeModal()">x</button>' +
      '<div class="modal-title">' + title + '</div>' +
      '<div class="result-number">' + digitHtml + '</div>' +
      '<p style="text-align:center;color:var(--text-dim);font-size:13px">' + subtitle + '</p>' +
      nextPuzzle + buttons
    );

    if (game.mode === 'daily') startNextPuzzleCountdown();
  }

  function showBattleResultModal(result) {
    var title, tagClass;
    if (result === 'win') { title = 'YOU WIN'; tagClass = 'win-tag'; }
    else if (result === 'lose') { title = 'YOU LOSE'; tagClass = 'lose-tag'; }
    else { title = 'DRAW'; tagClass = 'draw-tag'; }

    var secret = game.secret;
    var digitHtml = '';
    secret.forEach(function (d) {
      digitHtml += '<div class="result-digit rb">' + d + '</div>';
    });

    var myText = game.won ? game.guesses.length + '/6' : 'X/6';
    var oppText = battle.oppSolved ? battle.oppGuesses + '/6' : 'X/6';
    var myScoreClass = result === 'win' ? 'win-score' : (result === 'lose' ? 'lose-score' : '');
    var oppScoreClass = result === 'lose' ? 'win-score' : (result === 'win' ? 'lose-score' : '');

    openModal(
      '<button class="modal-close" onclick="closeModal()">x</button>' +
      '<div class="modal-title">' + title + '</div>' +
      '<div style="text-align:center"><span class="battle-result-tag ' + tagClass + '">' +
        'Room: ' + battle.roomCode + '</span></div>' +
      '<div class="result-number">' + digitHtml + '</div>' +
      '<div class="battle-scores">' +
        '<div class="battle-score-player">' +
          '<div class="score-label">You</div>' +
          '<div class="score-val ' + myScoreClass + '">' + myText + '</div>' +
        '</div>' +
        '<div class="battle-score-player">' +
          '<div class="score-label">Opponent</div>' +
          '<div class="score-val ' + oppScoreClass + '">' + oppText + '</div>' +
        '</div>' +
      '</div>' +
      '<button class="modal-btn btn-new" onclick="backToBattleLobby()">Play Again</button>' +
      '<button class="modal-btn btn-close" onclick="closeModal()">Close</button>'
    );

    resetBattleState();
  }

  function showStats() {
    var stats = loadStats();
    var pct = stats.gamesPlayed > 0 ? Math.round((stats.gamesWon / stats.gamesPlayed) * 100) : 0;
    var maxDist = Math.max.apply(null, stats.distribution.concat([1]));

    var distHtml = '';
    for (var i = 0; i < MAX_GUESSES; i++) {
      var w = Math.max(8, Math.round((stats.distribution[i] / maxDist) * 100));
      var hl = game.won && game.guesses.length === i + 1 ? ' highlight' : '';
      distHtml +=
        '<div class="dist-row">' +
        '<span style="width:14px;text-align:right">' + (i + 1) + '</span>' +
        '<div class="dist-bar' + hl + '" style="width:' + w + '%">' + stats.distribution[i] + '</div>' +
        '</div>';
    }

    openModal(
      '<button class="modal-close" onclick="closeModal()">x</button>' +
      '<div class="modal-title">STATISTICS</div>' +
      '<div class="stat-row">' +
        '<div class="stat-item"><div class="stat-val">' + stats.gamesPlayed + '</div><div class="stat-label">Played</div></div>' +
        '<div class="stat-item"><div class="stat-val">' + pct + '</div><div class="stat-label">Win %</div></div>' +
        '<div class="stat-item"><div class="stat-val">' + stats.currentStreak + '</div><div class="stat-label">Streak</div></div>' +
        '<div class="stat-item"><div class="stat-val">' + stats.maxStreak + '</div><div class="stat-label">Best</div></div>' +
      '</div>' +
      '<div class="modal-section"><h3>Guess Distribution</h3>' + distHtml + '</div>' +
      '<button class="modal-btn btn-close" onclick="closeModal()">Close</button>'
    );
  }

  function showFirebaseSetup() {
    openModal(
      '<button class="modal-close" onclick="closeModal()">x</button>' +
      '<div class="modal-title">SETUP REQUIRED</div>' +
      '<div class="modal-section">' +
        '<p>Battle Mode needs Firebase (free) for real-time multiplayer.</p>' +
        '<p style="margin-top:12px"><strong>One-time setup:</strong></p>' +
        '<p style="margin-top:8px">1. Go to <strong>console.firebase.google.com</strong></p>' +
        '<p>2. Create a new project (disable Analytics)</p>' +
        '<p>3. Click <strong>Build > Realtime Database > Create Database</strong></p>' +
        '<p>4. Choose any location, start in <strong>Test mode</strong></p>' +
        '<p>5. Go to <strong>Project Settings</strong> (gear icon)</p>' +
        '<p>6. Under "Your apps", click the web icon (&lt;/&gt;)</p>' +
        '<p>7. Register an app name, copy the <strong>firebaseConfig</strong> object</p>' +
        '<p>8. Paste those values into the top of <strong>game.js</strong></p>' +
      '</div>' +
      '<button class="modal-btn btn-close" onclick="closeModal()">Got it</button>'
    );
  }

  // ================================================================
  //  SHARE
  // ================================================================
  function generateShareText() {
    var num = game.mode === 'daily' ? '#' + game.puzzleNum : '(Practice)';
    var result = game.won ? game.guesses.length + '/' + MAX_GUESSES : 'X/' + MAX_GUESSES;
    var grid = '';
    game.guesses.forEach(function (g) {
      var i;
      for (i = 0; i < g.correct; i++) grid += '🟢';
      for (i = 0; i < g.wrongPos; i++) grid += '🟡';
      for (i = 0; i < NUM_DIGITS - g.correct - g.wrongPos; i++) grid += '⚫';
      grid += '\n';
    });
    return 'Nurdle ' + num + ' ' + result + '\n\n' + grid.trim();
  }

  function shareResult() {
    var text = generateShareText();
    if (navigator.share) {
      navigator.share({ text: text }).catch(function () {});
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(function () {
        showToast('Copied to clipboard');
      });
    } else {
      showToast('Share not supported');
    }
  }

  // ================================================================
  //  COUNTDOWN TO NEXT PUZZLE
  // ================================================================
  function startNextPuzzleCountdown() {
    var el = document.getElementById('countdown-timer');
    if (!el) return;

    function tick() {
      var now = new Date();
      var tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);
      var diff = Math.max(0, Math.floor((tomorrow - now) / 1000));
      var h = Math.floor(diff / 3600);
      var m = Math.floor((diff % 3600) / 60);
      var s = diff % 60;
      var target = document.getElementById('countdown-timer');
      if (target) {
        target.textContent =
          (h < 10 ? '0' : '') + h + ':' +
          (m < 10 ? '0' : '') + m + ':' +
          (s < 10 ? '0' : '') + s;
      }
    }

    tick();
    var interval = setInterval(function () {
      if (!document.getElementById('countdown-timer')) {
        clearInterval(interval);
        return;
      }
      tick();
    }, 1000);
  }

  // ================================================================
  //  LOCAL STORAGE
  // ================================================================
  function loadStats() {
    try {
      var s = JSON.parse(localStorage.getItem('nurdle_stats'));
      if (s && s.distribution) return s;
    } catch (e) { /* ignore */ }
    return {
      gamesPlayed: 0, gamesWon: 0,
      currentStreak: 0, maxStreak: 0,
      distribution: [0, 0, 0, 0, 0, 0]
    };
  }

  function saveStats(stats) {
    localStorage.setItem('nurdle_stats', JSON.stringify(stats));
  }

  function updateStats(won, numGuesses) {
    var stats = loadStats();
    stats.gamesPlayed++;
    if (won) {
      stats.gamesWon++;
      stats.currentStreak++;
      stats.maxStreak = Math.max(stats.maxStreak, stats.currentStreak);
      stats.distribution[numGuesses - 1]++;
    } else {
      stats.currentStreak = 0;
    }
    saveStats(stats);
  }

  function saveDaily() {
    var data = {
      puzzleNum: game.puzzleNum,
      secret: game.secret,
      guesses: game.guesses,
      currentRow: game.currentRow,
      gameOver: game.gameOver,
      won: game.won,
      keyStates: game.keyStates,
      startTime: game.startTime,
      mode: 'daily',
      currentGuess: game.currentGuess
    };
    localStorage.setItem('nurdle_daily', JSON.stringify(data));
  }

  function loadDaily() {
    try {
      return JSON.parse(localStorage.getItem('nurdle_daily'));
    } catch (e) { return null; }
  }

  // ================================================================
  //  KEYBOARD SUPPORT
  // ================================================================
  document.addEventListener('keydown', function (e) {
    if (!dom.modal.classList.contains('hidden')) {
      if (e.key === 'Escape') closeModal();
      return;
    }
    if (e.key >= '0' && e.key <= '9') {
      inputDigit(parseInt(e.key, 10));
    } else if (e.key === 'Backspace' || e.key === 'Delete') {
      e.preventDefault();
      deleteDigit();
    } else if (e.key === 'Enter') {
      submitGuess();
    }
  });

  // ================================================================
  //  EVENT LISTENERS
  // ================================================================
  dom.helpBtn.addEventListener('click', showHelp);
  dom.statsBtn.addEventListener('click', showStats);

  dom.dailyBtn.addEventListener('click', function () {
    if (battle.active || battle.roomCode) {
      resetBattleState();
    }
    newGame('daily');
  });

  dom.practiceBtn.addEventListener('click', function () {
    if (battle.active || battle.roomCode) {
      resetBattleState();
    }
    if (game.mode !== 'practice' || game.gameOver) {
      newGame('practice');
    } else {
      showView('game');
      updateModeButtons('practice');
    }
  });

  dom.battleBtn.addEventListener('click', function () {
    if (battle.active) {
      showView('game');
      updateModeButtons('battle');
      return;
    }
    showBattleLobby();
  });

  dom.createRoomBtn.addEventListener('click', createRoom);
  dom.joinRoomBtn.addEventListener('click', joinRoom);
  dom.cancelRoomBtn.addEventListener('click', cancelRoom);

  dom.copyCodeBtn.addEventListener('click', function () {
    if (navigator.clipboard && battle.roomCode) {
      navigator.clipboard.writeText(battle.roomCode).then(function () {
        showToast('Code copied');
      });
    }
  });

  dom.roomCodeInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') joinRoom();
  });

  dom.overlay.addEventListener('click', closeModal);

  // ================================================================
  //  BOOT
  // ================================================================
  buildBoard();
  buildKeypad();
  newGame('daily');

  if (!localStorage.getItem('nurdle_visited')) {
    localStorage.setItem('nurdle_visited', '1');
    setTimeout(showHelp, 500);
  }
})();