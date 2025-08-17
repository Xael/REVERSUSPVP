import { getState } from './state.js';
import * as dom from './dom.js';
import * as config from './config.js';
import { createDeck } from '../game-logic/deck.js';

/**
 * Handles dealing a card from a specified deck, reshuffling from the discard pile if empty.
 * This function is now more robust and centralized.
 * @param {('value'|'effect')} deckType - The type of deck to draw from.
 * @returns {object | null} The card object, or null if no cards are available.
 */
export function dealCard(deckType) {
    const { gameState } = getState();
    if (gameState.decks[deckType].length === 0) {
        if (gameState.discardPiles[deckType].length === 0) {
            const configDeck = deckType === 'value' ? config.VALUE_DECK_CONFIG : config.EFFECT_DECK_CONFIG;
            gameState.decks[deckType] = shuffle(createDeck(configDeck, deckType));
            updateLog(`O baralho de ${deckType} e o descarte estavam vazios. Um novo baralho foi criado.`);
            if (gameState.decks[deckType].length === 0) {
                 console.error(`Falha catastrófica ao recriar o baralho de ${deckType}`);
                 return null;
            }
        } else {
            gameState.decks[deckType] = shuffle([...gameState.discardPiles[deckType]]);
            gameState.discardPiles[deckType] = [];
        }
    }
    return gameState.decks[deckType].pop();
}


/**
 * Shuffles an array in place using the Fisher-Yates algorithm.
 * @param {Array} array The array to shuffle.
 * @returns {Array} The shuffled array.
 */
export const shuffle = (array) => {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
};

/**
 * Adds a message to the in-game log and updates the UI.
 * Handles both simple string messages and structured log objects.
 * @param {string | object} logEntry - The message string or a log object with metadata.
 */
export const updateLog = (logEntry) => {
    const { gameState } = getState();
    if (!gameState) return;

    const entry = (typeof logEntry === 'string') ? { type: 'system', message: logEntry } : logEntry;
    
    // Emoji replacement
    const emojiMap = {
        ':)': '😊',
        ':(': '😞',
        ';(': '😭',
        's2': '❤️',
        '&lt;3': '❤️'
    };
    
    // Sanitize message to prevent HTML injection, then replace emojis
    const sanitizedMessage = entry.message.replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const emojiMessage = sanitizedMessage.replace(/:\)|:\(|;\(|s2|&lt;3/gi, (match) => emojiMap[match.toLowerCase()] || match);
    entry.message = emojiMessage;


    console.log(entry.message);
    gameState.log.unshift(entry);
    if (gameState.log.length > 50) {
        gameState.log.pop();
    }
    
    dom.logEl.innerHTML = gameState.log.map(m => {
        if (m.type === 'dialogue' && m.speaker) {
            // In PvP, speaker is a username. In Story, it's a character ID.
            const isStorySpeaker = Object.keys(config.AI_CHAT_PERSONALITIES).includes(m.speaker);
            const speakerClass = isStorySpeaker ? `speaker-${m.speaker}` : 'speaker-player-1'; // Use a generic color for PvP
            const speakerName = isStorySpeaker ? '' : `<strong>${m.speaker}:</strong> `;
            return `<div class="log-message dialogue ${speakerClass}">${speakerName}${m.message}</div>`;
        }
        return `<div class="log-message system">${m.message}</div>`;
    }).join('');

    dom.logEl.scrollTop = 0;
};
