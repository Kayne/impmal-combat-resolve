function updateDiff(currentDefeated, role, flag) {
    const defeated = currentDefeated.filter(a => a.actor.system.role === role).length;
    const prev = game.combat.getFlag('impmal-combat-resolve', flag) ?? 0;
    let diff = defeated - prev;
    if (diff < 0) diff = 0;
    game.combat.setFlag('impmal-combat-resolve', flag, defeated);
    return diff;
}

function getHighestLeaderResolve(combat) {
    const activeNpcs = combat.combatants.filter(a =>
        !a.isDefeated && a.actor.type === 'npc' &&
        (a.actor.system.role === 'leader' || a.actor.system.role === 'troop')
    );
    const highest = Math.max(...activeNpcs.map(a => a.actor.system.combat.resolve), -Infinity);
    return highest !== -Infinity ? highest : null;
}

function notifyOrChat(type, combatant, messageKey, localizedMessage) {
    const sendToChat = game.settings.get('impmal-combat-resolve', 'sendToChat');
    const showNPC = game.settings.get('impmal-combat-resolve', 'showNPCBelowSuperiority');
    if (sendToChat === 'on_superiority' || sendToChat === 'on_counters_and_superiority') {
        if (showNPC) {
            ResolveMessage[type](combatant.token, localizedMessage);
        } else {
            ResolveMessage[type + 'NoToken'](combatant.token, localizedMessage);
        }
    } else {
        const name = combatant.actor.token ? combatant.actor.token.name : combatant.actor.prototypeToken.name;
        ui.notifications.info(`${name}: ${game.i18n.localize(messageKey)}`);
    }
}

Hooks.on("combatRound", (combat) => {
    if (!game.user.isGM) return;

    const currentDefeated = combat.combatants.filter(a => a.isDefeated && a.actor.type === 'npc');
    const settings = {
        countElites: game.settings.get('impmal-combat-resolve', 'countElites'),
        countLeaders: game.settings.get('impmal-combat-resolve', 'countLeaders'),
        countTroops: game.settings.get('impmal-combat-resolve', 'countTroops')
    };

    const diffs = {
        troops: settings.countTroops ? updateDiff(currentDefeated, 'troop', 'previousDefeatedTroops') : 0,
        elites: settings.countElites ? updateDiff(currentDefeated, 'elite', 'previousDefeatedElites') : 0,
        leaders: settings.countLeaders ? updateDiff(currentDefeated, 'leader', 'previousDefeatedLeaders') : 0,
        all() {
            return this.troops + this.elites + this.leaders;
        }
    };

    if (diffs.all() > 0) {
        const sendToChat = game.settings.get('impmal-combat-resolve', 'sendToChat');
        const highestLeaderResolve = getHighestLeaderResolve(combat);

        if (sendToChat === 'on_counters' || sendToChat === 'on_counters_and_superiority') {
            ResolveMessage.postToChatOnRound(diffs, highestLeaderResolve);
        } else {
            let message = game.i18n.localize('IMPMAL-COMBAT-RESOLVE.MESSAGES.inLastRound');
            if (highestLeaderResolve !== -Infinity) {
                message += " " + game.i18n.localize('IMPMAL-COMBAT-RESOLVE.MESSAGES.highestResolve') + " " + highestLeaderResolve + ".";
            }
            if (diffs.troops > 0) {
                message += " " + diffs.troops + " " + game.i18n.localize('IMPMAL-COMBAT-RESOLVE.MESSAGES.troopsDefeated');
            }
            if (diffs.elites > 0) {
                message += " " + diffs.elites + " " + game.i18n.localize('IMPMAL-COMBAT-RESOLVE.MESSAGES.elitesDefeated');
            }
            if (diffs.leaders > 0) {
                message += " " + diffs.leaders + " " + game.i18n.localize('IMPMAL-COMBAT-RESOLVE.MESSAGES.leadersDefeated');
            }
            ui.notifications.info(message);
        }
    }
});

Hooks.on("combatStart", (combat) => {
    if (!game.user.isGM) return;
    if (!game.settings.get('impmal-combat-resolve', 'checkSuperiority')) return;

    const critsByCombatant = {};
    for (const combatant of combat.combatants.filter( a => a.actor.type === 'character')) {
        critsByCombatant[combatant.id] = combatant.actor?.system?.combat?.criticals?.value ?? 0;
    }
    game.combat.setFlag('impmal-combat-resolve', 'critics', critsByCombatant);
    game.combat.setFlag('impmal-combat-resolve', 'defeatedPC', []);
});

Hooks.on("updateCombat", (combat, data) => 
{
    if (!game.user.isGM) return;
    if (!game.settings.get('impmal-combat-resolve', 'checkSuperiority')) return;
    if (data.turn === undefined && data.round === undefined) return;

    const critsByCombatant = game.combat.getFlag('impmal-combat-resolve', 'critics') ?? {};
    const defeatedPC = game.combat.getFlag('impmal-combat-resolve', 'defeatedPC') ?? [];

    combat.combatants
        .filter(a => a.actor.type === 'character')
        .forEach(combatant => {
            // Check if new criticals were added
            if (critsByCombatant[combatant.id] !== null && critsByCombatant[combatant.id] < combatant.actor?.system?.combat?.criticals?.value) {
                critsByCombatant[combatant.id] = null;
                game.combat.setFlag('impmal-combat-resolve', 'critics', critsByCombatant);
                notifyOrChat('postToChatOnDecreaseSuperiority', combatant, 'IMPMAL-COMBAT-RESOLVE.MESSAGES.decreaseSuperiority');
            }

            // Check if the combatant is defeated
            const idx = defeatedPC.indexOf(combatant.id);
            if (combatant.isDefeated) {
                if (idx === -1) {
                    defeatedPC.push(combatant.id);
                    game.combat.setFlag('impmal-combat-resolve', 'defeatedPC', defeatedPC);
                    notifyOrChat('postToChatOnDefeatedPC', combatant, 'IMPMAL-COMBAT-RESOLVE.MESSAGES.defeatedPC');
                }
            } else if (idx !== -1) {
                defeatedPC.splice(idx, 1);
                game.combat.setFlag('impmal-combat-resolve', 'defeatedPC', defeatedPC);
            }
        });

    const combatant = combat.combatant;
    if (!combatant) return;
    const superiority = game.settings.get("impmal", "superiority");
    let superiorityCheck = false;
    let localizedMessage = game.i18n.localize('IMPMAL-COMBAT-RESOLVE.MESSAGES.currentCombatant');
    switch (game.settings.get('impmal-combat-resolve','superiorityCheck')) {
        case 'equalOrGreater':
            superiorityCheck = combatant.actor.system.combat.resolve <= superiority;
            break;
        case 'greater':
            superiorityCheck = combatant.actor.system.combat.resolve < superiority;
            localizedMessage = game.i18n.localize('IMPMAL-COMBAT-RESOLVE.MESSAGES.currentCombatantGreater');
            break;
    }
    if (!combatant.isDefeated && superiorityCheck) {
        notifyOrChat('postToChatOnTurn', combatant, localizedMessage, localizedMessage);
    }
});

Hooks.on("init", () => {
    const registerSetting = (key, data) => game.settings.register('impmal-combat-resolve', key, data);

    registerSetting( 'sendToChat', {
        name: 'IMPMAL-COMBAT-RESOLVE.SETTINGS.sentToChat',
        hint: 'IMPMAL-COMBAT-RESOLVE.SETTINGS.sentToChatHint',
        scope: 'world',
        config: true,
        type: String,
        default: 'on_counters_and_superiority',
        choices: {
            nothing: "IMPMAL-COMBAT-RESOLVE.SETTINGS.sentToChatNothing",
            on_counters: "IMPMAL-COMBAT-RESOLVE.SETTINGS.sentToChatCounters",
            on_superiority: "IMPMAL-COMBAT-RESOLVE.SETTINGS.sentToChatOnSuperiority",
            on_counters_and_superiority: "IMPMAL-COMBAT-RESOLVE.SETTINGS.sentToChatOnCountersAndSuperiority",
        }
    });

    registerSetting( 'showNPCBelowSuperiority', {
        name: 'IMPMAL-COMBAT-RESOLVE.SETTINGS.showNPCBelowSuperiority',
        hint: 'IMPMAL-COMBAT-RESOLVE.SETTINGS.showNPCBelowSuperiorityHint',
        scope: 'world',
        config: true,
        type: Boolean,
        default: true
    });

    registerSetting( 'chatVisibility', {
        name: 'IMPMAL-COMBAT-RESOLVE.SETTINGS.chatVisibility',
        hint: 'IMPMAL-COMBAT-RESOLVE.SETTINGS.chatVisibilityHint',
        scope: 'world',
        config: true,
        type: String,
        default: 'private',
        choices: {
            private: "IMPMAL-COMBAT-RESOLVE.SETTINGS.chatVisibilityPrivate",
            public: "IMPMAL-COMBAT-RESOLVE.SETTINGS.chatVisibilityPublic",
        },
    });

    registerSetting( 'countTroops', {
        name: 'IMPMAL-COMBAT-RESOLVE.SETTINGS.countTroops',
        scope: 'world',
        config: true,
        type: Boolean,
        default: true
    });

    registerSetting( 'countElites', {
        name: 'IMPMAL-COMBAT-RESOLVE.SETTINGS.countElites',
        scope: 'world',
        config: true,
        type: Boolean,
        default: true
    });

    registerSetting( 'countLeaders', {
        name: 'IMPMAL-COMBAT-RESOLVE.SETTINGS.countLeaders',
        scope: 'world',
        config: true,
        type: Boolean,
        default: true
    });

    registerSetting( 'checkSuperiority', {
        name: 'IMPMAL-COMBAT-RESOLVE.SETTINGS.checkSuperiority',
        hint: 'IMPMAL-COMBAT-RESOLVE.SETTINGS.checkSuperiorityHint',
        scope: 'world',
        config: true,
        type: Boolean,
        default: true
    });

    registerSetting( 'superiorityCheck', {
        name: 'IMPMAL-COMBAT-RESOLVE.SETTINGS.superiorityCheck',
        hint: 'IMPMAL-COMBAT-RESOLVE.SETTINGS.superiorityCheckHint',
        scope: 'world',
        config: true,
        type: String,
        default: 'equalOrGreater',
        choices: {
            equalOrGreater: "IMPMAL-COMBAT-RESOLVE.SETTINGS.superiorityCheckEqualOrGreater",
            greater: "IMPMAL-COMBAT-RESOLVE.SETTINGS.superiorityCheckGreater",
        },
    });

});

class ResolveMessage {

    static postToChatOnRound( diffs, highestLeaderResolve ) {
        const template_file = "modules/impmal-combat-resolve/templates/on_round.hbs";
        const template_data = {
            diffTroops: diffs.troops,
            diffElites: diffs.elites,
            diffLeaders: diffs.leaders,
            highestLeaderResolve: highestLeaderResolve
        };
        this._postToChat( template_file, template_data );
    }

    static postToChatOnTurn( npc, localizedMessage ) {
        const template_file = "modules/impmal-combat-resolve/templates/on_turn.hbs";
        const template_data = { npc, localizedMessage };
        this._postToChat( template_file, template_data, { speaker: { alias: npc.name } } );
    }

    static postToChatOnTurnNoToken( npc, localizedMessage ) {
        const template_file = "modules/impmal-combat-resolve/templates/on_turn.hbs";
        const template_data = { localizedMessage };
        this._postToChat( template_file, template_data, { speaker: { alias: npc.name } } );
    }

    static postToChatOnDecreaseSuperiority( npc ) {
        const template_file = "modules/impmal-combat-resolve/templates/decrease_superiority.hbs";
        const template_data = { npc };
        this._postToChat( template_file, template_data, { speaker: { alias: npc.name } } );
    }

    static postToChatOnDecreaseSuperiorityNoToken( npc ) {
        const template_file = "modules/impmal-combat-resolve/templates/decrease_superiority.hbs";
        const template_data = { };
        this._postToChat( template_file, template_data, { speaker: { alias: npc.name } } );
    }

    static postToChatOnDefeatedPC( npc ) {
        const template_file = "modules/impmal-combat-resolve/templates/defeated_pc.hbs";
        const template_data = { npc };
        this._postToChat( template_file, template_data, { speaker: { alias: npc.name } } );
    }

    static postToChatOnDefeatedPCNoToken( npc ) {
        const template_file = "modules/impmal-combat-resolve/templates/defeated_pc.hbs";
        const template_data = { };
        this._postToChat( template_file, template_data, { speaker: { alias: npc.name } } );
    }

    static async _postToChat( template_file, template_data, params = {} ) {
        const rendered_html = await renderTemplate(template_file, template_data);

        params.content = rendered_html ;
        const chatVisibility = game.settings.get('impmal-combat-resolve','chatVisibility');
        if (chatVisibility === 'private') {
            params.whisper = ChatMessage.getWhisperRecipients('GM')
        }
        ChatMessage.create(params);
    }
}
