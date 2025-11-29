class OnlineMinesGame {
    constructor() {
        this.socket = null;
        this.playerId = this.generatePlayerId();
        this.playerName = this.generatePlayerName();
        this.players = new Map();
        this.currentRoundPlayers = new Map();
        this.userBalance = 10;
        this.currentPlayerCell = null;
        this.currentBet = 0;
        
        this.gameState = {
            isRoundActive: false,
            roundStartTime: 0,
            roundEndTime: 0,
            roundNumber: 1,
            serverTimeOffset: 0
        };

        this.currentRoundId = null;
        this.lastRoundState = null;

        this.stats = {
            gamesPlayed: 0,
            wins: 0,
            losses: 0,
            totalWagered: 0
        };

        this.timers = {
            ui: null,
            offline: null
        };

        this.SERVER_URLS = [
            'https://6af5be2fb9e95a.lhr.life', // ← НОВАЯ ССЫЛКА
        ];
        this.init();
    }

    generatePlayerId() {
        const savedId = localStorage.getItem('player_id');
        if (savedId) return savedId;
        
        const newId = 'player_' + Math.random().toString(36).substr(2, 9);
        localStorage.setItem('player_id', newId);
        return newId;
    }

    generatePlayerName() {
        const savedName = localStorage.getItem('player_name');
        if (savedName) return savedName;
        
        const names = ['Алексей', 'Мария', 'Дмитрий', 'Анна', 'Сергей', 'Ольга', 'Иван', 'Елена'];
        const newName = names[Math.floor(Math.random() * names.length)] + Math.floor(Math.random() * 1000);
        localStorage.setItem('player_name', newName);
        return newName;
    }

    getServerTime() {
        return Date.now() + this.gameState.serverTimeOffset;
    }

    async init() {
        this.createGrid();
        this.setupEventListeners();
        this.loadFromStorage();
        
        if (this.loadRoundState()) {
            this.createGrid();
            this.updateUI();
            if (this.gameState.isRoundActive) {
                this.startRoundAnimations();
            }
        }
        
        await this.connectToServer();
        this.startUIUpdate();
    }

    async connectToServer() {
        try {
            console.log('🔄 Подключение к серверу...');
            
            let connected = false;
            
            for (const url of this.SERVER_URLS) {
                try {
                    console.log(`🔄 Пробуем подключиться к: ${url}`);
                    this.socket = io(url, {
                        timeout: 5000,
                        transports: ['websocket', 'polling']
                    });
                    
                    await new Promise((resolve, reject) => {
                        this.socket.once('connect', resolve);
                        this.socket.once('connect_error', reject);
                        setTimeout(() => reject(new Error('Timeout')), 5000);
                    });
                    
                    console.log(`✅ Успешно подключено к: ${url}`);
                    connected = true;
                    break;
                    
                } catch (error) {
                    console.log(`❌ Не удалось подключиться к ${url}:`, error.message);
                    if (this.socket) {
                        this.socket.disconnect();
                        this.socket = null;
                    }
                }
            }
            
            if (!connected) {
                throw new Error('Не удалось подключиться ни к одному серверу');
            }

            this.setupSocketHandlers();
            
        } catch (error) {
            console.error('❌ Ошибка подключения:', error);
            this.showConnectionStatus(false);
            this.startOfflineMode();
        }
    }

    setupSocketHandlers() {
        this.socket.on('connect', () => {
            console.log('✅ Подключено к серверу');
            this.showConnectionStatus(true);
            
            this.socket.emit('player_join', {
                id: this.playerId,
                name: this.playerName,
                balance: this.userBalance
            });
        });

        this.socket.on('online_players', (players) => {
            console.log('👥 Получен список онлайн игроков:', players);
            this.players = new Map(players);
            this.updateOnlineCounter();
            this.updatePlayersList();
        });

        this.socket.on('player_joined', (player) => {
            console.log('👤 Новый игрок присоединился:', player);
            this.players.set(player.id, player);
            this.updateOnlineCounter();
            this.updatePlayersList();
            this.showPlayerJoinAnimation(player.name);
        });

        this.socket.on('player_left', (playerId) => {
            console.log('👋 Игрок вышел:', playerId);
            this.players.delete(playerId);
            this.currentRoundPlayers.delete(playerId);
            this.updateOnlineCounter();
            this.updatePlayersList();
        });

        this.socket.on('player_bet', (betData) => {
            console.log('🎯 Ставка игрока:', betData);
            this.handlePlayerBet(betData);
        });

        this.socket.on('game_state', (state) => {
            console.log('🎮 Получено состояние игры:', state);
            this.updateGameState(state);
        });

        this.socket.on('round_start', (roundData) => {
            console.log('🎯 Начало раунда:', roundData);
            this.handleRoundStart(roundData);
        });

        this.socket.on('round_result', (result) => {
            console.log('📊 Результат раунда:', result);
            this.handleRoundResult(result);
        });

        this.socket.on('error', (error) => {
            console.error('❌ Ошибка сервера:', error);
            this.showNotification('Ошибка: ' + error.message, 'error');
        });

        this.socket.on('disconnect', () => {
            console.log('❌ Отключено от сервера');
            this.showConnectionStatus(false);
        });
    }

    updateOnlineCounter() {
        const onlineCount = this.players.size;
        console.log('📊 Обновляем онлайн счетчик:', onlineCount, 'игроков');
        
        const onlineCountElement = document.getElementById('onlineCount');
        const globalOnlineElement = document.getElementById('globalOnline');
        
        if (onlineCountElement) {
            onlineCountElement.textContent = onlineCount;
            onlineCountElement.style.animation = 'celebrate 0.6s ease-out';
            setTimeout(() => {
                onlineCountElement.style.animation = '';
            }, 600);
        }
        
        if (globalOnlineElement) {
            globalOnlineElement.textContent = onlineCount;
        }
    }

    updatePlayersList() {
        const list = document.getElementById('playersList');
        if (!list) {
            console.log('❌ Элемент playersList не найден');
            return;
        }
        
        console.log('📝 Обновляем список игроков:', this.players.size, 'игроков');
        
        if (this.players.size === 0) {
            list.innerHTML = '<div class="empty-state">Нет игроков онлайн</div>';
            return;
        }
        
        let html = '';
        this.players.forEach((player, playerId) => {
            const isYou = playerId === this.playerId;
            const inRound = this.currentRoundPlayers.has(playerId);
            const betInfo = inRound ? this.currentRoundPlayers.get(playerId) : null;
            
            html += `
                <div class="player-item ${isYou ? 'user' : ''}">
                    <div class="player-name">
                        ${player.name} ${isYou ? '<span style="color: var(--success);">(Вы)</span>' : ''}
                    </div>
                    <div class="player-bet">
                        ${inRound ? '🎯 ' + betInfo.bet + ' TON' : '⏳ ожидает'}
                    </div>
                    <div class="player-cell">
                        ${inRound ? '🔢 ' + betInfo.cell : ''}
                    </div>
                </div>
            `;
        });
        
        list.innerHTML = html;
    }

    showPlayerJoinAnimation(playerName) {
        this.showNotification(`👤 ${playerName} присоединился`, 'info');
    }

    showBetPlacedAnimation(bet, cell) {
        this.showNotification(`🎯 Ставка ${bet} TON на ячейку ${cell}`, 'success');
    }

    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        const bgColor = type === 'error' ? 'rgba(255, 68, 68, 0.9)' : 
                        type === 'success' ? 'rgba(0, 255, 136, 0.9)' : 
                        'rgba(0, 170, 255, 0.9)';
        
        notification.style.cssText = `
            position: fixed;
            top: 20%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: ${bgColor};
            color: white;
            padding: 12px 24px;
            border-radius: 25px;
            font-weight: bold;
            z-index: 1000;
            animation: fadeInOut 2s ease-in-out;
            font-size: 14px;
            text-align: center;
            backdrop-filter: blur(10px);
            border: 1px solid rgba(255,255,255,0.2);
            box-shadow: 0 4px 20px rgba(0,0,0,0.3);
        `;
        notification.textContent = message;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            if (document.body.contains(notification)) {
                document.body.removeChild(notification);
            }
        }, 2000);
    }

    calculateServerTimeOffset(serverTime) {
        this.gameState.serverTimeOffset = serverTime - Date.now();
        console.log('⏰ Синхронизация времени с сервером:', this.gameState.serverTimeOffset + 'ms');
    }

    saveRoundState() {
        const roundState = {
            roundId: this.currentRoundId,
            isRoundActive: this.gameState.isRoundActive,
            startTime: this.gameState.roundStartTime,
            endTime: this.gameState.roundEndTime,
            roundNumber: this.gameState.roundNumber,
            serverTimeOffset: this.gameState.serverTimeOffset,
            saveTime: Date.now()
        };
        localStorage.setItem('current_round_state', JSON.stringify(roundState));
    }

    loadRoundState() {
        const saved = localStorage.getItem('current_round_state');
        if (saved) {
            try {
                const state = JSON.parse(saved);
                const now = Date.now();
                
                if (now - state.saveTime < 30000) {
                    this.currentRoundId = state.roundId;
                    this.gameState.isRoundActive = state.isRoundActive;
                    this.gameState.roundStartTime = state.startTime;
                    this.gameState.roundEndTime = state.endTime;
                    this.gameState.roundNumber = state.roundNumber;
                    this.gameState.serverTimeOffset = state.serverTimeOffset;
                    
                    console.log('🔄 Восстановлено состояние раунда');
                    return true;
                } else {
                    localStorage.removeItem('current_round_state');
                }
            } catch (e) {
                console.error('Ошибка загрузки состояния:', e);
            }
        }
        return false;
    }

    startRoundAnimations() {
        const cells = document.querySelectorAll('.cell');
        cells.forEach((cell, index) => {
            const delay = index * 100 + Math.random() * 200;
            
            setTimeout(() => {
                cell.style.animation = 'pulse-glow 2s infinite';
            }, delay);
        });

        this.startTimerAnimation();
    }

    startTimerAnimation() {
        const timerElement = document.getElementById('roundTimer');
        if (timerElement) {
            timerElement.style.animation = 'timer-pulse 1s infinite alternate';
        }
    }

    updateGameState(state) {
        this.gameState = { ...this.gameState, ...state };
        this.updateUI();
    }

    handleRoundStart(roundData) {
        console.log('🎯 Обработка начала раунда');
        
        this.calculateServerTimeOffset(roundData.serverTime);
        
        this.gameState.isRoundActive = true;
        this.gameState.roundStartTime = roundData.startTime;
        this.gameState.roundEndTime = roundData.endTime;
        this.gameState.roundNumber = roundData.roundNumber;
        this.currentRoundId = roundData.roundId;
        
        this.currentRoundPlayers.clear();
        
        this.saveRoundState();
        
        this.createGrid();
        this.updateUI();
        this.startRoundAnimations();
        
        this.showNotification(`🎯 Начался раунд #${roundData.roundNumber}`, 'info');
    }

    handleRoundResult(result) {
        console.log('📊 Обработка результатов раунда');
        this.gameState.isRoundActive = false;
        
        localStorage.removeItem('current_round_state');
        
        this.processRoundResult(result);
        this.showRoundResults(result);
    }

    handlePlayerBet(betData) {
        console.log('🎯 Обработка ставки:', betData);
        this.currentRoundPlayers.set(betData.playerId, betData);
        this.updatePlayersList();
        
        if (betData.playerId === this.playerId) {
            this.userBalance -= betData.bet;
            this.currentBet = betData.bet;
            this.currentPlayerCell = betData.cell;
            
            const betButton = document.querySelector('.place-bet-btn');
            if (betButton) {
                betButton.classList.add('bet-placed');
                setTimeout(() => {
                    betButton.classList.remove('bet-placed');
                }, 300);
            }
            
            this.showBetPlacedAnimation(betData.bet, betData.cell);
        }
        
        this.updateUI();
    }

    processRoundResult(result) {
        const userBet = this.currentRoundPlayers.get(this.playerId);
        if (!userBet) return;

        this.stats.gamesPlayed++;
        this.stats.totalWagered += userBet.bet;

        const isWinner = userBet.cell !== result.mineCell;
        
        if (isWinner) {
            const winAmount = userBet.bet * 1.45;
            this.userBalance += winAmount;
            this.stats.wins++;
            console.log('🎉 Вы выиграли:', winAmount);
        } else {
            this.stats.losses++;
            console.log('💥 Вы проиграли:', userBet.bet);
        }

        this.currentBet = 0;
        this.currentPlayerCell = null;
        this.updateStatsUI();
        this.saveToStorage();
    }

    showRoundResults(result) {
        this.highlightCells(result.mineCell);
        
        const userBet = this.currentRoundPlayers.get(this.playerId);
        if (!userBet) {
            setTimeout(() => {
                this.createGrid();
            }, 3000);
            return;
        }

        const isWinner = userBet.cell !== result.mineCell;
        
        setTimeout(() => {
            this.showResultsAnimation(isWinner, userBet.bet);
        }, 2000);
    }

    showResultsAnimation(isWinner, betAmount) {
        const animation = document.getElementById('resultsAnimation');
        const content = document.getElementById('animationContent');
        
        if (!animation || !content) return;
        
        if (isWinner) {
            const winAmount = (betAmount * 0.45).toFixed(2);
            content.innerHTML = `
                <div class="win-animation">🎉</div>
                <div class="result-text">ВЫ ВЫИГРАЛИ!</div>
                <div class="result-amount win-amount">+${winAmount} TON</div>
                <div class="auto-close-notice">Следующий раунд через 5 секунд</div>
            `;
        } else {
            content.innerHTML = `
                <div class="lose-animation">💥</div>
                <div class="result-text">ВЫ ПРОИГРАЛИ</div>
                <div class="result-amount lose-amount">-${betAmount} TON</div>
                <div class="auto-close-notice">Следующий раунд через 5 секунд</div>
            `;
        }
        
        animation.classList.add('active');
        
        setTimeout(() => {
            animation.classList.remove('active');
            this.createGrid();
        }, 5000);
    }

    startUIUpdate() {
        this.timers.ui = setInterval(() => {
            this.updateUI();
        }, 100);
    }

    updateUI() {
        const userBalanceElement = document.getElementById('userBalance');
        if (userBalanceElement) {
            userBalanceElement.textContent = `${this.userBalance.toFixed(1)} TON`;
        }

        const profileBalanceElement = document.getElementById('profileBalance');
        if (profileBalanceElement) {
            profileBalanceElement.textContent = `${this.userBalance.toFixed(1)} TON`;
        }

        const timerElement = document.getElementById('roundTimer');
        const roundNumberElement = document.getElementById('roundNumber');
        
        if (timerElement && roundNumberElement) {
            if (this.gameState.isRoundActive) {
                const now = this.getServerTime();
                const timeLeft = Math.max(0, Math.floor((this.gameState.roundEndTime - now) / 1000));
                
                timerElement.textContent = `${timeLeft}с`;
                roundNumberElement.textContent = this.gameState.roundNumber;
                
                if (timeLeft <= 5) {
                    timerElement.style.color = 'var(--accent)';
                    timerElement.style.animation = 'emergency-pulse 0.5s infinite';
                } else if (timeLeft <= 10) {
                    timerElement.style.color = 'var(--warning)';
                    timerElement.style.animation = 'timer-pulse 0.8s infinite alternate';
                } else {
                    timerElement.style.color = 'var(--success)';
                    timerElement.style.animation = 'timer-pulse 1.5s infinite alternate';
                }
            } else {
                timerElement.textContent = 'ожидание...';
                timerElement.style.color = 'var(--text-secondary)';
                timerElement.style.animation = '';
                roundNumberElement.textContent = this.gameState.roundNumber;
            }
        }

        const playersInRoundElement = document.getElementById('playersInRound');
        if (playersInRoundElement) {
            const count = this.currentRoundPlayers.size;
            playersInRoundElement.textContent = count;
            
            if (count > parseInt(playersInRoundElement.dataset.lastCount || 0)) {
                playersInRoundElement.style.animation = 'celebrate 0.6s ease-out';
                setTimeout(() => {
                    playersInRoundElement.style.animation = '';
                }, 600);
            }
            playersInRoundElement.dataset.lastCount = count;
        }

        const activeGamesElement = document.getElementById('activeGames');
        if (activeGamesElement) {
            activeGamesElement.textContent = this.gameState.isRoundActive ? '1' : '0';
        }
    }

    createGrid() {
        const grid = document.getElementById('gameGrid');
        if (!grid) return;
        
        grid.innerHTML = '';
        
        for (let i = 1; i <= 9; i++) {
            const cell = document.createElement('div');
            cell.className = 'cell';
            cell.innerHTML = `<span>${i}</span>`;
            cell.dataset.cell = i;
            cell.addEventListener('click', () => this.selectCell(i));
            grid.appendChild(cell);
        }
        
        this.updateCellSelectionUI();
    }

    selectCell(cellNumber) {
        if (this.gameState.isRoundActive) {
            this.showNotification('Раунд уже начался! Дождитесь следующего.', 'error');
            return;
        }
        
        this.currentPlayerCell = cellNumber;
        this.updateCellSelectionUI();
    }

    updateCellSelectionUI() {
        const selectedCellElement = document.getElementById('selectedCell');
        if (selectedCellElement) {
            selectedCellElement.textContent = this.currentPlayerCell ? this.currentPlayerCell : '-';
        }
        
        document.querySelectorAll('.cell').forEach(cell => {
            const cellNum = parseInt(cell.dataset.cell);
            const isSelected = cellNum === this.currentPlayerCell;
            cell.classList.toggle('selected', isSelected);
            
            if (isSelected) {
                cell.style.animation = 'selected-pulse 1.5s infinite';
            } else {
                cell.style.animation = '';
            }
        });
    }

    placeBet() {
        if (!this.gameState.isRoundActive) {
            this.showNotification('Раунд еще не начался! Подождите начала следующего раунда.', 'error');
            return;
        }
        
        const betInput = document.getElementById('playerBet');
        const bet = parseInt(betInput.value);
        
        if (!bet || bet < 1) {
            this.showNotification('Введите корректную ставку (от 1 TON)', 'error');
            return;
        }
        
        if (bet > this.userBalance) {
            this.showNotification('Недостаточно средств на балансе', 'error');
            return;
        }
        
        if (!this.currentPlayerCell) {
            this.showNotification('Выберите ячейку для ставки', 'error');
            return;
        }
        
        if (this.socket && this.socket.connected) {
            this.socket.emit('place_bet', {
                playerId: this.playerId,
                bet: bet,
                cell: this.currentPlayerCell
            });
        } else {
            this.showNotification('Нет подключения к серверу', 'error');
        }
        
        betInput.value = '';
        this.updateUI();
    }

    highlightCells(mineCell) {
        document.querySelectorAll('.cell').forEach(cell => {
            const cellNum = parseInt(cell.dataset.cell);
            cell.classList.remove('selected');
            cell.classList.add('revealing');
            
            setTimeout(() => {
                if (cellNum === mineCell) {
                    cell.classList.add('mine');
                    cell.innerHTML = '💣<br><small>' + cellNum + '</small>';
                } else {
                    cell.classList.add('safe');
                    cell.innerHTML = '💰<br><small>' + cellNum + '</small>';
                }
                
                setTimeout(() => {
                    cell.classList.remove('revealing');
                }, 600);
            }, 100);
        });
    }

    updateStatsUI() {
        document.getElementById('playerId').textContent = this.playerId.substring(0, 8) + '...';
        document.getElementById('profileBalance').textContent = `${this.userBalance.toFixed(1)} TON`;
        document.getElementById('gamesPlayed').textContent = this.stats.gamesPlayed;
        document.getElementById('winsCount').textContent = this.stats.wins;
        document.getElementById('lossesCount').textContent = this.stats.losses;
        document.getElementById('totalWagered').textContent = this.stats.totalWagered;
        
        const winRate = this.stats.gamesPlayed > 0 ? (this.stats.wins / this.stats.gamesPlayed * 100).toFixed(1) : 0;
        document.getElementById('winRate').textContent = `${winRate}%`;
    }

    showConnectionStatus(connected) {
        const statusElement = document.getElementById('connectionStatus');
        if (statusElement) {
            const indicator = statusElement.querySelector('.connection-indicator');
            const text = statusElement.querySelector('span');
            
            if (connected) {
                indicator.className = 'connection-indicator connected';
                text.textContent = 'Подключено к серверу';
                statusElement.style.display = 'flex';
                
                setTimeout(() => {
                    statusElement.style.display = 'none';
                }, 3000);
            } else {
                indicator.className = 'connection-indicator disconnected';
                text.textContent = 'Нет подключения';
                statusElement.style.display = 'flex';
            }
        }
    }

    saveToStorage() {
        const gameData = {
            stats: this.stats,
            userBalance: this.userBalance,
            playerId: this.playerId,
            playerName: this.playerName
        };
        localStorage.setItem('mines_game_data', JSON.stringify(gameData));
    }

    loadFromStorage() {
        const saved = localStorage.getItem('mines_game_data');
        if (saved) {
            try {
                const data = JSON.parse(saved);
                this.stats = data.stats || this.stats;
                this.userBalance = data.userBalance || this.userBalance;
                this.playerId = data.playerId || this.playerId;
                this.playerName = data.playerName || this.playerName;
                this.updateStatsUI();
                this.updateUI();
            } catch (e) {
                console.error('Ошибка загрузки данных:', e);
            }
        }
    }

    startOfflineMode() {
        console.log('🔌 Запуск в оффлайн режиме');
        
        this.players.set('bot_1', { id: 'bot_1', name: 'Бот_Иван', balance: 50 });
        this.players.set('bot_2', { id: 'bot_2', name: 'Бот_Мария', balance: 30 });
        this.players.set('bot_3', { id: 'bot_3', name: 'Бот_Алексей', balance: 25 });
        
        this.updateOnlineCounter();
        this.updatePlayersList();
        
        this.timers.offline = setInterval(() => {
            if (this.gameState.isRoundActive && Math.random() > 0.7) {
                const botIds = Array.from(this.players.keys()).filter(id => id !== this.playerId);
                if (botIds.length > 0) {
                    const randomBot = botIds[Math.floor(Math.random() * botIds.length)];
                    const botBet = {
                        playerId: randomBot,
                        playerName: this.players.get(randomBot).name,
                        bet: Math.floor(Math.random() * 5) + 1,
                        cell: Math.floor(Math.random() * 9) + 1
                    };
                    
                    this.handlePlayerBet(botBet);
                }
            }
        }, 3000);
    }

    setupEventListeners() {
        document.querySelectorAll('.quick-bet').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const bet = parseInt(e.target.dataset.bet);
                document.getElementById('playerBet').value = bet;
            });
        });
        
        document.addEventListener('touchmove', (e) => {
            e.preventDefault();
        }, { passive: false });
        
        document.addEventListener('wheel', (e) => {
            e.preventDefault();
        }, { passive: false });
    }

    // Метод для обновления URL сервера (ВОТ ЗДЕСЬ МЕНЯЙ ССЫЛКУ!)
    updateServerUrl(newUrl) {
        this.SERVER_URLS = [newUrl, ...this.SERVER_URLS.slice(1)];
        console.log('🔄 Обновлен URL сервера:', newUrl);
        
        if (this.socket) {
            this.socket.disconnect();
        }
        
        this.connectToServer();
    }
}

let game;

function switchScreen(screenId) {
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
    });
    
    document.getElementById(screenId).classList.add('active');
    
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    document.querySelector(`[data-screen="${screenId}"]`).classList.add('active');
    
    if (screenId === 'profileScreen') {
        game.updateStatsUI();
    }
}

function placeBet() {
    game.placeBet();
}

function resetStats() {
    if (confirm('Вы уверены, что хотите сбросить статистику?')) {
        game.stats = {
            gamesPlayed: 0,
            wins: 0,
            losses: 0,
            totalWagered: 0
        };
        game.updateStatsUI();
        game.saveToStorage();
        game.showNotification('Статистика сброшена', 'success');
    }
}

function resetGame() {
    if (confirm('Вы уверены, что хотите начать новую игру? Весь прогресс будет сброшен.')) {
        game.userBalance = 10;
        game.stats = {
            gamesPlayed: 0,
            wins: 0,
            losses: 0,
            totalWagered: 0
        };
        game.updateStatsUI();
        game.updateUI();
        game.saveToStorage();
        game.showNotification('Новая игра начата', 'success');
    }
}

function exportData() {
    const data = {
        playerId: game.playerId,
        playerName: game.playerName,
        stats: game.stats,
        balance: game.userBalance,
        exportTime: new Date().toISOString()
    };
    
    const dataStr = JSON.stringify(data, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `mines_game_data_${game.playerId}.json`;
    a.click();
    
    URL.revokeObjectURL(url);
    game.showNotification('Данные экспортированы в файл!', 'success');
}

// Функция для смены сервера (ВЫЗЫВАЙ ЭТУ ФУНКЦИЮ КОГДА ПОЛУЧАЕШЬ НОВУЮ ССЫЛКУ)
function changeServerUrl(newUrl) {
    if (game) {
        game.updateServerUrl(newUrl);
    } else {
        console.log('❌ Игра еще не инициализирована');
    }
}

document.addEventListener('DOMContentLoaded', function() {
    game = new OnlineMinesGame();
    
    window.placeBet = placeBet;
    window.switchScreen = switchScreen;
    window.resetStats = resetStats;
    window.resetGame = resetGame;
    window.exportData = exportData;
    window.changeServerUrl = changeServerUrl; // Добавляем функцию в глобальную область
});
