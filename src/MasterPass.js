"use strict";
var MP = Symbol();
module.exports = class MasterPass {
	static get() {
		return this[MP];
	}
	static set(mp) {
		this[MP] = mp;
	}
};
