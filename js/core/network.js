// js/core/network.js
import { getState, updateState } from './state.js';
import * as dom from './dom.js';
import { renderAll } from '../ui/ui-renderer.js';
import { renderPvpRooms, updateLobbyUi, addLobbyChatMessage } from '../ui/lobby-renderer.js';
import { showSplashScreen } from '../ui/splash-screen.js';
import { updateLog } from './utils.js';
import { playCard } from '../game-logic/player-actions.js';
import { advanceToNextPlayer } from '../game-logic/turn-manager.js';
import { updateGameTimer } from '../game-controller.js';


export function connectToServer() {
    const SERVER_URL = "https://reversus-node.dke42d.easypanel.host";
    const socket = io(SERVER_URL, {
        reconnectionAttempts: 3,
        timeout: 10000,
    });
    updateState('socket', socket);

    socket.on('connect', () => {
        const clientId = socket.id;
        console.log('Conectado ao servidor com ID:', clientId);
        updateState('clientId', clientId);
        updateState('playerId', null); // Reset player ID on new connection
        updateState('currentRoomId', null);
    });
    
    socket.on('connect_error', (err) => {
        console.error("Falha na conexão:", err.message);
        if (!getState().connectionErrorShown) {
             alert("Falha ao conectar ao servidor PvP. Verifique se o servidor está rodando. O modo offline ainda funciona.");
             updateState('connectionErrorShown', true);
        }
        showSplashScreen();
    });

    socket.on('roomList', (rooms) => {
        renderPvpRooms(rooms);
    });

    socket.on('roomCreated', (roomId) => {
        emitJoinRoom(roomId); 
    });

    socket.on('lobbyUpdate', (roomData) => {
        updateState('currentRoomId', roomData.id);
        dom.pvpRoomListModal.classList.add('hidden');
        dom.pvpLobbyModal.classList.remove('hidden');
        updateLobbyUi(roomData);
    });
    
    socket.on('gameStarted', (serverGameState) => {
        dom.splashScreenEl.classList.add('hidden');
        dom.pvpLobbyModal.classList.add('hidden');
        dom.appContainerEl.classList.remove('hidden');
        dom.debugButton.classList.remove('hidden');

        // O servidor é a fonte da verdade. O cliente apenas adiciona estados locais.
        const myPlayerId = serverGameState.myPlayerId;
        updateState('playerId', myPlayerId);

        const clientGameState = {
            ...serverGameState, // Usa o estado completo do servidor
            selectedCard: null,
            reversusTarget: null,
            pulaTarget: null,
            dialogueState: { spokenLines: new Set() },
        };
        updateState('gameState', clientGameState);
        
        // Inicia o timer do jogo no cliente
        const state = getState();
        if (state.gameTimerInterval) clearInterval(state.gameTimerInterval);
        updateState('gameStartTime', Date.now());
        updateGameTimer();
        updateState('gameTimerInterval', setInterval(updateGameTimer, 1000));


        // --- LÓGICA DE PERSPECTIVA DO JOGADOR ---
        const playerIds = clientGameState.playerIdsInGame;
        const myIndex = playerIds.indexOf(myPlayerId);
        
        // Rotaciona a lista de jogadores para que o jogador atual sempre seja o primeiro
        const orderedPlayerIds = [...playerIds.slice(myIndex), ...playerIds.slice(0, myIndex)];

        const player1Container = document.getElementById('player-1-area-container');
        const opponentsContainer = document.getElementById('opponent-zones-container');
        const createPlayerAreaHTML = (id) => `<div class="player-area" id="player-area-${id}"></div>`;
        
        player1Container.innerHTML = createPlayerAreaHTML(orderedPlayerIds[0]);
        opponentsContainer.innerHTML = orderedPlayerIds.slice(1).map(id => createPlayerAreaHTML(id)).join('');

        renderAll();

        if (clientGameState.currentPlayer === myPlayerId) {
            import('../ui/ui-renderer.js').then(uiRenderer => uiRenderer.showTurnIndicator());
        }
    });

    socket.on('action:playCard', (data) => {
        const { gameState } = getState();
        const player = gameState.players[data.playerId];
        const card = player.hand.find(c => c.id === data.cardId);
        if (player && card) {
            playCard(player, card, data.targetId, data.options?.type, data.options);
        }
    });
    
    socket.on('action:endTurn', () => {
        advanceToNextPlayer();
    });
    
    socket.on('lobbyChatMessage', ({ speaker, message }) => {
        addLobbyChatMessage(speaker, message);
    });

    socket.on('playerDisconnected', ({ playerId, username }) => {
        const { gameState } = getState();
        if (!gameState) return;

        const player = gameState.players[playerId];
        if (player && !player.isEliminated) {
            player.isEliminated = true;
            updateLog(`${username} se desconectou e foi eliminado da partida.`);

            // Verifica se o jogo deve terminar
            const activePlayers = gameState.playerIdsInGame.filter(id => !gameState.players[id].isEliminated);
            if (activePlayers.length <= 1) {
                const winnerName = activePlayers.length === 1 ? gameState.players[activePlayers[0]].name : "Ninguém";
                import('../ui/ui-renderer.js').then(ui => ui.showGameOver(`${winnerName} venceu por W.O.!`));
            } else {
                // Se era a vez do jogador que caiu, passa o turno
                if (gameState.currentPlayer === playerId) {
                    advanceToNextPlayer();
                } else {
                    renderAll(); // Apenas atualiza a UI para mostrar o "X"
                }
            }
        }
    });

    socket.on('gameAborted', (data) => {
        alert(data.message || "Um jogador se desconectou. A partida foi encerrada.");
        updateState('currentRoomId', null);
        updateState('gameState', null);
        dom.appContainerEl.classList.add('hidden');
        showSplashScreen();
    });
    
    socket.on('error', (errorMessage) => {
        alert(`Erro do servidor: ${errorMessage}`);
    });
}

export function emitListRooms() {
    const { socket } = getState();
    if (socket) socket.emit('listRooms');
}

export function emitCreateRoom() {
    const { socket, username } = getState();
    if (socket && username) {
        socket.emit('createRoom', { username });
    }
}

export function emitJoinRoom(roomId) {
    const { socket, username } = getState();
    if (socket && username) {
        socket.emit('joinRoom', { roomId, username });
    }
}

export function emitLeaveRoom() {
    const { socket, currentRoomId } = getState();
    if (socket && currentRoomId) {
        socket.emit('leaveRoom');
        updateState('currentRoomId', null);
        updateState('gameState', null);
        dom.pvpLobbyModal.classList.add('hidden');
        dom.appContainerEl.classList.add('hidden');
        showSplashScreen();
    }
}

export function emitLobbyChat(message) {
    const { socket } = getState();
    if(socket) {
        socket.emit('lobbyChatMessage', message);
    }
}

export function emitChangeMode(mode) {
    const { socket } = getState();
    if (socket) {
        socket.emit('changeMode', mode);
    }
}

export function emitPlayCard({ cardId, targetId, options = {} }) {
    const { socket, playerId } = getState();
    if (socket && playerId) {
        socket.emit('playCard', { playerId, cardId, targetId, options });
    }
}

export function emitEndTurn() {
    const { socket, gameState, playerId } = getState();
    if (!socket || !gameState || gameState.currentPlayer !== playerId) return;
    
    const player = gameState.players[playerId];
    const valueCardsInHandCount = player.hand.filter(c => c.type === 'value').length;
    const mustPlayValueCard = valueCardsInHandCount > 1 && !player.playedValueCardThisTurn;
    if (mustPlayValueCard) {
        alert("Você precisa jogar uma carta de valor neste turno!");
        return;
    }
    
    socket.emit('endTurn', { playerId });
}