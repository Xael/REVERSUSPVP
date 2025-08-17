import * as dom from '../core/dom.js';
import { getState, updateState } from '../core/state.js';
import { initializeGame, restartLastDuel } from '../game-controller.js';
import { renderPvpRooms, updateLobbyUi, addLobbyChatMessage } from './lobby-renderer.js';
import { showSplashScreen } from './splash-screen.js';
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
import { renderRankingModal } from './ranking-renderer.js';


/**
 * Initializes the Google Sign-In button and handles the authentication callback.
 */
function initializeGoogleSignIn() {
    // Adicione o seu Google Client ID aqui. Por segurança, em um projeto real,
    // isso viria de uma variável de ambiente.
    const GOOGLE_CLIENT_ID = "YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com";

    if (typeof google === 'undefined') {
        console.error("Google Sign-In script not loaded.");
        return;
    }

    google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: handleGoogleCredentialResponse
    });

    google.accounts.id.renderButton(
        dom.googleSigninButton,
        { theme: "outline", size: "large", type: "standard", text: "signin_with" }
    );
    // google.accounts.id.prompt(); // Opcional: exibe o pop-up de login automaticamente
}

/**
 * Handles the response from Google Sign-In, sending the token to the server.
 * @param {object} response - The credential response object from Google.
 */
function handleGoogleCredentialResponse(response) {
    console.log("Encoded JWT ID token: " + response.credential);
    const { isConnectionAttempted } = getState();
    if (!isConnectionAttempted) {
        updateState('isConnectionAttempted', true);
        network.connectToServer();
    }
    network.emitLoginWithGoogle(response.credential);
    sound.initializeMusic();
}

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


function handleCardClick(cardElement) {
    const { gameState, playerId } = getState();
    const myPlayerId = gameState?.isPvp ? playerId : 'player-1';
    const cardId = parseFloat(cardElement.dataset.cardId);

    if (!gameState || gameState.currentPlayer !== myPlayerId || gameState.gamePhase !== 'playing' || isNaN(cardId)) {
        return;
    }

    const player = gameState.players[myPlayerId];
    const card = player.hand.find(c => c.id === cardId);

    if (card) {
        if (cardElement.classList.contains('disabled')) return;
        
        if (card.name === 'Carta da Versatrix' && card.cooldown > 0) {
            updateLog(`A Carta da Versatrix está em recarga por mais ${card.cooldown} rodada(s).`);
            return;
        }

        gameState.selectedCard = (gameState.selectedCard?.id === cardId) ? null : card;
        renderAll();
    }
}

async function handlePlayButtonClick() {
    dom.playButton.disabled = true;

    const { gameState, playerId } = getState();
    const myPlayerId = gameState.isPvp ? playerId : 'player-1';
    const player = gameState.players[myPlayerId];
    const card = gameState.selectedCard;

    if (!card) {
        updateActionButtons();
        return;
    }

    if (card.type === 'value') {
        if (gameState.isPvp) {
            network.emitPlayCard({ cardId: card.id, targetId: player.id });
        } else {
            playCard(player, card, player.id);
        }
    } else if (card.name === 'Reversus Total') {
        dom.reversusTotalChoiceModal.classList.remove('hidden');
    } else if (['Mais', 'Menos', 'Sobe', 'Desce', 'Reversus', 'Pula', 'Carta da Versatrix'].includes(card.name)) {
        gameState.gamePhase = 'targeting';
        dom.targetModalCardName.textContent = card.name;
        dom.targetPlayerButtonsEl.innerHTML = gameState.playerIdsInGame
            .map(id => {
                const player = gameState.players[id];
                if (player.isEliminated) return '';
                return `<button class="control-button target-player-${id.split('-')[1]}" data-player-id="${id}">${player.name}</button>`;
            })
            .join('');
        dom.targetModal.classList.remove('hidden');
    }
}

async function handlePlayerTargetSelection(targetId) {
    const { gameState, playerId } = getState();
    const myPlayerId = gameState.isPvp ? playerId : 'player-1';
    const player = gameState.players[myPlayerId];
    
    if (getState().reversusTotalIndividualFlow) {
        dom.targetModal.classList.add('hidden');
        gameState.reversusTarget = { card: gameState.selectedCard, targetPlayerId: targetId };
        gameState.gamePhase = 'reversus_targeting';
        dom.reversusIndividualEffectChoiceModal.classList.remove('hidden');
        updateActionButtons();
        return;
    }

    if (!gameState.selectedCard) return;
    const card = gameState.selectedCard;
    dom.targetModal.classList.add('hidden');
    
    if (card.name === 'Reversus') {
        gameState.reversusTarget = { card, targetPlayerId: targetId };
        gameState.gamePhase = 'reversus_targeting';
        dom.reversusTargetModal.classList.remove('hidden');
        updateActionButtons();
    } else if (card.name === 'Pula') {
        const availablePaths = gameState.boardPaths.filter(p => !Object.values(gameState.players).map(pl => pl.pathId).includes(p.id));
        if (availablePaths.length === 0) {
            alert("Não há caminhos vazios para pular! A jogada foi cancelada.");
            cancelPlayerAction();
            return;
        }
        gameState.pulaTarget = { card, targetPlayerId: targetId };
        handlePulaCasterChoice(card, targetId);
    } else if (card.name === 'Reversus Total') {
         gameState.reversusTarget = { card, targetPlayerId: targetId };
         gameState.gamePhase = 'reversus_targeting';
         dom.reversusIndividualEffectChoiceModal.classList.remove('hidden');
         updateActionButtons();
    } else {
        if (gameState.isPvp) {
            network.emitPlayCard({ cardId: card.id, targetId });
        } else {
            playCard(player, card, targetId);
        }
    }
}

function handlePulaCasterChoice(card, targetId) {
    const { gameState } = getState();
    gameState.gamePhase = 'pula_casting';
    const target = gameState.players[targetId];

    dom.pulaModalTitle.textContent = `Jogar 'Pula' em ${target.name}`;
    dom.pulaModalText.textContent = `Escolha um caminho vazio para ${target.name} pular:`;
    dom.pulaCancelButton.classList.remove('hidden');
    
    dom.pulaPathButtonsEl.innerHTML = gameState.boardPaths.map(path => {
        const pathOccupant = Object.values(gameState.players).find(player => player.pathId === path.id);
        const isOccupied = !!pathOccupant;
        const isDisabled = isOccupied;
        return `<button class="control-button" data-path-id="${path.id}" ${isDisabled ? 'disabled' : ''}>Caminho ${path.id + 1} ${isOccupied ? `(Ocupado por ${pathOccupant.name})` : '(Vazio)'}</button>`
    }).join('');

    dom.pulaModal.classList.remove('hidden');
    updateActionButtons();
}

async function handlePulaPathSelection(chosenPathId) {
    const { gameState } = getState();
    if (!gameState.pulaTarget) return;

    const { card, targetPlayerId } = gameState.pulaTarget;
    const myPlayerId = gameState.isPvp ? getState().playerId : 'player-1';
    const player = gameState.players[myPlayerId];
    
    dom.pulaModal.classList.add('hidden');
    
    const options = {
        effect: 'Pula',
        targetPath: chosenPathId
    };

    if (gameState.isPvp) {
         network.emitPlayCard({ cardId: card.id, targetId: targetPlayerId, options });
    } else {
        const target = gameState.players[targetPlayerId];
        target.targetPathForPula = chosenPathId;
        playCard(player, card, targetPlayerId);
    }
}

async function handleReversusEffectTypeSelection(effectTypeToReverse) {
    const { gameState } = getState();
    if (!gameState.reversusTarget) return;
    const { card, targetPlayerId } = gameState.reversusTarget;
    const myPlayerId = gameState.isPvp ? getState().playerId : 'player-1';
    const player = gameState.players[myPlayerId];
    dom.reversusTargetModal.classList.add('hidden');
    
    if (gameState.isPvp) {
        network.emitPlayCard({ cardId: card.id, targetId: targetPlayerId, options: { type: effectTypeToReverse } });
    } else {
        playCard(player, card, targetPlayerId, effectTypeToReverse);
    }
}

async function handleReversusTotalChoice(isGlobal) {
    const { gameState, playerId } = getState();
    const myPlayerId = gameState.isPvp ? playerId : 'player-1';
    const player = gameState.players[myPlayerId];
    const card = gameState.selectedCard;
    dom.reversusTotalChoiceModal.classList.add('hidden');

    if (isGlobal) {
        if (gameState.isPvp) {
            network.emitPlayCard({ cardId: card.id, targetId: player.id, options: { isGlobal: true } });
        } else {
            playCard(player, card, player.id, null, { isGlobal: true });
        }
    } else {
        updateState('reversusTotalIndividualFlow', true);
        gameState.gamePhase = 'targeting';
        dom.targetModalCardName.textContent = "Travar Efeito";
        dom.targetPlayerButtonsEl.innerHTML = gameState.playerIdsInGame
            .map(id => {
                const player = gameState.players[id];
                if (player.isEliminated) return '';
                return `<button class="control-button target-player-${id.split('-')[1]}" data-player-id="${id}">${player.name}</button>`;
            })
            .join('');
        dom.targetModal.classList.remove('hidden');
    }
}

async function handleIndividualEffectLock(effectName) {
    const { gameState } = getState();
    if (!gameState.reversusTarget) return;

    const { card, targetPlayerId } = gameState.reversusTarget;
    const myPlayerId = gameState.isPvp ? getState().playerId : 'player-1';
    const player = gameState.players[myPlayerId];
    dom.reversusIndividualEffectChoiceModal.classList.add('hidden');

    if (effectName === 'Pula') {
        const availablePaths = gameState.boardPaths.filter(p => !Object.values(gameState.players).map(pl => pl.pathId).includes(p.id));
        if (availablePaths.length === 0) {
            alert("Não há caminhos vazios para pular! A jogada foi cancelada.");
            cancelPlayerAction();
            return;
        }
        gameState.pulaTarget = { card, targetPlayerId };
        handlePulaCasterChoice(card, targetPlayerId);
    } else {
        const options = { isIndividualLock: true, effectNameToApply: effectName };
        if (gameState.isPvp) {
            network.emitPlayCard({ cardId: card.id, targetId: targetPlayerId, options });
        } else {
            playCard(player, card, targetPlayerId, null, options);
        }
    }
}

async function handleChatSend() {
    const { gameState } = getState();
    const input = dom.chatInput.value.trim();
    if (!input) return;

    if (gameState && gameState.isPvp) {
        network.emitChatMessage(input);
    }
    
    dom.chatInput.value = '';
}

async function animateBossDefeat(battleId) {
    const { gameState } = getState();
    const bossPlayer = Object.values(gameState.players).find(p => p.aiType === battleId);
    if (!bossPlayer) return;

    const bossImageEl = document.querySelector(`#player-area-${bossPlayer.id} .player-area-character-portrait`);
    if (bossImageEl) {
        await shatterImage(bossImageEl);
    }
}

async function handleStoryWinLoss(e) {
    const { battle, won } = e.detail;

    dom.appContainerEl.classList.add('hidden');
    dom.debugButton.classList.add('hidden');
    dom.gameOverModal.classList.add('hidden'); 

    const { gameTimerInterval } = getState();
    if (gameTimerInterval) clearInterval(gameTimerInterval);
    updateState('gameTimerInterval', null);

    let nextNode;
    const bossesToShatter = ['contravox', 'versatrix', 'reversum'];

    if (won && bossesToShatter.includes(battle)) {
        dom.appContainerEl.classList.remove('hidden');
        await animateBossDefeat(battle);
        dom.appContainerEl.classList.add('hidden');
    }

    switch (battle) {
        case 'tutorial_necroverso':
            nextNode = won ? 'post_tutorial' : 'tutorial_loss';
            if (won) achievements.grantAchievement('tutorial_win');
            break;
        case 'contravox':
            nextNode = won ? 'post_contravox_victory' : 'start_contravox';
            if (won) achievements.grantAchievement('contravox_win');
            break;
        case 'versatrix':
            const { storyState } = getState();
            storyState.lostToVersatrix = !won;
            updateState('storyState', storyState);
            if (won) {
                achievements.grantAchievement('versatrix_win');
                nextNode = 'post_versatrix_victory';
            } else {
                achievements.grantAchievement('versatrix_loss');
                nextNode = 'post_versatrix_defeat';
            }
            break;
         case 'reversum':
            nextNode = won ? 'post_reversum_victory' : 'start_reversum';
            if(won) achievements.grantAchievement('reversum_win');
            break;
         case 'necroverso_king':
            nextNode = won ? 'post_necroverso_king_victory' : 'final_confrontation_1';
            if(won) achievements.grantAchievement('true_end_beta');
            break;
         case 'necroverso_final':
            if (won) {
                achievements.grantAchievement('true_end_final');
                playEndgameSequence();
            } else {
                showGameOver(
                    "Sua equipe foi derrotada... mas a luta ainda não acabou.",
                    "Derrota",
                    { text: 'Tentar Novamente', action: 'restart' }
                );
                updateState('lastStoryGameOptions', { mode: 'duo', options: getState().gameState.gameOptions });
            }
            return;
        case 'inversus':
            if (won) {
                achievements.grantAchievement('inversus_win');
            }
            showSplashScreen();
            return;
        case 'narrador':
            if (won) {
                achievements.grantAchievement('120%_unlocked');
            }
            showSplashScreen();
            return;
        case 'xael_challenge':
            dom.cosmicGlowOverlay.classList.add('hidden');
            if (won) {
                achievements.grantAchievement('xael_win');
                restartLastDuel();
            } else {
                showGameOver(
                    "Você não conseguiu superar o desafio.",
                    "Fim do Desafio",
                    { text: 'Voltar ao Menu', action: 'menu' }
                );
            }
            return;
        case 'return_to_menu':
            showSplashScreen();
            return;
    }

    if (nextNode) {
        dom.storyModeModalEl.classList.remove('hidden');
        renderStoryNode(nextNode);
    } else { 
        showSplashScreen();
    }
}

async function handleRandomOpponentSelection() {
    dom.randomOpponentSpinnerModal.classList.remove('hidden');

    const opponents = [
        { name: 'Necroverso', aiType: 'necroverso_tutorial', image: './necroverso.png' },
        { name: 'Necroverso Final', aiType: 'necroverso_final', image: './necroverso2.png' },
        { name: 'Contravox', aiType: 'contravox', image: './contravox.png' },
        { name: 'Versatrix', aiType: 'versatrix', image: './versatrix.png' },
        { name: 'Rei Reversum', aiType: 'reversum', image: './reversum.png' },
        { name: 'Inversus', aiType: 'inversus', image: './inversum1.png' },
        { name: 'Xael', aiType: 'xael', image: './xaeldesafio.png' },
        { name: 'Narrador', aiType: 'narrador', image: './narrador.png' }
    ];

    let spinnerInterval;
    const spinnerPromise = new Promise(resolve => {
        let i = 0;
        spinnerInterval = setInterval(() => {
            const currentOpponent = opponents[i % opponents.length];
            dom.opponentSpinnerImage.src = currentOpponent.image;
            dom.opponentSpinnerName.textContent = currentOpponent.name;
            i++;
        }, 100);

        setTimeout(() => {
            clearInterval(spinnerInterval);
            resolve();
        }, 3000);
    });

    await spinnerPromise;

    const chosenOpponent = opponents[Math.floor(Math.random() * opponents.length)];

    dom.opponentSpinnerImage.style.animation = 'none';
    dom.opponentSpinnerImage.src = chosenOpponent.image;
    dom.opponentSpinnerName.textContent = chosenOpponent.name;
    dom.randomOpponentSpinnerModal.querySelector('h2').textContent = 'Oponente Escolhido!';
    sound.playSoundEffect('escolhido');

    await new Promise(resolve => setTimeout(resolve, 2000));

    dom.randomOpponentSpinnerModal.classList.add('hidden');
    dom.randomOpponentSpinnerModal.querySelector('h2').textContent = 'Sorteando Oponente...';
    dom.opponentSpinnerImage.style.animation = 'opponent-flicker 0.1s linear infinite';
    
    initializeGame('solo', { numPlayers: 2, overrides: { 'player-2': { name: chosenOpponent.name, aiType: chosenOpponent.aiType } } });
}


export function initializeUiHandlers() {
    initializeGoogleSignIn();

    document.addEventListener('showSplashScreen', showSplashScreen);
    document.addEventListener('playEndgameSequence', () => import('../story/story-controller.js').then(module => module.playEndgameSequence()));
    
    document.addEventListener('startStoryGame', (e) => {
        const { mode, options } = e.detail;
        const battleId = options?.story?.battle;
        if (battleId === 'return_to_menu') {
            showSplashScreen();
            return;
        }
        if (battleId && !['xael_challenge', 'narrador', 'tutorial_necroverso'].includes(battleId)) {
            updateState('lastStoryGameOptions', { mode, options });
        }
        if (options) {
            initializeGame(mode, options);
        } else {
            showSplashScreen();
        }
    });
    
    document.addEventListener('storyWinLoss', handleStoryWinLoss);
    
    document.addEventListener('aiTurnEnded', () => {
         import('../game-logic/turn-manager.js').then(module => module.advanceToNextPlayer());
    });

    dom.quickStartButton.addEventListener('click', () => {
        sound.initializeMusic();
        dom.splashScreenEl.classList.add('hidden');
        dom.gameSetupModal.classList.remove('hidden');
    });
    dom.storyModeButton.addEventListener('click', startStoryMode);
    dom.inversusModeButton.addEventListener('click', () => {
        sound.initializeMusic();
        initializeGame('inversus', { numPlayers: 2, overrides: { 'player-2': { name: 'Inversus', aiType: 'inversus' } } });
    });

    dom.rankingButton.addEventListener('click', () => {
        network.emitGetRanking();
        dom.rankingModal.classList.remove('hidden');
    });
    dom.closeRankingButton.addEventListener('click', () => {
        dom.rankingModal.classList.add('hidden');
    });

    dom.profileButton.addEventListener('click', () => {
        network.emitGetMyProfile();
        dom.profileModal.classList.remove('hidden');
    });
    dom.closeProfileButton.addEventListener('click', () => {
        dom.profileModal.classList.add('hidden');
    });

    dom.instructionsButton.addEventListener('click', () => { dom.rulesModal.classList.remove('hidden'); });
    dom.creditsButton.addEventListener('click', () => { dom.creditsModal.classList.remove('hidden'); });
    dom.continueButton.addEventListener('click', saveLoad.loadGameState);
    dom.achievementsButton.addEventListener('click', () => { renderAchievementsModal(); dom.achievementsModal.classList.remove('hidden'); });
    dom.splashLogo.addEventListener('click', () => {
        if (dom.splashLogo.classList.contains('effect-glitch')) {
            sound.initializeMusic();
            const { achievements } = getState();
            if (achievements.has('inversus_win') && !achievements.has('120%_unlocked')) {
                 initializeGame('solo', { story: { battle: 'narrador', playerIds: ['player-1', 'player-2'], overrides: { 'player-2': { name: 'Narrador', aiType: 'narrador' } } } });
            }
        }
    });

    dom.closeRulesButton.addEventListener('click', () => dom.rulesModal.classList.add('hidden'));
    dom.closeCreditsButton.addEventListener('click', () => dom.creditsModal.classList.add('hidden'));
    dom.closeAchievementsButton.addEventListener('click', () => dom.achievementsModal.classList.add('hidden'));
    
    dom.solo2pButton.addEventListener('click', () => {
        dom.gameSetupModal.classList.add('hidden');
        dom.oneVOneSetupModal.classList.remove('hidden');
    });
    dom.oneVOneDefaultButton.addEventListener('click', () => {
        dom.oneVOneSetupModal.classList.add('hidden');
        initializeGame('solo', { numPlayers: 2 });
    });
    dom.oneVOneRandomButton.addEventListener('click', () => {
        dom.oneVOneSetupModal.classList.add('hidden');
        handleRandomOpponentSelection();
    });
    dom.oneVOneBackButton.addEventListener('click', () => {
        dom.oneVOneSetupModal.classList.add('hidden');
        dom.gameSetupModal.classList.remove('hidden');
    });
    
    const setupGame = (numPlayers, mode = 'solo') => {
        dom.gameSetupModal.classList.add('hidden');
        initializeGame(mode, { numPlayers });
    };
    
    dom.solo3pButton.addEventListener('click', () => setupGame(3));
    dom.solo4pButton.addEventListener('click', () => setupGame(4));
    dom.duoModeButton.addEventListener('click', () => setupGame(4, 'duo'));
    dom.closeSetupButton.addEventListener('click', () => {
        dom.gameSetupModal.classList.add('hidden');
        dom.splashScreenEl.classList.remove('hidden');
    });

    dom.playButton.addEventListener('click', handlePlayButtonClick);
    dom.endTurnButton.addEventListener('click', () => {
        const { gameState } = getState();
        if (gameState.isPvp) {
            network.emitEndTurn();
        } else {
             import('../game-logic/turn-manager.js').then(module => {
                const player = gameState.players[gameState.currentPlayer];
                const valueCardsInHandCount = player.hand.filter(c => c.type === 'value').length;
                const mustPlayValueCard = valueCardsInHandCount > 1 && !player.playedValueCardThisTurn;
                if (mustPlayValueCard) {
                    alert("Você precisa jogar uma carta de valor neste turno!");
                    return;
                }
                gameState.consecutivePasses++;
                module.advanceToNextPlayer();
             });
        }
    });

    dom.appContainerEl.addEventListener('click', (e) => {
        const cardElement = e.target.closest('.card');
        const maximizeButton = e.target.closest('.card-maximize-button');
        const fieldEffectIndicator = e.target.closest('.field-effect-indicator');

        if (maximizeButton && cardElement) {
            e.stopPropagation();
            dom.cardViewerImageEl.src = cardElement.style.backgroundImage.slice(4, -1).replace(/"/g, "");
            dom.cardViewerModalEl.classList.remove('hidden');
        } else if (cardElement) {
            handleCardClick(cardElement);
        } else if (fieldEffectIndicator) {
            const playerId = fieldEffectIndicator.dataset.playerId;
            const { gameState } = getState();
            const effect = gameState.activeFieldEffects.find(fe => fe.appliesTo === playerId);
            if (effect) {
                const isPositive = effect.type === 'positive';
                dom.fieldEffectInfoModal.querySelector('.field-effect-card').className = `field-effect-card ${isPositive ? 'positive' : 'negative'}`;
                dom.fieldEffectInfoName.textContent = effect.name;
                dom.fieldEffectInfoDescription.textContent = isPositive ? config.POSITIVE_EFFECTS[effect.name] : config.NEGATIVE_EFFECTS[effect.name];
                dom.fieldEffectInfoModal.classList.remove('hidden');
            }
        }
    });
    dom.cardViewerCloseButton.addEventListener('click', () => dom.cardViewerModalEl.classList.add('hidden'));

    dom.targetPlayerButtonsEl.addEventListener('click', e => {
        if (e.target.matches('[data-player-id]')) {
            handlePlayerTargetSelection(e.target.dataset.playerId);
        }
    });
    dom.targetCancelButton.addEventListener('click', cancelPlayerAction);
    dom.reversusTargetScoreButton.addEventListener('click', () => handleReversusEffectTypeSelection('score'));
    dom.reversusTargetMovementButton.addEventListener('click', () => handleReversusEffectTypeSelection('movement'));
    dom.reversusTargetCancelButton.addEventListener('click', cancelPlayerAction);
    dom.reversusTotalGlobalButton.addEventListener('click', () => handleReversusTotalChoice(true));
    dom.reversusTotalIndividualButton.addEventListener('click', () => handleReversusTotalChoice(false));
    dom.reversusTotalChoiceCancel.addEventListener('click', cancelPlayerAction);
    dom.reversusIndividualEffectButtons.addEventListener('click', (e) => {
        if (e.target.matches('[data-effect]')) {
            handleIndividualEffectLock(e.target.dataset.effect);
        }
    });
    dom.reversusIndividualCancelButton.addEventListener('click', cancelPlayerAction);
    dom.pulaPathButtonsEl.addEventListener('click', e => {
        if(e.target.matches('[data-path-id]')){
            handlePulaPathSelection(parseInt(e.target.dataset.pathId, 10));
        }
    });
    dom.pulaCancelButton.addEventListener('click', cancelPlayerAction);
    dom.fieldEffectTargetButtons.addEventListener('click', e => {
        if (e.target.matches('[data-player-id]')) {
            const { fieldEffectTargetResolver } = getState();
            if (fieldEffectTargetResolver) {
                fieldEffectTargetResolver(e.target.dataset.playerId);
                updateState('fieldEffectTargetResolver', null);
            }
        }
    });

    dom.restartButton.addEventListener('click', (e) => {
        const action = e.currentTarget.dataset.action;
        dom.gameOverModal.classList.add('hidden');
        if (action === 'menu') {
            showSplashScreen();
        } else {
            const { gameState, lastStoryGameOptions } = getState();
            if (gameState && gameState.isStoryMode && lastStoryGameOptions) {
                restartLastDuel();
            } else if (gameState) {
                 initializeGame(gameState.gameMode, { numPlayers: gameState.playerIdsInGame.length, overrides: {} });
            } else {
                 showSplashScreen();
            }
        }
    });
    
    dom.chatSendButton.addEventListener('click', handleChatSend);
    dom.chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleChatSend();
    });

    dom.muteButton.addEventListener('click', sound.toggleMute);
    dom.volumeSlider.addEventListener('input', (e) => sound.setVolume(parseFloat(e.target.value)));
    dom.nextTrackButton.addEventListener('click', sound.changeTrack);
    dom.fullscreenButton.addEventListener('click', () => {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen();
            dom.fullscreenButton.querySelector('#fullscreen-icon-enter').classList.add('hidden');
            dom.fullscreenButton.querySelector('#fullscreen-icon-exit').classList.remove('hidden');
        } else if (document.exitFullscreen) {
            document.exitFullscreen();
            dom.fullscreenButton.querySelector('#fullscreen-icon-enter').classList.remove('hidden');
            dom.fullscreenButton.querySelector('#fullscreen-icon-exit').classList.add('hidden');
        }
    });

    dom.debugButton.addEventListener('click', () => dom.gameMenuModal.classList.remove('hidden'));
    dom.gameMenuCloseButton.addEventListener('click', () => dom.gameMenuModal.classList.add('hidden'));
    dom.menuSaveGameButton.addEventListener('click', () => {
        dom.gameMenuModal.classList.add('hidden');
        dom.saveGameConfirmModal.classList.remove('hidden');
    });
    dom.menuExitGameButton.addEventListener('click', () => {
        const { socket, currentRoomId } = getState();
        if (socket && currentRoomId) {
            socket.emit('leaveRoom');
        } else {
            dom.gameMenuModal.classList.add('hidden');
            dom.exitGameConfirmModal.classList.remove('hidden');
        }
    });

    dom.saveGameYesButton.addEventListener('click', saveLoad.saveGameState);
    dom.saveGameNoButton.addEventListener('click', () => dom.saveGameConfirmModal.classList.add('hidden'));
    dom.exitGameYesButton.addEventListener('click', () => {
        dom.exitGameConfirmModal.classList.add('hidden');
        showSplashScreen();
    });
    dom.exitGameNoButton.addEventListener('click', () => dom.exitGameConfirmModal.classList.add('hidden'));

    dom.pvpRoomListModal.addEventListener('click', (e) => {
        if (e.target.classList.contains('pvp-enter-room-button')) {
            const roomId = e.target.dataset.roomId;
            network.emitJoinRoom(roomId);
        } else if (e.target.id === 'pvp-create-room-button') {
            network.emitCreateRoom();
        }
    });

    dom.pvpRoomListCloseButton.addEventListener('click', showSplashScreen);
    
    dom.pvpLobbyCloseButton.addEventListener('click', () => network.emitLeaveRoom());
    dom.lobbyStartGameButton.addEventListener('click', () => {
        const { socket, currentRoomId } = getState();
        if (socket && currentRoomId) {
            socket.emit('startGame', currentRoomId);
        }
    });
    
    dom.lobbyGameModeEl.addEventListener('change', (e) => {
        const newMode = e.target.value;
        network.emitChangeMode(newMode);
    });

    const handleLobbyChat = () => {
        const message = dom.lobbyChatInput.value.trim();
        if (message) {
            network.emitLobbyChat(message);
            dom.lobbyChatInput.value = '';
        }
    };
    dom.lobbyChatSendButton.addEventListener('click', handleLobbyChat);
    dom.lobbyChatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleLobbyChat();
    });

    dom.splashAnimationContainerEl.addEventListener('click', e => {
        if (e.target.id === 'secret-versatrix-card') {
            achievements.grantAchievement('versatrix_card_collected');
            e.target.remove();
            const { versatrixCardInterval } = getState();
            if (versatrixCardInterval) clearInterval(versatrixCardInterval);
            updateState('versatrixCardInterval', null);
        }
    });

    dom.xaelPopup.addEventListener('click', () => {
        dom.xaelPopup.classList.add('hidden');
        const { gameState } = getState();
        if (gameState) {
            updateState('preChallengeGameStateSnapshot', structuredClone(gameState));
            updateState('lastStoryGameOptions', { mode: gameState.gameMode, options: gameState.gameOptions });
            dom.storyModeModalEl.classList.remove('hidden');
            createCosmicGlowOverlay();
            renderStoryNode('xael_challenge_intro');
        }
    });

    dom.xaelStarPowerButton.addEventListener('click', () => {
        dom.xaelPowerConfirmModal.classList.remove('hidden');
    });

    dom.xaelPowerConfirmYes.addEventListener('click', () => {
        dom.xaelPowerConfirmModal.classList.add('hidden');
        const { gameState } = getState();
        if (!gameState || !gameState.isStoryMode) return;
        const player1 = gameState.players['player-1'];
        if (!player1 || !player1.hasXaelStarPower || player1.xaelStarPowerCooldown > 0) return;
        player1.xaelStarPowerCooldown = 3;
        gameState.revealedHands = gameState.playerIdsInGame.filter(id => id !== 'player-1' && !gameState.players[id].isEliminated);
        announceEffect('REVELAÇÃO ESTELAR', 'reversus-total');
        sound.playSoundEffect('xael');
        updateLog("Poder Estelar ativado! Mãos dos oponentes reveladas por esta rodada.");
        renderAll();
    });

    dom.xaelPowerConfirmNo.addEventListener('click', () => {
        dom.xaelPowerConfirmModal.classList.add('hidden');
    });
}