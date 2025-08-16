// js/core/network.js
import { getState, updateState } from './state.js';
import * as dom from './dom.js';
import { renderAll } from '../ui/ui-renderer.js';
import { renderPvpRooms, updateLobbyUi, addLobbyChatMessage } from '../ui/lobby-renderer.js';
import { showSplashScreen } from '../ui/splash-screen.js';
import { updateLog } from './utils.js';

export function connectToServer() {
    // The 'io' object is available globally because we included the socket.io.js script in index.html
    const socket = io();
    updateState('socket', socket);

    socket.on('connect', () => {
        console.log('Connected to server with ID:', socket.id);
    });

    socket.on('connected', (data) => {
        updateState('clientId', data.clientId);
    });

    socket.on('roomList', (rooms) => {
        renderPvpRooms(rooms);
    });

    socket.on('roomCreated', (roomId) => {
        const { username } = getState();
        emitJoinRoom(roomId, username); // Automatically join the room you created
    });

    socket.on('lobbyUpdate', (roomData) => {
        updateState('currentRoomId', roomData.id);
        dom.pvpRoomListModal.classList.add('hidden');
        dom.pvpLobbyModal.classList.remove('hidden');
        updateLobbyUi(roomData);
    });
    
    socket.on('gameStarted', () => {
        dom.pvpLobbyModal.classList.add('hidden');
        dom.appContainerEl.classList.remove('hidden');
        dom.debugButton.classList.remove('hidden');
    });

    socket.on('gameStateUpdate', (newState) => {
        const { clientId } = getState();
        const myPlayerData = newState.players[newState.myPlayerId];
        
        // The server sends the player ID for this client. Store it.
        updateState('playerId', newState.myPlayerId);
        
        // The gamestate from the server becomes our local truth.
        updateState('gameState', newState);
        
        // Re-render the entire UI with the new, personalized state
        renderAll();
    });
    
    socket.on('chatMessage', ({ speaker, message }) => {
        updateLog({ type: 'dialogue', speaker, message: `${speaker}: "${message}"` });
    });
    
    socket.on('lobbyChatMessage', ({ speaker, message }) => {
        addLobbyChatMessage(speaker, message);
    });
    
    socket.on('kicked', (reason) => {
        alert(`Você foi desconectado da sala: ${reason}`);
        showSplashScreen();
    });
}

export function emitListRooms() {
    const { socket } = getState();
    if (socket) socket.emit('listRooms');
}

export function emitCreateRoom() {
    const { socket, username } = getState();
    if (socket) socket.emit('createRoom', username);
}

export function emitJoinRoom(roomId) {
    const { socket, username } = getState();
    if (socket) socket.emit('joinRoom', { roomId, username });
}

export function emitLeaveRoom() {
    const { socket, currentRoomId } = getState();
    if (socket && currentRoomId) {
        socket.emit('leaveRoom', currentRoomId);
        updateState('currentRoomId', null);
        updateState('gameState', null);
        dom.pvpLobbyModal.classList.add('hidden');
        dom.appContainerEl.classList.add('hidden');
        showSplashScreen();
    }
}

export function emitLobbyChat(message) {
    const { socket, currentRoomId } = getState();
    if(socket && currentRoomId) {
        socket.emit('lobbyChatMessage', { roomId: currentRoomId, message });
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
    
     // Client-side validation to prevent passing turn when it's not allowed
    const player = gameState.players[playerId];
    const valueCardsInHandCount = player.hand.filter(c => c.type === 'value' && !c.isHidden).length;
    const mustPlayValueCard = valueCardsInHandCount > 1 && !player.playedValueCardThisTurn;
    if (mustPlayValueCard) {
        alert("Você precisa jogar uma carta de valor neste turno!");
        return;
    }

    socket.emit('endTurn', playerId);
}
