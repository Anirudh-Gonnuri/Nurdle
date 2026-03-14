(function () {
  'use strict';

  // ================================================================
  //  FIREBASE CONFIG
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
  var EPOCH = new Date(2026, 2, 14);

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
    oppSolved: false,
    oppDone: false,
    roomRef: null,
    secretChoosing: false,
    customSecret: []
  };

  var firebaseReady = false;

  // ================================================================
  //  DOM REFERENCES
  // ================================================================
  var dom = {
    unlimitedToggle: document.getElementById('unlimitedToggle'),
    duplicatesToggle: document.getElementById('duplicatesToggle'),
    board: document.getElementById('board'),
    keypad: document.getElementById('keypad'),
    toasts: document.getElementById('toast-container'),
    confetti: document.getElementById('confetti'),
    overlay: document.getElementById('overlay'),
    modal: document.getElementById('modal'),
    helpBtn: document.getElementById('helpBtn'),
    settingsBtn: document.getElementById('settingsBtn'),
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
    battleSelectSecret: document.getElementById('battle-select-secret'),
    selectNumberDisplay: document.getElementById('selectNumberDisplay'),
    lockSecretBtn: document.getElementById('lockSecretBtn'),
    countdownBig: document.getElementById('countdownBig'),
    myProgress: document.getElementById('myProgress'),
    oppProgress: document.getElementById('oppProgress')
  };

  // Helper function to check if unlimited mode is active
  function isUnlimited() {
    return (game.mode === 'practice' || game.mode === 'battle') && dom.unlimitedToggle.checked;
  }

  // Helper function to check if duplicates are allowed
  function allowDuplicates() {
    return (game.mode === 'practice' || game.mode === 'battle') && dom.duplicatesToggle.checked;
  }


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
    return Math.floor((today - EPOCH) / 86400000) + 1;
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
      if (!allowDuplicates()) {
        pool.splice(idx, 1);
      }
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
    dom.battleSelectSecret.classList.toggle('hidden', view !== 'select-secret');
    dom.battleCountdown.classList.toggle('hidden', view !== 'countdown');
    dom.keypadContainer.classList.toggle('hidden', view !== 'game' && view !== 'select-secret');
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
    if (battle.secretChoosing) {
      if (battle.customSecret.length < NUM_DIGITS && (allowDuplicates() || battle.customSecret.indexOf(d) === -1)) {
        battle.customSecret.push(d);
        renderSelectMode();
      }
      return;
    }
    if (game.gameOver || game.currentGuess.length >= NUM_DIGITS || (!allowDuplicates() && game.currentGuess.indexOf(d) !== -1)) return;
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
    if (battle.secretChoosing) {
      if (battle.customSecret.length > 0) {
        battle.customSecret.pop();
        renderSelectMode();
      }
      return;
    }
    if (game.gameOver || game.currentGuess.length === 0) return;
    game.currentGuess.pop();
    renderCurrentRow();
  }

  function submitGuess() {
    if (game.mode === 'battle' && !battle.secretChoosing && !battle.myTurn) {
      showToast("Waiting for opponent's turn");
      return;
    }
    if (game.gameOver) return;
    if (game.currentGuess.length < NUM_DIGITS) {
      shakeRow(game.currentRow);
      showToast('Not enough digits');
      return;
    }

    if (!allowDuplicates()) {
      var unique = [];
      for (var u = 0; u < game.currentGuess.length; u++) {
        if (unique.indexOf(game.currentGuess[u]) !== -1) {
          shakeRow(game.currentRow);
          showToast('No duplicate digits');
          return;
        }
        unique.push(game.currentGuess[u]);
      }
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
      var unlimited = isUnlimited();

      if (result.correct === NUM_DIGITS) {
        game.won = true;
        game.gameOver = true;
        celebrateWin(row);

        if (isBattle) {
          syncBattleProgress();
          renderBattleTracker();
          battle.roomRef.update({ turn: battle.oppSlot });
          checkBattleOutcome();
        } else {
          if (game.mode === 'daily') {
            updateStats(true, game.guesses.length);
            saveDaily();
          }
          setTimeout(showResult, 1800);
        }
      } else if (game.currentRow >= MAX_GUESSES && !unlimited) {
        game.gameOver = true;
        if (isBattle) {
          syncBattleProgress();
          renderBattleTracker();
          battle.roomRef.update({ turn: battle.oppSlot });
          checkBattleOutcome();
        } else {
          if (game.mode === 'daily') {
            updateStats(false, game.guesses.length);
            saveDaily();
          }
          setTimeout(showResult, 1000);
        }
      } else {
        if (isBattle) {
          syncBattleProgress();
          renderBattleTracker();
          battle.roomRef.update({ turn: battle.oppSlot });
          checkBattleOutcome();
        }
        if (unlimited) {
          ensureRowExists(game.currentRow);
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

  function getRulesText() {
    var parts = [];
    if (dom.unlimitedToggle.checked) parts.push('Unlimited guesses');
    if (dom.duplicatesToggle.checked) parts.push('Duplicates allowed');
    return parts.length ? parts.join(' · ') : 'Standard rules';
  }

  function showBattleLobby() {
    game.mode = 'battle';
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
      firstTurn: 'p1',
      settings: {
        unlimited: dom.unlimitedToggle.checked,
        duplicates: dom.duplicatesToggle.checked
      },
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
      var rulesEl = document.getElementById('roomRulesDisplay');
      if (rulesEl) rulesEl.textContent = getRulesText();

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

      if (room.settings) {
        dom.unlimitedToggle.checked = !!room.settings.unlimited;
        dom.duplicatesToggle.checked = !!room.settings.duplicates;
        localStorage.setItem('nurdle_unlimited', dom.unlimitedToggle.checked ? '1' : '0');
        localStorage.setItem('nurdle_duplicates', dom.duplicatesToggle.checked ? '1' : '0');
      }

      ref.update({
        status: 'playing',
        p2: { id: battle.playerId, guesses: 0, done: false, solved: false }
      }).then(function () {
        battle.roomCode = code;
        battle.mySlot = 'p2';
        battle.oppSlot = 'p1';
        battle.roomRef = ref;

        startSecretSelection();
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
        startSecretSelection();
      }
    });
  }

  function startSecretSelection() {
    battle.secretChoosing = true;
    battle.customSecret = [];
    if (!game.keyStates) game.keyStates = {};
    for (var i = 0; i <= 9; i++) game.keyStates[i] = 'default';
    showView('select-secret');
    var subtitle = dom.battleSelectSecret.querySelector('.lobby-subtitle');
    if (subtitle) {
      subtitle.innerHTML = 'Pick a 3-digit number for your opponent to guess.<br><span class="select-rules-text">' + getRulesText() + '</span>';
    }
    renderSelectMode();
    dom.lockSecretBtn.disabled = false;
    dom.lockSecretBtn.textContent = 'LOCK IN NUMBER';
    renderKeypad();
  }

  function renderSelectMode() {
    var digits = dom.selectNumberDisplay.children;
    for (var i = 0; i < NUM_DIGITS; i++) {
      var d = battle.customSecret[i];
      digits[i].textContent = d !== undefined ? d : '';
      digits[i].style.borderColor = d !== undefined ? 'var(--green)' : 'var(--border-empty)';
    }
  }

  function listenForBothSecrets() {
    battle.roomRef.on('value', function (snap) {
      var data = snap.val();
      if (!data) return;

      if (data.p1Secret && data.p2Secret) {
        battle.roomRef.off('value');

        var secretToGuess = data[battle.oppSlot + 'Secret'].split('').map(Number);

        var firstPlayer = data.firstTurn || 'p1';
        battle.myTurn = (battle.mySlot === firstPlayer);

        if (battle.mySlot === 'p1' && !data.turn) {
          battle.roomRef.update({ turn: firstPlayer });
        }

        startBattleGame(secretToGuess);
      }
    });
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
  }

  // After both players have completed the same round, determine the outcome.
  // Called whenever opponent data updates or when we finish our own turn.
  function checkBattleOutcome() {
    if (battleResultShown || !battle.active) return;

    var myGuesses = game.guesses.length;
    var oppGuesses = battle.oppGuesses;
    var mySolved = game.won;
    var oppSolved = battle.oppSolved;
    var myDone = game.gameOver;
    var oppDone = battle.oppDone;

    // Both on the same round count — this round is complete for both
    if (myGuesses === oppGuesses && myGuesses > 0) {
      if (mySolved && oppSolved) {
        // Both solved on the same round → tie
        battle.roomRef.update({ winner: 'tie' });
        endBattle('draw');
        return;
      }
      if (mySolved && !oppSolved) {
        // I solved, opponent didn't on same round → I win
        battle.roomRef.update({ winner: battle.mySlot });
        setTimeout(function () { endBattle('win'); }, 1600);
        return;
      }
      if (!mySolved && oppSolved) {
        // Opponent solved, I didn't on same round → I lose
        game.gameOver = true;
        setTimeout(function () { endBattle('lose'); }, 600);
        return;
      }
    }

    // Both done (ran out of guesses) without either solving
    if (myDone && !mySolved && oppDone && !oppSolved) {
      endBattle('draw');
      return;
    }
  }

  function listenForBattleUpdates() {
    battle.roomRef.child(battle.oppSlot).on('value', function (snap) {
      var data = snap.val();
      if (!data) {
        if (battleResultShown) showToast('Opponent left the room');
        return;
      }

      battle.oppGuesses = data.guesses || 0;
      battle.oppSolved = data.solved || false;
      battle.oppDone = data.done || false;
      renderBattleTracker();

      checkBattleOutcome();
    });

    battle.roomRef.child('turn').on('value', function (snap) {
      var whoseTurn = snap.val();
      if (!whoseTurn) return;
      battle.myTurn = (whoseTurn === battle.mySlot);
      renderBattleTracker();
    });
  }

  function endBattle(result) {
    if (battleResultShown) return;
    battleResultShown = true;
    game.gameOver = true;

    for (var i = 0; i <= 9; i++) game.keyStates[i] = 'default';
    renderKeypad();

    setTimeout(function () {
      showBattleResultModal(result);
    }, result === 'win' ? 400 : 200);

    listenForRematch();
  }

  function listenForRematch() {
    battle.roomRef.child('rematch').on('value', function (snap) {
      var data = snap.val() || {};
      var myReady = data[battle.mySlot] === true;
      var oppReady = data[battle.oppSlot] === true;

      if (myReady && oppReady) {
        battle.roomRef.child('rematch').off();
        doRematch();
        return;
      }

      var btn = document.querySelector('.btn-new');
      if (!btn) return;

      if (myReady) {
        btn.textContent = 'Waiting for opponent\u2026';
        btn.disabled = true;
        btn.style.opacity = '0.6';
      } else if (oppReady) {
        btn.textContent = 'Play Again \u2014 Opponent is ready!';
        btn.style.background = 'var(--green)';
        btn.style.color = '#fff';
        showToast('Opponent wants to play again!');
      }
    });
  }

  function doRematch() {
    closeModal();
    battleResultShown = false;
    battle.roomRef.child(battle.mySlot).update({ guesses: 0, solved: false, done: false });
    if (battle.mySlot === 'p1') {
      battle.roomRef.child('firstTurn').once('value', function (snap) {
        var lastFirst = snap.val() || 'p1';
        var nextFirst = lastFirst === 'p1' ? 'p2' : 'p1';
        battle.roomRef.update({
          p1Secret: null,
          p2Secret: null,
          winner: null,
          turn: null,
          firstTurn: nextFirst,
          rematch: null
        });
        startSecretSelection();
      });
    } else {
      startSecretSelection();
    }
  }

  function resetBattleState() {
    if (battle.roomRef) {
      battle.roomRef.off();
      battle.roomRef.child(battle.mySlot).remove();
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

  window.playAgain = function () {
    if (!battle.roomRef) {
      closeModal();
      backToBattleLobby();
      return;
    }
    battle.roomRef.child('rematch/' + battle.mySlot).set(true);
    var btn = document.querySelector('.btn-new');
    if (btn) {
      btn.textContent = 'Waiting for opponent\u2026';
      btn.disabled = true;
      btn.style.opacity = '0.6';
    }
  };

  function renderBattleTracker() {
    renderTrackerDots(dom.myProgress, game.guesses.length, game.won, game.gameOver && !game.won);
    renderTrackerDots(dom.oppProgress, battle.oppGuesses, battle.oppSolved, battle.oppDone && !battle.oppSolved);
  }

  function renderTrackerDots(container, guessCount, solved, failed) {
    container.innerHTML = '';
    var dotCount = isUnlimited() ? Math.max(MAX_GUESSES, guessCount + (!solved && !failed ? 1 : 0)) : MAX_GUESSES;
    for (var i = 0; i < dotCount; i++) {
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

    var turnBanner = document.getElementById('battleTurnBanner');
    if (!turnBanner) {
      turnBanner = document.createElement('div');
      turnBanner.id = 'battleTurnBanner';
      turnBanner.style.cssText = 'text-align:center;padding:6px;font-size:11px;font-weight:700;letter-spacing:1.5px;margin-top:8px;border-radius:4px;text-transform:uppercase;';
      dom.battleTracker.appendChild(turnBanner);
    }

    if (battle.active && !game.gameOver) {
      if (battle.myTurn) {
        turnBanner.textContent = 'YOUR TURN';
        turnBanner.style.backgroundColor = 'var(--green)';
        turnBanner.style.color = '#fff';
        dom.keypad.style.opacity = '1';
        dom.keypad.style.pointerEvents = 'auto';
      } else {
        turnBanner.textContent = "OPPONENT'S TURN";
        turnBanner.style.backgroundColor = 'var(--evaluation-bg)';
        turnBanner.style.color = 'var(--text-dim)';
        dom.keypad.style.opacity = '0.4';
        dom.keypad.style.pointerEvents = 'auto';
      }
    } else if (battle.active && game.gameOver && !battleResultShown) {
      turnBanner.textContent = 'WAITING FOR OPPONENT...';
      turnBanner.style.backgroundColor = 'var(--evaluation-bg)';
      turnBanner.style.color = 'var(--text-dim)';
      dom.keypad.style.opacity = '0.4';
      dom.keypad.style.pointerEvents = 'none';
    } else {
      turnBanner.innerHTML = '&nbsp;';
      turnBanner.style.backgroundColor = 'transparent';
      dom.keypad.style.opacity = '1';
      dom.keypad.style.pointerEvents = 'auto';
    }
  }

  // ================================================================
  //  RENDERING
  // ================================================================
  function ensureRowExists(r) {
    if (document.getElementById('row-' + r)) return;
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

    var spacer = document.createElement('div');
    spacer.className = 'row-spacer';
    row.appendChild(spacer);
    row.appendChild(cells);
    row.appendChild(fb);
    dom.board.appendChild(row);

    // Auto-scroll to show the new row
    setTimeout(function () {
      dom.board.scrollTop = dom.board.scrollHeight;
    }, 50);
  }

  function buildBoard() {
    dom.board.innerHTML = '';
    var targetRows = MAX_GUESSES;
    for (var r = 0; r < targetRows; r++) {
      ensureRowExists(r);
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
        btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" height="20" viewBox="0 0 24 24" width="20" fill="currentColor"><path d="M22 3H7c-.69 0-1.23.35-1.59.88L0 12l5.41 8.11c.36.53.9.89 1.59.89h15c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H7.07L2.4 12l4.66-7H22v14zm-11.59-2L14 13.41 17.59 17 19 15.59 15.41 12 19 8.41 17.59 7 14 10.59 10.41 7 9 8.41 12.59 12 9 15.59z"/></svg>';
        btn.setAttribute('data-key', 'del');
        btn.addEventListener('click', deleteDigit);
      } else if (k === 'go') {
        btn.classList.add('fn', 'submit-key');
        btn.textContent = 'ENTER';
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
    if (r >= MAX_GUESSES && !isUnlimited()) return;
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
      cell.style.background = 'var(--absent)';
      cell.style.borderColor = 'var(--absent)';
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
      }, 150 + idx * 120);
    });

    setTimeout(callback, 150 + dots.length * 120 + 200);
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
        for (var c = 0; c < NUM_DIGITS; c++) {
          var cell = getCellEl(r, c);
          cell.classList.add('won');
          cell.style.background = 'var(--green)';
          cell.style.borderColor = 'var(--green)';
        }
      }
    });
    renderCurrentRow();
    renderKeypad();
  }

  // ================================================================
  //  ANIMATIONS
  // ================================================================
  function shakeRow(r) {
    var row = document.getElementById('row-' + r);
    row.style.animation = 'none';
    void row.offsetWidth;
    row.style.animation = 'shake 0.6s ease';
    setTimeout(function () { row.style.animation = ''; }, 600);
  }

  function celebrateWin(row) {
    for (var c = 0; c < NUM_DIGITS; c++) {
      var cell = getCellEl(row, c);
      cell.classList.add('won');
      cell.style.background = 'var(--green)';
      cell.style.borderColor = 'var(--green)';
      cell.style.animation = 'none';
      void cell.offsetWidth;
      cell.style.animationDelay = c * 100 + 'ms';
      cell.style.animation = 'bounce 1s ease ' + c * 100 + 'ms';
    }
    launchConfetti();
  }

  function launchConfetti() {
    dom.confetti.innerHTML = '';
    var colors = ['#6aaa64', '#c9b458', '#e74c3c', '#3b82f6', '#a855f7', '#ec4899', '#f97316'];
    for (var i = 0; i < 60; i++) {
      var piece = document.createElement('div');
      piece.className = 'confetti-piece ' + (Math.random() > 0.5 ? 'rect' : 'circle');
      piece.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
      piece.style.left = Math.random() * 100 + '%';
      piece.style.width = (Math.random() * 8 + 5) + 'px';
      piece.style.height = (Math.random() * 8 + 5) + 'px';
      piece.style.setProperty('--rot', (Math.random() * 1440 - 720) + 'deg');
      piece.style.animationDuration = (Math.random() * 2 + 1.5) + 's';
      piece.style.animationDelay = (Math.random() * 0.6) + 's';
      dom.confetti.appendChild(piece);
    }
    setTimeout(function () { dom.confetti.innerHTML = ''; }, 4000);
  }

  // ================================================================
  //  TOAST
  // ================================================================
  function showToast(msg, duration) {
    duration = duration || 1500;
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
    if (battle.roomRef) {
      battle.roomRef.child('rematch').off();
      if (battle.mySlot) battle.roomRef.child('rematch/' + battle.mySlot).remove();
    }
    if (battle.roomRef && battle.mySlot) {
      battle.roomRef.child(battle.mySlot).remove();
    }
    resetBattleState();
    showBattleLobby();
  };

  function showSettings() {
    function row(label, isOn, key) {
      return '<div class="settings-row" onclick="toggleSetting(\'' + key + '\')">' +
        '<span class="settings-row-label">' + label + '</span>' +
        '<div class="toggle-switch" style="pointer-events:none">' +
        '<span class="toggle-slider' + (isOn ? ' is-on' : '') + '"></span>' +
        '</div>' +
        '</div>';
    }
    openModal(
      '<button class="modal-close" onclick="closeModal()">' +
      '<svg xmlns="http://www.w3.org/2000/svg" height="20" viewBox="0 0 24 24" width="20" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>' +
      '</button>' +
      '<div class="modal-title">Settings</div>' +
      '<div class="modal-section"><h3>Practice &amp; Battle</h3>' +
      row('Unlimited guesses', dom.unlimitedToggle.checked, 'unlimited') +
      row('Allow duplicates', dom.duplicatesToggle.checked, 'duplicates') +
      '</div>' +
      '<button class="modal-btn btn-close" onclick="closeModal()">Done</button>'
    );
  }

  window.toggleSetting = function (key) {
    var input = key === 'unlimited' ? dom.unlimitedToggle : dom.duplicatesToggle;
    input.checked = !input.checked;
    input.dispatchEvent(new Event('change'));
    showSettings();
  };

  function showHelp() {
    openModal(
      '<button class="modal-close" onclick="closeModal()">' +
      '<svg xmlns="http://www.w3.org/2000/svg" height="20" viewBox="0 0 24 24" width="20" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>' +
      '</button>' +
      '<div class="modal-title">How To Play</div>' +
      '<div class="modal-section">' +
      '<p>Guess the secret <strong>3-digit number</strong> in 6 tries. All digits are unique (no repeats).</p>' +
      '<p style="margin-top:8px">After each guess, feedback dots reveal how close you are — but <em>not which digit</em> they refer to.</p>' +
      '</div>' +
      '<div style="border-top:1px solid var(--header-border);margin:12px 0"></div>' +
      '<div class="modal-section">' +
      '<h3>Feedback</h3>' +
      '<div class="help-example"><div class="help-dot g"></div><span>Correct digit in the correct position</span></div>' +
      '<div class="help-example"><div class="help-dot y"></div><span>Correct digit in the wrong position</span></div>' +
      '<div class="help-example"><div class="help-dot a"></div><span>Digit is not in the number</span></div>' +
      '</div>' +
      '<div style="border-top:1px solid var(--header-border);margin:12px 0"></div>' +
      '<div class="modal-section">' +
      '<h3>Example</h3>' +
      '<p>Secret: <strong>4 1 8</strong>&nbsp;&nbsp;|&nbsp;&nbsp;Guess: <strong>1 0 8</strong></p>' +
      '<div class="help-example" style="gap:6px;border-bottom:none">' +
      '<div class="help-dot g"></div><div class="help-dot y"></div><div class="help-dot a"></div>' +
      '<span style="margin-left:6px">1 correct, 1 misplaced, 1 absent</span>' +
      '</div>' +
      '</div>' +
      '<div style="border-top:1px solid var(--header-border);margin:12px 0"></div>' +
      '<div class="modal-section">' +
      '<h3>Modes</h3>' +
      '<p><strong>Daily</strong> — Same number for everyone. Resets at midnight.</p>' +
      '<p style="margin-top:4px"><strong>Practice</strong> — Unlimited random puzzles.</p>' +
      '<p style="margin-top:4px"><strong>Battle</strong> — Real-time multiplayer. Create or join a room, pick a secret number for your opponent, and take turns guessing. First to solve wins.</p>' +
      '<p style="margin-top:10px;font-size:13px;color:var(--text-dim)"><strong>Tip:</strong> Long-press a key to cross it out as scratch work.</p>' +
      '</div>' +
      '<button class="modal-btn btn-close" onclick="closeModal()">Close</button>'
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
    var title = won ? (titles[tries - 1] || 'Solved!') : 'Better luck next time';

    var digitHtml = '';
    secret.forEach(function (d) {
      digitHtml += '<div class="result-digit ' + (won ? 'rg' : 'rr') + '">' + d + '</div>';
    });

    var subtitle = won
      ? 'Solved in ' + tries + (game.mode === 'practice' && dom.unlimitedToggle.checked ? ' guesses' : '/' + MAX_GUESSES) + '&nbsp;&nbsp;&middot;&nbsp;&nbsp;' + timeStr
      : 'The number was';

    var nextPuzzle = '';
    if (game.mode === 'daily') {
      nextPuzzle =
        '<div style="border-top:1px solid var(--header-border);margin:16px 0"></div>' +
        '<div class="countdown">Next Nurdle<br><span id="countdown-timer">--:--:--</span></div>';
    }

    var puzzleNumHtml = game.mode === 'daily'
      ? '<p style="text-align:center;font-size:11px;letter-spacing:1.5px;color:var(--text-dim);text-transform:uppercase;margin-bottom:4px">Nurdle #' + game.puzzleNum + '</p>'
      : '';

    var buttons = '';
    if (won || game.mode === 'daily') {
      buttons += '<button class="modal-btn btn-share" onclick="shareResult()">' +
        '<svg xmlns="http://www.w3.org/2000/svg" height="18" viewBox="0 0 24 24" width="18" fill="currentColor" style="margin-right:8px"><path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92 1.61 0 2.92-1.31 2.92-2.92s-1.31-2.92-2.92-2.92z"/></svg>' +
        'Share</button>';
    }
    if (game.mode === 'practice') {
      buttons += '<button class="modal-btn btn-new" onclick="newPracticeGame()">New Game</button>';
    }

    openModal(
      '<button class="modal-close" onclick="closeModal()">' +
      '<svg xmlns="http://www.w3.org/2000/svg" height="20" viewBox="0 0 24 24" width="20" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>' +
      '</button>' +
      '<div class="modal-title">' + title + '</div>' +
      puzzleNumHtml +
      '<div class="result-number">' + digitHtml + '</div>' +
      '<p style="text-align:center;color:var(--text-dim);font-size:14px;margin-bottom:4px">' + subtitle + '</p>' +
      nextPuzzle + buttons
    );

    if (game.mode === 'daily') startNextPuzzleCountdown();
  }

  function showBattleResultModal(result) {
    var title, tagClass;
    if (result === 'win') { title = 'YOU WIN!'; tagClass = 'win-tag'; }
    else if (result === 'lose') { title = 'YOU LOSE'; tagClass = 'lose-tag'; }
    else { title = 'DRAW'; tagClass = 'draw-tag'; }

    var secret = game.secret;
    var digitHtml = '';
    secret.forEach(function (d) {
      digitHtml += '<div class="result-digit rb">' + d + '</div>';
    });

    var myText = game.won ? game.guesses.length : 'X';
    var oppText = battle.oppSolved ? battle.oppGuesses : 'X';
    var myScoreClass = result === 'win' ? 'win-score' : (result === 'lose' ? 'lose-score' : '');
    var oppScoreClass = result === 'lose' ? 'win-score' : (result === 'win' ? 'lose-score' : '');

    openModal(
      '<button class="modal-close" onclick="closeModal()">' +
      '<svg xmlns="http://www.w3.org/2000/svg" height="20" viewBox="0 0 24 24" width="20" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>' +
      '</button>' +
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
      '<button class="modal-btn btn-new" onclick="playAgain()">Play Again</button>' +
      '<button class="modal-btn btn-close" onclick="backToBattleLobby()">Leave Room</button>'
    );
  }

  function showStats() {
    var stats = loadStats();
    var pct = stats.gamesPlayed > 0 ? Math.round((stats.gamesWon / stats.gamesPlayed) * 100) : 0;
    var maxDist = Math.max.apply(null, stats.distribution.concat([1]));

    var distHtml = '';
    for (var i = 0; i < MAX_GUESSES; i++) {
      var w = Math.max(7, Math.round((stats.distribution[i] / maxDist) * 100));
      var hl = game.won && game.guesses.length === i + 1 ? ' highlight' : '';
      distHtml +=
        '<div class="dist-row">' +
        '<span>' + (i + 1) + '</span>' +
        '<div class="dist-bar' + hl + '" style="width:' + w + '%">' + stats.distribution[i] + '</div>' +
        '</div>';
    }

    openModal(
      '<button class="modal-close" onclick="closeModal()">' +
      '<svg xmlns="http://www.w3.org/2000/svg" height="20" viewBox="0 0 24 24" width="20" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>' +
      '</button>' +
      '<div class="modal-title">Statistics</div>' +
      '<div class="stat-row">' +
      '<div class="stat-item"><div class="stat-val">' + stats.gamesPlayed + '</div><div class="stat-label">Played</div></div>' +
      '<div class="stat-item"><div class="stat-val">' + pct + '</div><div class="stat-label">Win %</div></div>' +
      '<div class="stat-item"><div class="stat-val">' + stats.currentStreak + '</div><div class="stat-label">Current<br>Streak</div></div>' +
      '<div class="stat-item"><div class="stat-val">' + stats.maxStreak + '</div><div class="stat-label">Max<br>Streak</div></div>' +
      '</div>' +
      '<div style="border-top:1px solid var(--header-border);margin:12px 0"></div>' +
      '<div class="modal-section"><h3>Guess Distribution</h3>' + distHtml + '</div>' +
      '<button class="modal-btn btn-close" onclick="closeModal()">Close</button>'
    );
  }

  function showFirebaseSetup() {
    openModal(
      '<button class="modal-close" onclick="closeModal()">' +
      '<svg xmlns="http://www.w3.org/2000/svg" height="20" viewBox="0 0 24 24" width="20" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>' +
      '</button>' +
      '<div class="modal-title">Setup Required</div>' +
      '<div class="modal-section">' +
      '<p>Battle Mode needs Firebase (free) for real-time multiplayer.</p>' +
      '<p style="margin-top:12px"><strong>One-time setup:</strong></p>' +
      '<p style="margin-top:8px">1. Go to <strong>console.firebase.google.com</strong></p>' +
      '<p>2. Create a new project (disable Analytics)</p>' +
      '<p>3. Click <strong>Build → Realtime Database → Create Database</strong></p>' +
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
    var unlimited = game.mode === 'practice' && dom.unlimitedToggle.checked;
    var result = game.won ? game.guesses.length + (unlimited ? '' : '/' + MAX_GUESSES) : 'X/' + MAX_GUESSES;
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
      navigator.share({ text: text }).catch(function () { });
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
    if (document.activeElement === dom.roomCodeInput) return;
    if (e.key >= '0' && e.key <= '9') {
      inputDigit(parseInt(e.key, 10));
    } else if (e.key === 'Backspace' || e.key === 'Delete') {
      e.preventDefault();
      deleteDigit();
    } else if (e.key === 'Enter') {
      if (battle.secretChoosing) {
        dom.lockSecretBtn.click();
      } else {
        submitGuess();
      }
    }
  });

  // ================================================================
  //  EVENT LISTENERS
  // ================================================================
  dom.helpBtn.addEventListener('click', showHelp);
  dom.settingsBtn.addEventListener('click', showSettings);
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
        showToast('Code copied!');
      });
    }
  });

  dom.lockSecretBtn.addEventListener('click', function () {
    if (battle.customSecret.length < NUM_DIGITS) {
      showToast('Enter ' + NUM_DIGITS + ' digits');
      return;
    }
    battle.secretChoosing = false;
    dom.lockSecretBtn.textContent = 'WAITING...';
    dom.lockSecretBtn.disabled = true;

    var myData = {};
    myData[battle.mySlot + 'Secret'] = battle.customSecret.join('');
    battle.roomRef.update(myData).then(function () {
      listenForBothSecrets();
    });
  });

  dom.roomCodeInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') joinRoom();
  });

  dom.overlay.addEventListener('click', closeModal);

  dom.unlimitedToggle.addEventListener('change', function () {
    localStorage.setItem('nurdle_unlimited', dom.unlimitedToggle.checked ? '1' : '0');
    if (game.mode === 'practice' && !game.gameOver) {
      newGame('practice');
    }
  });

  dom.duplicatesToggle.addEventListener('change', function () {
    localStorage.setItem('nurdle_duplicates', dom.duplicatesToggle.checked ? '1' : '0');
    if (game.mode === 'practice' && !game.gameOver) {
      newGame('practice');
    }
  });


  // Load preferences
  dom.unlimitedToggle.checked = localStorage.getItem('nurdle_unlimited') === '1';
  dom.duplicatesToggle.checked = localStorage.getItem('nurdle_duplicates') === '1';

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