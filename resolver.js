Hooks.on("combatRound", (combat) => 
{
    if (!game.user.isGM) {
        return;
    }
    let currentDefeated = combat.combatants.filter( a => a.isDefeated && a.actor.type === 'npc' );

    const countElites = game.settings.get('impmal-combat-resolve','countElites');
    const countLeaders = game.settings.get('impmal-combat-resolve','countLeaders');
    const countTroops = game.settings.get('impmal-combat-resolve','countTroops');

    const diffs = {
        troops: 0,
        elites: 0,
        leaders: 0,
        all: function() {
            return this.troops + this.elites + this.leaders;
        }
    }

    if (countTroops) {
        const defeatedTrops = currentDefeated.map( a => a.actor.system.role === 'troop' ).filter( a => a == true ).length;
        diffs.troops = defeatedTrops - (game.combat.getFlag( 'impmal-combat-resolve', 'previousDefeatedTroops' ) ?? 0);
        if (diffs.troops < 0) {
            diffs.troops = 0;
        }
        game.combat.setFlag( 'impmal-combat-resolve', 'previousDefeatedTroops', defeatedTrops );
    }
    if (countElites) {
        const defeatedElites = currentDefeated.map( a => a.actor.system.role === 'elite' ).filter( a => a == true ).length;
        diffs.elites = defeatedElites - (game.combat.getFlag( 'impmal-combat-resolve', 'previousDefeatedElites' ) ?? 0);
        if (diffs.elites < 0) {
            diffs.elites = 0;
        }
        game.combat.setFlag( 'impmal-combat-resolve', 'previousDefeatedElites', defeatedElites );
    }
    if (countLeaders) {
        const defeatedLeaders = currentDefeated.map( a => a.actor.system.role === 'leader' ).filter( a => a == true ).length;
        diffs.leaders = defeatedLeaders - (game.combat.getFlag( 'impmal-combat-resolve', 'previousDefeatedLeaders' ) ?? 0);
        if (diffs.leaders < 0) {
            diffs.leaders = 0;
        }
        game.combat.setFlag( 'impmal-combat-resolve', 'previousDefeatedLeaders', defeatedLeaders );
    }

    if (diffs.all() > 0) {
        const sendToChat = game.settings.get('impmal-combat-resolve','sendToChat');
        const highestLeaderResolve = Math.max( ...combat.combatants.filter( a => !a.isDefeated && a.actor.type === 'npc' && ( a.actor.system.role === 'leader' || a.actor.system.role === 'troop' ) ).map( a => a.actor.system.combat.resolve ) );
        if (sendToChat == 'on_counters' || sendToChat == 'on_counters_and_superiority') {
            // let restNpcs;
            // const showNPCBelowSuperiority = game.settings.get('impmal-combat-resolve','showNPCBelowSuperiority');
            // if (showNPCBelowSuperiority == 'on_round' || showNPCBelowSuperiority == 'on_round_and_turn') {
                // restNpcs = combat.combatants.filter( a => !a.isDefeated && a.actor.type === 'npc' && a.actor.system.role === 'troop' && a.actor.system.combat.resolve <= game.settings.get("impmal", "superiority") ).map( a => a.token );
            // }
            ResolveMessage.postToChatOnRound( diffs, (highestLeaderResolve !== -Infinity ? highestLeaderResolve : null) );
        } else {
            let message = game.i18n.localize('IMPMAL-COMBAT-RESOLVE.MESSAGES.inLastRound');
            if (highestLeaderResolve !== -Infinity) {
                message += " " + game.i18n.localize('IMPMAL-COMBAT-RESOLVE.MESSAGES.highestResolve') + " " + highestLeaderResolve + "."
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

Hooks.on("updateCombat", (combat, data) => 
{
    if (!game.user.isGM) {
        return;
    }
    if (game.settings.get('impmal-combat-resolve','checkSuperiority')) {
        if (data.turn !== undefined || data.round !== undefined) // If switching turns or rounds, doesn't matter the direction
        {
            if (game.settings.get('impmal-combat-resolve','showNPCBelowSuperiority')) {
                const combatant = combat.combatant;
                if (!combatant.isDefeated && combatant.actor.system.combat.resolve <= game.settings.get("impmal", "superiority")) {
                    const sendToChat = game.settings.get('impmal-combat-resolve','sendToChat');
                    if (sendToChat == 'on_superiority' || sendToChat == 'on_counters_and_superiority') {
                        ResolveMessage.postToChatOnTurn( combatant.token );
                    } else {
                        ui.notifications.info( (combatant.actor.token ? combatant.actor.token.name : combatant.actor.prototypeToken.name) + ": " + game.i18n.localize('IMPMAL-COMBAT-RESOLVE.MESSAGES.currentCombatant') );
                    }
                }
            }
        }
    }
});

Hooks.on("init", () => {
    game.settings.register('impmal-combat-resolve', 'sendToChat', {
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

    game.settings.register('impmal-combat-resolve', 'showNPCBelowSuperiority', {
        name: 'IMPMAL-COMBAT-RESOLVE.SETTINGS.showNPCBelowSuperiority',
        hint: 'IMPMAL-COMBAT-RESOLVE.SETTINGS.showNPCBelowSuperiorityHint',
        scope: 'world',
        config: true,
        type: Boolean,
        default: true
    });

    game.settings.register('impmal-combat-resolve', 'chatVisibility', {
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

    game.settings.register('impmal-combat-resolve', 'countTroops', {
        name: 'IMPMAL-COMBAT-RESOLVE.SETTINGS.countTroops',
        scope: 'world',
        config: true,
        type: Boolean,
        default: true
    });

    game.settings.register('impmal-combat-resolve', 'countElites', {
        name: 'IMPMAL-COMBAT-RESOLVE.SETTINGS.countElites',
        scope: 'world',
        config: true,
        type: Boolean,
        default: true
    });

    game.settings.register('impmal-combat-resolve', 'countLeaders', {
        name: 'IMPMAL-COMBAT-RESOLVE.SETTINGS.countLeaders',
        scope: 'world',
        config: true,
        type: Boolean,
        default: true
    });

    game.settings.register('impmal-combat-resolve', 'checkSuperiority', {
        name: 'IMPMAL-COMBAT-RESOLVE.SETTINGS.checkSuperiority',
        hint: 'IMPMAL-COMBAT-RESOLVE.SETTINGS.checkSuperiorityHint',
        scope: 'world',
        config: true,
        type: Boolean,
        default: true
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

    static postToChatOnTurn( npc ) {
        const template_file = "modules/impmal-combat-resolve/templates/on_turn.hbs";
        const template_data = {
            npc: npc
        };
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
