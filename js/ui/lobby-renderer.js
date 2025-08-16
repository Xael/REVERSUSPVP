import * as dom from '../core/dom.js';
import { getState } from '../core/state.js';

export const renderPvpRooms = (rooms) => {
    dom.pvpRoomGridEl.innerHTML = rooms.map(room => {
        const isFull = room.playerCount >= 4;
        const colorClass = `color-${(parseInt(room.id, 10) % 4) + 1}`;
        return `
            <div class="room-card ${colorClass}">
                <h3>${room.name}</h3>
                <p>Jogadores: ${room.playerCount}/4</p>
                <p>Modo: ${room.mode}</p>
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

    // Update start game button
    // The game can start when there are at least 2 players
    const canStart = isHost && roomData.players.length >= 2;
    dom.lobbyStartGameButton.disabled = !canStart;
};

export const addLobbyChatMessage = (speaker, message) => {
    const messageEl = document.createElement('div');
    const sanitizedMessage = message.replace(/</g, "&lt;").replace(/>/g, "&gt;");
    messageEl.innerHTML = `<strong>${speaker}:</strong> ${sanitizedMessage}`;
    dom.lobbyChatHistoryEl.appendChild(messageEl);
    dom.lobbyChatHistoryEl.scrollTop = dom.lobbyChatHistoryEl.scrollHeight;
};