"use strict";
/**
 * MasterPass.js
 * Provides a way to securely set and retrieve the MasterPass globally
 ******************************/

// private static class member
var MP = Symbol();
module.exports = class MasterPass {
	static get() {
		return this[MP];
	}
	static set(mp) {
		this[MP] = mp;
	}
};
