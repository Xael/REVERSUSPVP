import * as dom from '../core/dom.js';

/**
 * Renders the player profile modal with data from the server.
 * @param {object} profileData - The full user profile object from the database.
 */
export function renderProfileModal(profileData) {
    if (!profileData) {
        console.error("Dados de perfil não recebidos.");
        // Opcional: mostrar uma mensagem de erro no modal.
        return;
    }

    const { name, picture, stats, titles } = profileData;

    dom.profilePicture.src = picture || './logo.png'; // Fallback para o logo
    dom.profileName.textContent = name;
    dom.profileLevel.textContent = `Nível ${stats.level}`;

    // Calcular e renderizar barra de XP
    const xpForNextLevel = 150 * stats.level;
    const xpProgress = Math.min(100, (stats.xp / xpForNextLevel) * 100);
    dom.xpBarFill.style.width = `${xpProgress}%`;
    dom.profileXpText.textContent = `${stats.xp} / ${xpForNextLevel} XP`;

    // Renderizar estatísticas
    const totalGames = stats.wins + stats.losses;
    const winRate = totalGames > 0 ? ((stats.wins / totalGames) * 100).toFixed(1) : '0';
    dom.profileWins.textContent = stats.wins;
    dom.profileLosses.textContent = stats.losses;
    dom.profileWinrate.textContent = `${winRate}%`;

    // Renderizar títulos
    dom.profileTitlesList.innerHTML = titles.map(title => 
        `<span class="title-badge">${title}</span>`
    ).join('');
}