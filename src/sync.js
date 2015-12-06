'use strict';
let levelup = require('levelup'),
		fs = require('fs-plus'),
		crypto = require('./crypto');

sync.prototype.upload = function(file, account){
	// Code to upload to account
};

sync.prototype.fetchFileList = function(account){
	// Fetch the entire file list for the account
};

sync.prototype.fetchFile = function(file, account){
	// Fetch the file for the specified account
};

module.exports = sync;
