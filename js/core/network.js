// js/core/network.js
import { getState, updateState } from './state.js';
import * as dom from './dom.js';
import { renderAll, showGameOver } from './ui-renderer.js';
import { renderPvpRooms, updateLobbyUi, addLobbyChatMessage } from '../ui/lobby-renderer.js';
import { showSplashScreen } from '../ui/splash-screen.js';
import { updateLog } from './utils.js';
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
        dom.chatInputArea.classList.remove('hidden');

        // The server is the source of truth. We just need to add local UI state.
        const myPlayerId = serverGameState.myPlayerId;
        updateState('playerId', myPlayerId);

        const clientGameState = {
            ...serverGameState,
            isPvp: true, // Mark this as a PvP game
            selectedCard: null,
            reversusTarget: null,
            pulaTarget: null,
            dialogueState: { spokenLines: new Set() },
        };
        updateState('gameState', clientGameState);
        
        const state = getState();
        if (state.gameTimerInterval) clearInterval(state.gameTimerInterval);
        updateState('gameStartTime', Date.now());
        updateGameTimer();
        updateState('gameTimerInterval', setInterval(updateGameTimer, 1000));
        
        // --- PLAYER PERSPECTIVE LOGIC ---
        const playerIds = clientGameState.playerIdsInGame;
        const myIndex = playerIds.indexOf(myPlayerId);
        
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

    socket.on('gameStateUpdate', (newServerState) => {
        const { gameState, playerId } = getState();
        if (!gameState) return; // Don't update if not in a game

        // Preserve local UI state while updating with authoritative game state
        const localState = {
            selectedCard: gameState.selectedCard,
            reversusTarget: gameState.reversusTarget,
            pulaTarget: gameState.pulaTarget,
        };

        const updatedGameState = {
            ...newServerState,
            ...localState,
            isPvp: true,
            myPlayerId: playerId // Ensure myPlayerId persists
        };

        updateState('gameState', updatedGameState);
        renderAll();

        // Show turn indicator if it's now my turn
        if (updatedGameState.currentPlayer === playerId && updatedGameState.gamePhase === 'playing') {
             import('../ui/ui-renderer.js').then(uiRenderer => uiRenderer.showTurnIndicator());
        }
    });
    
    socket.on('lobbyChatMessage', ({ speaker, message }) => {
        addLobbyChatMessage(speaker, message);
    });
    
    socket.on('chatMessage', ({ speaker, message }) => {
        updateLog({ type: 'dialogue', speaker, message });
    });

    socket.on('playerDisconnected', ({ playerId, username }) => {
        const { gameState } = getState();
        if (!gameState) return;

        const player = gameState.players[playerId];
        if (player && !player.isEliminated) {
            player.isEliminated = true;
            updateLog(`${username} se desconectou e foi eliminado da partida.`);

            // The server will handle game over logic. The client just needs to render the change.
            renderAll();
        }
    });

    socket.on('gameOver', (message) => {
        showGameOver(message, "Fim de Jogo!", { text: "Voltar ao Lobby", action: "menu" });
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

export function emitChatMessage(message) {
    const { socket } = getState();
    if (socket) {
        socket.emit('chatMessage', message);
    }
}

export function emitChangeMode(mode) {
    const { socket } = getState();
    if (socket) {
        socket.emit('changeMode', mode);
    }
}

export function emitPlayCard({ cardId, targetId, options = {} }) {
    const { socket } = getState();
    if (socket) {
        socket.emit('playCard', { cardId, targetId, options });
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
    
    socket.emit('endTurn');
}