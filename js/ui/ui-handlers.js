import * as dom from '../core/dom.js';
import { getState, updateState } from '../core/state.js';
import { initializeGame, restartLastDuel } from '../game-controller.js';
import { renderAchievementsModal } from './achievements-renderer.js';
import { renderAll, updateActionButtons, showGameOver } from './ui-renderer.js';
import * as sound from '../core/sound.js';
import { startStoryMode, renderStoryNode, playEndgameSequence } from '../story/story-controller.js';
import * as saveLoad from '../core/save-load.js';
import * as achievements from '../core/achievements.js';
import { updateLog } from '../core/utils.js';
import * as config from '../core/config.js';
import * as network from '../core/network.js';
import { createCosmicGlowOverlay, shatterImage } from './animations.js';
import { announceEffect } from '../core/sound.js';
import { playCard } from '../game-logic/player-actions.js';

/**
 * Resets the game state after a player cancels an action modal.
 */
function cancelPlayerAction() {
    const { gameState } = getState();
    dom.targetModal.classList.add('hidden');
    dom.reversusTargetModal.classList.add('hidden');
    dom.reversusTotalChoiceModal.classList.add('hidden');
    dom.reversusIndividualEffectChoiceModal.classList.add('hidden');
    dom.pulaModal.classList.add('hidden');
    if (gameState) {
        gameState.gamePhase = 'playing';
        gameState.selectedCard = null;
        gameState.reversusTarget = null;
        gameState.pulaTarget = null;
        updateState('reversusTotalIndividualFlow', false);
    }
    renderAll();
}

// ... (toda a lógica de manipulação de cartas e jogo permanece a mesma)

export function initializeUiHandlers() {
    // ... (todos os outros event listeners permanecem os mesmos)

    // Splash Screen Handlers
    dom.quickStartButton.addEventListener('click', () => {
        sound.initializeMusic();
        dom.splashScreenEl.classList.add('hidden');
        dom.gameSetupModal.classList.remove('hidden');
    });
    
    dom.storyModeButton.addEventListener('click', () => {
        sound.initializeMusic();
        startStoryMode();
    });

    dom.pvpModeButton.addEventListener('click', () => {
        const { isLoggedIn } = getState();
        if (!isLoggedIn) {
            alert("É necessário fazer login com o Google para jogar no modo PVP.");
            return;
        }
        network.emitListRooms();
        dom.splashScreenEl.classList.add('hidden');
        dom.pvpRoomListModal.classList.remove('hidden');
    });

    dom.rankingButton.addEventListener('click', () => {
        network.emitGetRanking();
        dom.rankingModal.classList.remove('hidden');
    });

    dom.profileButton.addEventListener('click', () => {
        network.emitGetProfile();
        dom.profileModal.classList.remove('hidden');
    });

    // Ranking and Profile Modal Close Buttons
    dom.closeRankingButton.addEventListener('click', () => dom.rankingModal.classList.add('hidden'));
    dom.closeProfileButton.addEventListener('click', () => dom.profileModal.classList.add('hidden'));

    // Game Over & Restart
    dom.restartButton.addEventListener('click', (e) => {
        const action = e.currentTarget.dataset.action;
        dom.gameOverModal.classList.add('hidden');
        if (action === 'menu') {
            showSplashScreen();
        } else {
            const { gameState } = getState();
            
            // Notificar o servidor sobre o fim do jogo para registrar XP e vitória/derrota
            if (gameState && !gameState.isPvp) { // Apenas para modos não-pvp
                const player1 = gameState.players['player-1'];
                const winnerId = player1.position >= config.WINNING_POSITION ? 'player-1' : gameState.playerIdsInGame.find(id => id !== 'player-1');
                const loserIds = gameState.playerIdsInGame.filter(id => id !== winnerId);
                network.emitGameFinished(winnerId, loserIds, gameState.gameMode);
            }

            if (gameState && gameState.isStoryMode && getState().lastStoryGameOptions) {
                restartLastDuel();
            } else if (gameState) {
                 initializeGame(gameState.gameMode, { numPlayers: gameState.playerIdsInGame.length });
            } else {
                 showSplashScreen();
            }
        }
    });

    // ... (restante dos event listeners)
}
// O restante do arquivo (funções de manipulação de cliques em cartas, etc.) permanece inalterado.
// As funções exportadas como handleCardClick, handlePlayButtonClick, etc., devem ser mantidas aqui.
