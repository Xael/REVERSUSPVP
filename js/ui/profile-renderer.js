// js/ui/profile-renderer.js
import * as dom from '../core/dom.js';

function xpForLevel(level) {
    if (level <= 1) return 0;
    return (level - 1) * (level - 1) * 100;
}

export function renderProfile(profileData) {
    if (!profileData) return;

    // --- 1. Renderizar o Display do Cabeçalho (Avatar, Nome, Nível, XP) ---
    if (dom.userProfileDisplay.classList.contains('hidden')) {
        dom.userProfileDisplay.classList.remove('hidden');
    }
    
    dom.userAvatar.src = profileData.avatar_url || '';
    dom.userName.textContent = profileData.username || 'Jogador';
    dom.userLevel.textContent = profileData.level || 1;

    const currentLevelXp = xpForLevel(profileData.level);
    const nextLevelXp = xpForLevel(profileData.level + 1);
    const xpIntoLevel = profileData.xp - currentLevelXp;
    const xpForThisLevel = nextLevelXp - currentLevelXp;
    const xpPercentage = xpForThisLevel > 0 ? (xpIntoLevel / xpForThisLevel) * 100 : 0;
    
    dom.xpBarFill.style.width = `${Math.min(100, xpPercentage)}%`;
    dom.xpBarText.textContent = `${profileData.xp} / ${nextLevelXp} XP`;

    // --- 2. Renderizar o Modal de Perfil Detalhado ---
    const joinDate = new Date(profileData.created_at).toLocaleDateString('pt-BR');

    const titlesByLine = (profileData.titles || []).reduce((acc, title) => {
        if (!acc[title.line]) {
            acc[title.line] = [];
        }
        acc[title.line].push(title.name);
        return acc;
    }, {});

    const titlesHTML = Object.entries(titlesByLine).map(([line, titles]) => `
        <h4>${line}</h4>
        <ul class="profile-titles-list">
            ${titles.map(name => `<li>${name}</li>`).join('')}
        </ul>
    `).join('');

    const historyHTML = (profileData.history || []).map(match => `
        <li>
            <span class="history-outcome-${match.outcome === 'Vitória' ? 'win' : 'loss'}">${match.outcome}</span>
            <span>${match.mode}</span>
            <span>${new Date(match.date).toLocaleDateString('pt-BR')}</span>
        </li>
    `).join('');

    const profileHTML = `
        <div class="profile-grid">
            <div class="profile-sidebar">
                <img src="${profileData.avatar_url}" alt="Avatar" class="profile-avatar">
                <h2 class="profile-username">${profileData.username}</h2>
                <p class="profile-joindate">No Reversus desde: ${joinDate}</p>
            </div>
            <div class="profile-main-content">
                <div class="profile-stats-grid">
                    <div class="profile-stat-item">
                        <h4>Nível</h4>
                        <p>${profileData.level}</p>
                    </div>
                    <div class="profile-stat-item">
                        <h4>Experiência</h4>
                        <p>${profileData.xp}</p>
                    </div>
                    <div class="profile-stat-item">
                        <h4>Vitórias</h4>
                        <p>${profileData.victories}</p>
                    </div>
                    <div class="profile-stat-item">
                        <h4>Derrotas</h4>
                        <p>${profileData.defeats}</p>
                    </div>
                </div>
                <div class="profile-section">
                    <h3>Títulos Desbloqueados</h3>
                    <div class="profile-titles-container">
                        ${titlesHTML || '<p>Nenhum título desbloqueado ainda.</p>'}
                    </div>
                </div>
                <div class="profile-section">
                    <h3>Histórico de Partidas</h3>
                    <ul class="profile-history-list">
                        ${historyHTML || '<li>Nenhuma partida registrada.</li>'}
                    </ul>
                </div>
            </div>
        </div>
    `;

    dom.profileContainer.innerHTML = profileHTML;
}