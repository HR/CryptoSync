'use strict';
const electron = require('electron');
const app = electron.app;
const fs = require('fs-plus');

exports.paths = {
	home: fs.getHomeDirectory()+"/CryptoSync",
	mdb: app.getPath("userData")+"/cryptosync/mdb",
	userData: app.getPath("userData")+"/cryptosync",
	vault: fs.getHomeDirectory()+"/CryptoSync/Vault"
};
