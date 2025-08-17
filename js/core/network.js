// js/core/network.js
import { getState, updateState } from './state.js';
import * as dom from './dom.js';
import { renderAll } from '../ui/ui-renderer.js';
import { renderPvpRooms, updateLobbyUi, addLobbyChatMessage } from '../ui/lobby-renderer.js';
import { showSplashScreen } from '../ui/splash-screen.js';
import { updateLog } from './utils.js';
import { playCard } from '../game-logic/player-actions.js';
import { advanceToNextPlayer } from '../game-logic/turn-manager.js';


export function connectToServer() {
    const SERVER_URL = "https://reversus-node.dke42d.easypanel.host";
    const socket = io(SERVER_URL, {
        reconnectionAttempts: 3,
        timeout: 10000,
    });
    updateState('socket', socket);

    socket.on('connect', () => {
        console.log('Conectado ao servidor com ID:', socket.id);
        updateState('clientId', socket.id);
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
        dom.pvpLobbyModal.classList.add('hidden');
        dom.appContainerEl.classList.remove('hidden');
        dom.debugButton.classList.remove('hidden');
        
        // O cliente agora usa o estado vindo do servidor, mas gera o tabuleiro localmente
        const clientGameState = {
            ...serverGameState,
            // A lógica de gerar o tabuleiro (generateBoardPaths) continua no cliente
            // para manter a complexidade visual separada do servidor.
            boardPaths: import('../game-logic/board.js').then(boardModule => boardModule.generateBoardPaths()),
            // Adicionar outros estados que são apenas do cliente aqui
            selectedCard: null,
            reversusTarget: null,
            pulaTarget: null,
        };

        updateState('gameState', clientGameState);
        
        // Determina qual 'player-id' este cliente controla
        const myPlayerInfo = roomData.players.find(p => p.id === getState().clientId);
        if(myPlayerInfo) {
            updateState('playerId', myPlayerInfo.playerId);
        }
        
        renderAll();
    });

    // Handlers para Ações Retransmitidas pelo Servidor
    socket.on('action:playCard', (data) => {
        const { gameState, playerId } = getState();
        // Apenas executa a ação se não for o jogador que a originou
        if (data.playerId !== playerId) {
            const player = gameState.players[data.playerId];
            const card = player.hand.find(c => c.id === data.cardId);
            if (player && card) {
                playCard(player, card, data.targetId, data.options?.type, data.options);
            }
        }
    });
    
    socket.on('action:endTurn', (data) => {
        const { gameState, playerId } = getState();
        // Apenas executa a ação se não for o jogador que a originou
        if (data.playerId !== playerId) {
            advanceToNextPlayer();
        }
    });
    
    socket.on('lobbyChatMessage', ({ speaker, message }) => {
        addLobbyChatMessage(speaker, message);
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

export function emitPlayCard({ cardId, targetId, options = {} }) {
    const { socket, playerId } = getState();
    if (socket && playerId) {
        // O cliente não executa mais a ação localmente primeiro para evitar desincronização.
        // Ele apenas envia a intenção para o servidor.
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
    
    // Apenas envia a intenção para o servidor
    socket.emit('endTurn', { playerId });
}
