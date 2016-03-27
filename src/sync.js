'use strict';
let levelup = require('levelup'),
	fs = require('fs-plus'),
	_ = require('lodash'),
	google = require('googleapis'),
	EventEmitter = require('events'),
	crypto = require('./crypto');

class SyncEmitter extends EventEmitter {};

module.exports = class Sync {
	static event() {
		return new SyncEmitter();
	}
};
