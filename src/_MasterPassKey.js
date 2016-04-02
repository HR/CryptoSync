'use strict';
/**
 * MasterPass.js
 * Provides a way to securely set and retrieve the MasterPass globally
 ******************************/

// private static class member
// var MP = Symbol();
// module.exports = class MasterPassKey {
// 	static get() {
// 		return this[MP];
// 	}
// 	static set(mp) {
// 		this[MP] = mp;
// 	}
// };

const MasterPassKey = (function () {
	const mpk = new WeakMap();

	function MasterPassKey(key) {
		mpk.set(this, key);
	}

	MasterPassKey.prototype.get = function () {
		if (mpk.get(this) === undefined) {
			return new Error('MasterPassKey has been deleted');
		} else {
			return mpk.get(this);
		}
	};

	MasterPassKey.prototype.set = function (key) {
		mpk.set(this, key);
	};

	MasterPassKey.prototype.delete = function (key) {
		mpk.delete(this);
	};

	return MasterPassKey;
}());


module.exports = MasterPassKey;
