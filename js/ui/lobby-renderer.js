import * as dom from '../core/dom.js';
import { getState } from '../core/state.js';

export const renderPvpRooms = (rooms) => {
    dom.pvpRoomGridEl.innerHTML = rooms.map(room => {
        const isFull = room.playerCount >= 4;
        const colorClass = `color-${(parseInt(room.id.slice(-1), 16) % 4) + 1}`;
        const modeMap = {
            'solo-2p': '2 Jogadores (1 vs 1)',
            'solo-3p': '3 Jogadores',
            'solo-4p': '4 Jogadores',
            'duo': 'Duplas (2 vs 2)',
        };
        return `
            <div class="room-card ${colorClass}">
                <h3>${room.name}</h3>
                <p>Jogadores: ${room.playerCount}/4</p>
                <p>Modo: ${modeMap[room.mode] || '4 Jogadores'}</p>
                <button class="control-button pvp-enter-room-button" data-room-id="${room.id}" ${isFull ? 'disabled' : ''}>
                    ${isFull ? 'Cheia' : 'Entrar'}
                </button>
            </div>
        `;
    }).join('');
};

export const updateLobbyUi = (roomData) => {
    const { clientId } = getState();
    const isHost = roomData.hostId === clientId;

    dom.lobbyTitle.textContent = `Lobby da Sala: ${roomData.name}`;

    // Render player slots
    const playerGrid = document.querySelector('.lobby-player-grid');
    playerGrid.innerHTML = ''; // Clear existing slots
    const playerSlots = ['player-1', 'player-2', 'player-3', 'player-4'];
    
    playerSlots.forEach((slot, index) => {
        const player = roomData.players[index];
        const slotEl = document.createElement('div');
        slotEl.className = 'lobby-player-slot';
        slotEl.id = `lobby-player-${index + 1}`;
        
        if (player) {
            const hostStar = player.id === roomData.hostId ? ' <span class="master-star">★</span>' : '';
            slotEl.innerHTML = `${player.username}${hostStar}`;
        } else {
            slotEl.textContent = 'Aguardando...';
        }
        playerGrid.appendChild(slotEl);
    });

    // Update game mode selector
    dom.lobbyGameModeEl.value = roomData.mode;
    dom.lobbyGameModeEl.disabled = !isHost;

    // Update start game button based on mode and player count
    const playerCount = roomData.players.length;
    let canStart = false;
    switch (roomData.mode) {
        case 'solo-2p':
            canStart = playerCount >= 2;
            break;
        case 'solo-3p':
            canStart = playerCount >= 3;
            break;
        case 'solo-4p':
        case 'duo':
            canStart = playerCount >= 4;
            break;
    }
    dom.lobbyStartGameButton.disabled = !(isHost && canStart);
};

export const addLobbyChatMessage = (speaker, message) => {
    const messageEl = document.createElement('div');
    const sanitizedMessage = message.replace(/</g, "&lt;").replace(/>/g, "&gt;");
    messageEl.innerHTML = `<strong>${speaker}:</strong> ${sanitizedMessage}`;
    dom.lobbyChatHistoryEl.appendChild(messageEl);
    dom.lobbyChatHistoryEl.scrollTop = dom.lobbyChatHistoryEl.scrollHeight;
};
