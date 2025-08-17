import * as dom from '../core/dom.js';

/**
 * Renders the content of the ranking modal with data from the server.
 * @param {Array<object>} rankingData - An array of player objects ({ name, wins }).
 */
export function renderRankingModal(rankingData) {
    if (!rankingData || rankingData.length === 0) {
        dom.rankingList.innerHTML = '<p>O ranking ainda está vazio. Jogue partidas PvP para aparecer aqui!</p>';
        return;
    }

    const medalIcons = ['🥇', '🥈', '🥉'];

    dom.rankingList.innerHTML = rankingData.map((player, index) => {
        const rank = index + 1;
        const medal = rank <= 3 ? medalIcons[rank - 1] : `${rank}.`;
        
        return `
            <div class="ranking-list-item rank-${rank}">
                <span class="ranking-rank">${medal}</span>
                <span class="ranking-name">${player.name}</span>
                <span class="ranking-wins">${player.wins} vitórias</span>
            </div>
        `;
    }).join('');
}
