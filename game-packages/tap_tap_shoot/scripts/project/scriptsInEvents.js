

// Stub CrazyGames SDK - not needed for standalone play
var crazysdk = {
	gameplayStart: function() {},
	gameplayStop: function() {},
	displayAd: function() { return Promise.resolve(); }
};

const scriptsInEvents = {

	async Egame_Event16_Act12(runtime, localVars)
	{
		crazysdk.gameplayStop();
	},

	async Egame_Event18_Act7(runtime, localVars)
	{
		crazysdk.gameplayStart();
	},

	async Egame_Event27_Act6(runtime, localVars)
	{
		crazysdk.gameplayStop();
	},

	async Egame_Event133_Act3(runtime, localVars)
	{
		crazysdk.gameplayStart();
	},

	async Eqkyads_Event2_Act3(runtime, localVars)
	{
		await crazysdk.displayAd('midgame');
	}

};

self.C3.ScriptsInEvents = scriptsInEvents;
