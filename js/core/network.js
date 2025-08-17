// js/core/network.js
import { getState, updateState } from './state.js';
import * as dom from './dom.js';
import { renderAll } from '../ui/ui-renderer.js';
import { renderPvpRooms, updateLobbyUi, addLobbyChatMessage } from '../ui/lobby-renderer.js';
import { showSplashScreen } from '../ui/splash-screen.js';
import { updateLog } from './utils.js';
import { playCard } from '../game-logic/player-actions.js';
import { advanceToNextPlayer } from '../game-logic/turn-manager.js';
import { generateBoardPaths } from '../game-logic/board.js';


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

        // O servidor envia o ID do jogador que este cliente controla
        updateState('playerId', serverGameState.myPlayerId);

        // O estado do cliente é o estado do servidor mais o tabuleiro (gerado localmente) e estados de UI
        const clientGameState = {
            ...serverGameState,
            boardPaths: generateBoardPaths(), // PvP usa um tabuleiro padrão
            // Estados específicos da UI do cliente
            selectedCard: null,
            reversusTarget: null,
            pulaTarget: null,
            dialogueState: { spokenLines: new Set() },
        };
        updateState('gameState', clientGameState);
        
        // Cria os contêineres para as áreas dos jogadores antes de renderizar
        const player1Container = document.getElementById('player-1-area-container');
        const opponentsContainer = document.getElementById('opponent-zones-container');
        const createPlayerAreaHTML = (id) => `<div class="player-area" id="player-area-${id}"></div>`;
        player1Container.innerHTML = createPlayerAreaHTML('player-1');
        opponentsContainer.innerHTML = clientGameState.playerIdsInGame.filter(id => id !== 'player-1').map(id => createPlayerAreaHTML(id)).join('');

        renderAll();

        // Anuncia o turno se for a vez do jogador humano
        if (clientGameState.currentPlayer === clientGameState.myPlayerId) {
            import('../ui/ui-renderer.js').then(uiRenderer => uiRenderer.showTurnIndicator());
        }
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
        // O cliente executa a ação localmente e envia para o servidor retransmitir
        const player = getState().gameState.players[playerId];
        const card = player.hand.find(c => c.id === cardId);
        playCard(player, card, targetId, options?.type, options);
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
    
    // Executa a ação localmente e envia para o servidor retransmitir
    advanceToNextPlayer();
    socket.emit('endTurn', { playerId });
}