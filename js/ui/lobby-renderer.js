import * as dom from '../core/dom.js';
import { getState } from '../core/state.js';

export const renderRanking = (rankingData) => {
    if (!rankingData) {
        dom.rankingContainer.innerHTML = '<p>Não foi possível carregar o ranking.</p>';
        return;
    }
    if (rankingData.length === 0) {
        dom.rankingContainer.innerHTML = '<p>O ranking ainda está vazio. Seja o primeiro a vencer!</p>';
        return;
    }

    const tableHTML = `
        <table>
            <thead>
                <tr>
                    <th>#</th>
                    <th colspan="2">Jogador</th>
                    <th>Vitórias</th>
                </tr>
            </thead>
            <tbody>
                ${rankingData.map((player, index) => `
                    <tr>
                        <td class="rank-position">${index + 1}</td>
                        <td><img src="${player.avatar_url}" alt="Avatar" class="rank-avatar"></td>
                        <td class="rank-name">${player.username}</td>
                        <td>${player.victories}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
    dom.rankingContainer.innerHTML = tableHTML;
};

export const updateLobbyUi = (roomData) => {
    const { clientId } = getState();
    const isHost = roomData.hostId === clientId;

    dom.lobbyTitle.textContent = `Lobby da Sala: ${roomData.name}`;

    const playerGrid = document.querySelector('.lobby-player-grid');
    playerGrid.innerHTML = ''; 
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

    dom.lobbyGameModeEl.value = roomData.mode;
    dom.lobbyGameModeEl.disabled = !isHost;

    const playerCount = roomData.players.length;
    let canStart = false;
    switch (roomData.mode) {
        case 'solo-2p': canStart = playerCount === 2; break;
        case 'solo-3p': canStart = playerCount === 3; break;
        case 'solo-4p': case 'duo': canStart = playerCount === 4; break;
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