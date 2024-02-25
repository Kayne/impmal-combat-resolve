Hooks.on("combatRound", (combat) => 
{
    let currentDefeated = combat.combatants.filter( a => a.isDefeated && a.actor.type === 'npc' );

    const countElites = game.settings.get('impmal-combat-resolve','countElites');
    const countLeaders = game.settings.get('impmal-combat-resolve','countLeaders');
    const countTroops = game.settings.get('impmal-combat-resolve','countTroops');

    let diffTroops = 0;
    let diffElites = 0;
    let diffLeaders = 0;

    if (countTroops) {
        const defeatedTrops = currentDefeated.map( a => a.actor.system.role === 'troop' ).filter( a => a == true ).length;
        diffTroops = defeatedTrops - (game.combat.getFlag( 'impmal-combat-resolve', 'previousDefeatedTroops' ) ?? 0);
        if (diffTroops < 0) {
            diffTroops = 0;
        }
        game.combat.setFlag( 'impmal-combat-resolve', 'previousDefeatedTroops', defeatedTrops );
    }
    if (countElites) {
        const defeatedElites = currentDefeated.map( a => a.actor.system.role === 'elite' ).filter( a => a == true ).length;
        diffElites = defeatedElites - (game.combat.getFlag( 'impmal-combat-resolve', 'previousDefeatedElites' ) ?? 0);
        if (diffElites < 0) {
            diffElites = 0;
        }
        game.combat.setFlag( 'impmal-combat-resolve', 'previousDefeatedElites', defeatedElites );
    }
    if (countLeaders) {
        const defeatedLeaders = currentDefeated.map( a => a.actor.system.role === 'leader' ).filter( a => a == true ).length;
        diffLeaders = defeatedLeaders - (game.combat.getFlag( 'impmal-combat-resolve', 'previousDefeatedLeaders' ) ?? 0);
        if (diffLeaders < 0) {
            diffLeaders = 0;
        }
        game.combat.setFlag( 'impmal-combat-resolve', 'previousDefeatedLeaders', defeatedLeaders );
    }

    if (diffTroops > 0 || diffElites > 0 || diffLeaders > 0) {
        if (game.settings.get('impmal-combat-resolve','sendToChat')) {
            let restNpcs;
            if (game.settings.get('impmal-combat-resolve','showNPCBelowSuperiority')) {
                restNpcs = combat.combatants.filter( a => !a.isDefeated && a.actor.type === 'npc' && a.actor.system.role === 'troop' && a.actor.system.combat.resolve <= game.settings.get("impmal", "superiority") ).map( a => a.token );
                console.log(restNpcs);
            }
            ResolveMessage.postToChat( diffTroops, diffElites, diffLeaders, restNpcs ) 
        } else {
            let message = game.i18n.localize('IMPMAL-COMBAT-RESOLVE.MESSAGES.inLastRound');
            if (diffTroops > 0) {
                message += " " + diffTroops + " " + game.i18n.localize('IMPMAL-COMBAT-RESOLVE.MESSAGES.troopsDefeated');
            }
            if (diffElites > 0) {
                message += " " + diffElites + " " + game.i18n.localize('IMPMAL-COMBAT-RESOLVE.MESSAGES.elitesDefeated');
            }
            if (diffLeaders > 0) {
                message += " " + diffLeaders + " " + game.i18n.localize('IMPMAL-COMBAT-RESOLVE.MESSAGES.leadersDefeated');
            }
            ui.notifications.info(message);
        }
    }
});

Hooks.on("init", () => {
    game.settings.register('impmal-combat-resolve', 'sendToChat', {
        name: 'IMPMAL-COMBAT-RESOLVE.SETTINGS.sentToChat',
        hint: 'IMPMAL-COMBAT-RESOLVE.SETTINGS.sentToChatHint',
        scope: 'world',     // "world" = sync to db, "client" = local storage 
        config: true,       // false if you dont want it to show in module config
        type: Boolean,       // Number, Boolean, String,  
        default: true
    });

    game.settings.register('impmal-combat-resolve', 'showNPCBelowSuperiority', {
        name: 'IMPMAL-COMBAT-RESOLVE.SETTINGS.showNPCBelowSuperiority',
        hint: 'IMPMAL-COMBAT-RESOLVE.SETTINGS.showNPCBelowSuperiorityHint',
        scope: 'world',     // "world" = sync to db, "client" = local storage 
        config: true,       // false if you dont want it to show in module config
        type: Boolean,       // Number, Boolean, String,  
        default: true
    });

    game.settings.register('impmal-combat-resolve', 'chatVisibility', {
        name: 'IMPMAL-COMBAT-RESOLVE.SETTINGS.chatVisibility',
        hint: 'IMPMAL-COMBAT-RESOLVE.SETTINGS.chatVisibilityHint',
        scope: 'world',     // "world" = sync to db, "client" = local storage 
        config: true,       // false if you dont want it to show in module config
        type: String,       // Number, Boolean, String,  
        default: true,
        choices: {
            private: "IMPMAL-COMBAT-RESOLVE.SETTINGS.chatVisibilityPrivate",
            public: "IMPMAL-COMBAT-RESOLVE.SETTINGS.chatVisibilityPublic",
        },
    });

    game.settings.register('impmal-combat-resolve', 'countTroops', {
        name: 'IMPMAL-COMBAT-RESOLVE.SETTINGS.countTroops',
        scope: 'world',     // "world" = sync to db, "client" = local storage 
        config: true,       // false if you dont want it to show in module config
        type: Boolean,       // Number, Boolean, String,  
        default: true
    });

    game.settings.register('impmal-combat-resolve', 'countElites', {
        name: 'IMPMAL-COMBAT-RESOLVE.SETTINGS.countElites',
        scope: 'world',     // "world" = sync to db, "client" = local storage 
        config: true,       // false if you dont want it to show in module config
        type: Boolean,       // Number, Boolean, String,  
        default: true
    });

    game.settings.register('impmal-combat-resolve', 'countLeaders', {
        name: 'IMPMAL-COMBAT-RESOLVE.SETTINGS.countLeaders',
        scope: 'world',     // "world" = sync to db, "client" = local storage 
        config: true,       // false if you dont want it to show in module config
        type: Boolean,       // Number, Boolean, String,  
        default: true
    });

});

class ResolveMessage {
    static async postToChat(diffTroops, diffElites, diffLeaders, npcs) {
        const template_file = "modules/impmal-combat-resolve/templates/chat_message.hbs";
        const template_data = { 
            diffTroops: diffTroops,
            diffElites: diffElites,
            diffLeaders: diffLeaders,
            npcs: npcs
        };
        const rendered_html = await renderTemplate(template_file, template_data);

        let params = { content: rendered_html };
        const chatVisibility = game.settings.get('impmal-combat-resolve','chatVisibility');
        if (chatVisibility === 'private') {
            params.whisper = ChatMessage.getWhisperRecipients('GM')
        }
        ChatMessage.create(params);
    }
}
