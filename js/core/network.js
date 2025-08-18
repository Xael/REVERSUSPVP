import { getState, updateState } from './state.js';
import * as dom from './dom.js';
import { renderAll, showGameOver } from '../ui/ui-renderer.js';
import { renderPvpRooms, updateLobbyUi, addLobbyChatMessage } from '../ui/lobby-renderer.js';
import { renderRankingModal } from '../ui/ranking-renderer.js';
import { showSplashScreen } from '../ui/splash-screen.js';
import { updateLog } from './utils.js';
import { updateGameTimer } from '../game-controller.js';
import { renderProfileModal } from '../ui/profile-renderer.js';

let socket;

export function connectToServer() {
    // A URL do seu servidor. Em produção, use a URL real.
    // Para desenvolvimento local, você pode usar "http://localhost:3000".
    const SERVER_URL = "https://reversus-node.dke42d.easypanel.host";
    
    if (socket && socket.connected) {
        return;
    }

    socket = io(SERVER_URL, {
        reconnectionAttempts: 3,
        timeout: 10000,
    });
    updateState('socket', socket);

    socket.on('connect', () => {
        const clientId = socket.id;
        console.log('Conectado ao servidor com ID:', clientId);
        updateState('clientId', clientId);
    });
    
    socket.on('connect_error', (err) => {
        console.error("Falha na conexão:", err.message);
        if (!getState().connectionErrorShown) {
             alert("Falha ao conectar ao servidor PvP. O modo online está indisponível.");
             updateState('connectionErrorShown', true); // Evita múltiplos alertas
        }
        showSplashScreen();
    });

    socket.on('loginSuccess', ({ user, rooms }) => {
        dom.profileButton.classList.remove('hidden'); // Mostra o botão de perfil
        dom.splashScreenEl.classList.add('hidden');
        dom.pvpRoomListModal.classList.remove('hidden');
        dom.pvpGreeting.textContent = `Bem-vindo, ${user.name}!`;
        renderPvpRooms(rooms);
    });
    
    socket.on('loginError', (message) => {
        alert(`Erro de login: ${message}`);
    });

    socket.on('rankingData', (ranking) => {
        renderRankingModal(ranking);
    });
    
    socket.on('profileData', (profile) => {
        renderProfileModal(profile);
    });

    socket.on('roomList', (rooms) => {
        renderPvpRooms(rooms);
    });

    socket.on('roomCreated', (roomId) => {
        emitJoinRoom(roomId); 
    });

    socket.on('lobbyUpdate', (roomData) => {
        updateState('currentRoomId', roomData.id);
        const myPlayerData = roomData.players.find(p => p.id === getState().clientId);
        if (myPlayerData) {
            updateState('playerId', myPlayerData.playerId);
        }
        dom.pvpRoomListModal.classList.add('hidden');
        dom.pvpLobbyModal.classList.remove('hidden');
        updateLobbyUi(roomData);
    });
    
    socket.on('gameStarted', () => {
        dom.splashScreenEl.classList.add('hidden');
        dom.pvpLobbyModal.classList.add('hidden');
        dom.appContainerEl.classList.remove('hidden');
        dom.debugButton.classList.remove('hidden');
        dom.chatInputArea.classList.remove('hidden');

        const state = getState();
        if (state.gameTimerInterval) clearInterval(state.gameTimerInterval);
        updateState('gameStartTime', Date.now());
        updateGameTimer();
        updateState('gameTimerInterval', setInterval(updateGameTimer, 1000));
    });

    socket.on('gameStateUpdate', (serverGameState) => {
        const { gameState, playerId } = getState();

        const localUiState = gameState ? {
            selectedCard: gameState.selectedCard,
            reversusTarget: gameState.reversusTarget,
            pulaTarget: gameState.pulaTarget,
        } : {};
        
        // O servidor agora não envia `myPlayerId`, então usamos o que já temos
        const myPlayerId = playerId || serverGameState.playerIdsInGame.find(pId => serverGameState.players[pId].name === getState().authenticatedUser?.name);
        
        const clientGameState = {
            ...serverGameState,
            ...localUiState,
            isPvp: true,
            dialogueState: { spokenLines: new Set() },
        };
        updateState('gameState', clientGameState);
        
        if (clientGameState.currentPlayer === myPlayerId && clientGameState.gamePhase === 'playing') {
             import('../ui/ui-renderer.js').then(uiRenderer => uiRenderer.showTurnIndicator());
        }
        renderAll();
    });

    socket.on('lobbyChatMessage', ({ speaker, message }) => {
        addLobbyChatMessage(speaker, message);
    });
    
    socket.on('chatMessage', ({ speaker, message }) => {
        updateLog({ type: 'dialogue', speaker, message });
    });

    socket.on('gameOver', (message) => {
        showGameOver(message, "Fim de Jogo!", { text: "Voltar ao Menu", action: "menu" });
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

export function emitAuthenticate(userData) {
    if (socket) socket.emit('authenticate', userData);
}

export function emitGetRanking() {
    if (socket) socket.emit('getRanking');
}

export function emitGetMyProfile() {
    if (socket) {
        const userData = JSON.parse(localStorage.getItem('reversus_user'));
        if (userData && userData.uuid) {
            socket.emit('getMyProfile', { uuid: userData.uuid });
        }
    }
}

export function emitListRooms() {
    if (socket) socket.emit('listRooms');
}

export function emitCreateRoom() {
    if (socket) socket.emit('createRoom');
}

export function emitJoinRoom(roomId) {
    if (socket) socket.emit('joinRoom', roomId);
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
    if(socket) socket.emit('lobbyChatMessage', message);
}

export function emitChatMessage(message) {
    if (socket) socket.emit('chatMessage', message);
}

export function emitChangeMode(mode) {
    if (socket) socket.emit('changeMode', mode);
}

export function emitPlayCard({ cardId, targetId, options = {} }) {
    if (socket) socket.emit('playCard', { cardId, targetId, options });
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