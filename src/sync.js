'use strict';
/**
 * sync.js
 * Main cloud sync functionality
 ******************************/

let levelup = require('levelup'),
	fs = require('fs-extra'),
	_ = require('lodash'),
	google = require('googleapis'),
	base64 = require('base64-stream'),
	res = require('../static/js/res'),
	https = require('https'),
	moment = require('moment'),
	EventEmitter = require('events').EventEmitter,
	Account = require('./Account'),
	util = require('./util'),
	crypto = require('./crypto'),
	async = require('async');

const API_REQ_LIMIT = 7;
const CONCURRENCY = 2;
const self = this;
// class SyncEmitter extends EventEmitter {};

// Refer to https://www.googleapis.com/discovery/v1/apis/drive/v3/rest for full request schema

exports.event = new EventEmitter();

exports.genID = function (n = 1) {
	return new Promise(function (resolve, reject) {
		global.drive.files.generateIds({
			count: n,
			space: 'drive'
		}, function (err, res) {
			if (err) {
				console.log(`callback: error genID`);
				return reject(err);
			}
			console.log(`callback: genID`);
			resolve((res.ids.length === 1) ? res.ids[0] : res.ids);
		});
	});
};

// QUEUES
// first global.state.toGet.push(file);
// then enqueue
exports.getQueue = async.queue(function (file, callback) {
	let parentPath = global.state.rfs[file.parents[0]].path;
	const dir = `${global.paths.home}${parentPath}`;
	const path = (parentPath === "/") ? `${dir}${file.name}` : `${dir}/${file.name}`;
	file.path = path;

	fs.mkdirs(dir, function (err) {
		if (err) callback(err);
		// console.log(`GETing ${file.name} at dest ${path}`);
		let dest = fs.createWriteStream(path);

		global.drive.files.get({
				fileId: file.id,
				alt: 'media'
			})
			.on('error', function (err) {
				console.log('Error during download', err);
				callback(err);
			})
			.pipe(dest)
			.on('error', function (err) {
				console.log('Error during writting to fs', err);
				callback(err);
			})
			.on('finish', function () {
				// console.log(`Written ${file.name} to ${path}`);
				// self.event.emit('got', file);
				callback(null, file);
			});
	});
}, CONCURRENCY);

exports.cryptQueue = async.queue(function (file, callback) {
	fs.mkdirs(global.paths.crypted, function (err) {
		if (err) return callback(err);
		let parentPath = global.state.rfs[file.parents[0]].path;
		// let parentPath = (_.has(file, parents)) ? global.state.rfs[file.parents[0]].path : file.parentPath;
		let origpath = (parentPath === "/") ? `${global.paths.home}${parentPath}${file.name}` : `${global.paths.home}${parentPath}/${file.name}`;
		let destpath = `${global.paths.crypted}/${file.name}.crypto`;
		// console.log(`TO ENCRYTPT: ${file.name} (${file.id}) at origpath: ${origpath} to destpath: ${destpath} with parentPath ${parentPath}`);
		crypto.encrypt(origpath, destpath, global.MasterPassKey.get(), function (err, key, iv, tag) {
			if (err) {
				return callback(err);
			} else {
				try {
					file.cryptPath = destpath;
					file.iv = iv.toString('hex');
					file.authTag = tag.toString('hex');
					global.vault[file.id] = _.cloneDeep(file);
					global.vault[file.id].shares = crypto.pass2shares(key.toString('hex'));
					callback(null, file);
				} catch (err) {
					callback(err);
				}
			}
		});
	});
}, CONCURRENCY);

exports.updateQueue = async.queue(function (file, callback) {

	console.log(`TO UPDATE: ${file.name} (${file.id})`);
	global.drive.files.update({
		fileId: file.id,
		resource: {
			name: `${file.name}.crypto`
		},
		contentHints: {
			thumbnail: {
				image: res.thumbnail,
				mimeType: 'image/png'
			}
		},
		media: {
			mimeType: "application/octet-stream",
			body: fs.createReadStream(file.cryptPath)
		},
	}, function (err, res) {
		if (err) {
			console.log(`callback: error updating ${file.name}`);
			return callback(err);
		}
		console.log(`callback: update ${file.name}`);
		file.lastSynced = moment().format();
		callback(null, file);
	});

}, CONCURRENCY);

exports.putQueue = async.queue(function (file, callback) {

	console.log(`TO PUT: ${file.name} (${file.id})`);
	global.drive.files.create({
		fileId: file.id,
		resource: {
			name: `${file.name}.crypto`
		},
		media: {
			mimeType: "application/octet-stream",
			body: fs.createReadStream(file.cryptPath)
		},
	}, function (err, rfile) {
		if (err) {
			console.log(`callback: error putting ${file.name}`);
			return callback(err);
		}
		console.log(`callback: put ${file.name}`);
		file.lastSynced = moment().format();
		global.files[rfile.id] = rfile;
		callback(null, file, rfile);
	});
}, CONCURRENCY);

exports.updateStats = function (file, callback) {
	fs.Stats(file.path, function (err, stats) {
		if (err) {
			console.log(`fs.Stats ERROR: ${err.stack}`);
			return callback(err);
		}
		console.log(`fs.Stats: for ${file.name}, file.mtime = ${stats.mtime}`);
		console.log(`fs.Stats: for ${file.name}, file.size = ${stats.size}`);
		file.mtime = stats.mtime;
		file.size = stats.size;
		// global.files[file.id] = file;
		console.log(`GOT fs.Stat of file, mtime = ${file.mtime}`);
		callback(null, file);
	});

};

// TODO: Implement recursive function
exports.fetchFolderItems = function (folderId, callback) {
	let fsuBtree = [];
	//
	global.drive.files.list({
		q: `'${folderId}' in parents`,
		orderBy: 'folder desc',
		fields: 'files(name,id,fullFileExtension,mimeType,md5Checksum,ownedByMe,parents,properties,webContentLink,webViewLink),nextPageToken',
		spaces: 'drive',
		pageSize: 1000
	}, function (err, res) {
		if (err) {
			callback(err, null);
		} else {
			// if (res.nextPageToken) {
			// 	console.log("Page token", res.nextPageToken);
			// 	pageFn(res.nextPageToken, pageFn, callback(null, res.files));
			// }
			// if (recursive) {
			// 	console.log('Recursive fetch...');
			// 	for (var i = 0; i < res.files.length; i++) {
			// 		let file = res.files[i];
			// 		if (_.isEqual("application/vnd.google-apps.folder", file.mimeType)) {
			// 			console.log('Iteration folder: ', file.name, file.id);
			// 			self.fetchFolderItems(file, true, callback, fsuBtree);
			// 			if (res.files.length === i) {
			// 				// return the retrieved file list (fsuBtree) to callee
			// 				return self.fetchFolderItems(file, true, callback, fsuBtree);
			// 			}
			// 		} else {
			// 			fsuBtree[file.id] = file;
			// 		}
			// 	};
			// } else { // do one Iteration and ignore folders}
			for (var i = 0; i < res.files.length; i++) {
				let file = res.files[i];
				if (!_.isEqual("application/vnd.google-apps.folder", file.mimeType)) {
					console.log(`root/${folderId}/  ${file.name} ${file.id}`);
					global.files[file.id] = file;
					fsuBtree.push(file);
				}
			}
			callback(null, fsuBtree);
		}
	});
};

exports.getAccountInfo = function () {
	return new Promise(function (resolve, reject) {
		console.log('PROMISE: getAccountInfo');
		global.drive.about.get({
			"fields": "storageQuota,user"
		}, function (err, res) {
			if (err) {
				console.log(`IPCMAIN: drive.about.get, ERR occured, ${err}`);
				reject(err);
			} else {
				console.log(`IPCMAIN: drive.about.get, RES:`);
				console.log(`\nemail: ${res.user.emailAddress}\nname: ${res.user.displayName}\nimage:${res.user.photoLink}\n`);
				// get the account photo and convert to base64
				resolve(res);
			}
		});
	});
};

exports.getAllFiles = function (email) {
	// get all drive files and start downloading them
	console.log(`PROMISE for retrieving all of ${email} files`);
	return new Promise(
		function (resolve, reject) {
			let fBtree = [],
				folders = [],
				root,
				rfsTree = {};
			// TODO: Implement Btree for file directory structure
			console.log('PROMISE: getAllFiles');
			console.log(`query is going to be >> 'root' in parents and trashed = false`);
			global.drive.files.list({
				q: `'root' in parents and trashed = false`,
				orderBy: 'folder desc',
				fields: 'files(fullFileExtension,id,md5Checksum,mimeType,name,ownedByMe,parents,properties,webContentLink,webViewLink),nextPageToken',
				spaces: 'drive',
				pageSize: 1000
			}, function (err, res) {
				if (err) {
					reject(err);
				}
				if (res.files.length == 0) {
					console.log('No files found.');
					reject(new Error('No files found'));
				} else {
					console.log('Google Drive files (depth 2):');
					root = res.files[0].parents[0];
					rfsTree[root] = {};
					rfsTree[root]['path'] = `/`;

					for (let i = 0; i < res.files.length; i++) {
						let file = res.files[i];
						if (_.isEqual("application/vnd.google-apps.folder", file.mimeType)) {
							console.log(`Folder ${file.name} found. Calling fetchFolderItems...`);
							folders.push(file.id);
							rfsTree[file.id] = file;
							rfsTree[file.id]['path'] = `${rfsTree[file.parents[0]]['path']}${file.name}`;
						} else {
							console.log(`root/${file.name} (${file.id})`);
							global.files[file.id] = file;
							fBtree.push(file);
						}
					}
					// TODO: map folderIds to their respective files & append to the toGet arr
					async.map(folders, self.fetchFolderItems, function (err, fsuBtree) {
						console.log(`Got ids: ${folders}. Calling async.map(folders, fetchFolderItem,...) to map`);
						if (err) {
							console.log(`Errpr while mapping folders to file array: ${err}`);
							reject(err);
						} else {
							// console.log(`Post-callback ${sutil.inspect(fsuBtree)}`);
							fBtree.push(_.flattenDeep(fsuBtree));
							console.log(`Got fsuBtree: ${fsuBtree}`);
							resolve([fBtree, rfsTree]);
						}
					});
					// TODO: FIX ASYNC issue >> .then invoked before fetchFolderItems finishes entirely (due to else clause always met
				}
			});
		}
	);
};

exports.getPhoto = function (res) {
	console.log('PROMISE: getPhoto');
	return new Promise(
		function (resolve, reject) {
			https.get(res.user.photoLink, function (pfres) {
				if (pfres.statusCode === 200) {
					let stream = pfres.pipe(base64.encode());
					util.streamToString(stream, (err, profileImgB64) => {
						if (err) reject(err);
						console.log(`SUCCESS: https.get(res.user.photoLink) retrieved res.user.photoLink and converted into ${profileImgB64.substr(0, 20)}...`);
						// Now set the account info
						resolve([profileImgB64, res]);
					});
				} else {
					reject(new Error(`ERROR: https.get(res.user.photoLink) failed to retrieve res.user.photoLink, pfres code is ${pfres.statusCode}`));
				}
			});
		}
	);
};

exports.setAccountInfo = function (param) {
	console.log('PROMISE: setAccountInfo');
	let profileImgB64 = param[0],
		acc = param[1];
	return new Promise(function (resolve, reject) {
		let accName = `${acc.user.displayName.toLocaleLowerCase().replace(/ /g,'')}_drive`;
		console.log(`Accounts object key, accName = ${accName}`);
		// Add account to global acc obj
		global.accounts[accName] = new Account('gdrive', acc.user.displayName, acc.user.emailAddress, profileImgB64, {
			"limit": acc.storageQuota.limit,
			"usage": acc.storageQuota.usage,
			"usageInDrive": acc.storageQuota.usageInDrive,
			"usageInDriveTrash": acc.storageQuota.usageInDriveTrash
		}, gAuth);
		resolve(acc.user.emailAddress);
	});
};

exports.getAll = function (toGet, cb) {
	//
	async.eachLimit(toGet, API_REQ_LIMIT, function (file, callback) {
		if (!file) return;
		let parentPath = global.state.rfs[file.parents[0]].path;
		const dir = `${global.paths.home}${parentPath}`;
		const path = (parentPath === "/") ? `${dir}${file.name}` : `${dir}/${file.name}`;
		file.path = path;
		// not linked list with file.id as key!
		global.files[file.id].path = path;

		// TODO: replace with mkdirp
		fs.mkdirs(dir, function (err) {
			if (err) callback(err);
			console.log(`GETing ${file.name} at dest ${path}`);
			let dest = fs.createWriteStream(path);
			// TODO: figure out a better way of limiting API requests to less than 10/s (Google API limit)

			global.drive.files.get({
					fileId: file.id,
					alt: 'media'
				})
				.on('error', function (err) {
					console.log('Error during download', err);
					callback(err);
				})
				.pipe(dest)
				.on('error', function (err) {
					console.log('Error during writting to fs', err);
					callback(err);
				})
				.on('finish', function () {
					// console.log(`Written ${file.name} to ${path}`);
					// self.event.emit('got', file);
					_.pull(toGet, file); // remove from toGet queue
					global.state.toCrypt.push(file); // add from toCrypt queue
					callback();
				});
		});
	}, function (err) {
		cb(err);
	});
};

exports.cryptAll = function (toCrypt, cb) {

	fs.mkdirs(global.paths.crypted, function (err) {
		if (err) callback(err);
		async.each(toCrypt, function (file, callback) {
			if (!file) return;
			let parentPath = global.state.rfs[file.parents[0]].path;
			let origpath = (parentPath === "/") ? `${global.paths.home}${parentPath}${file.name}` : `${global.paths.home}${parentPath}/${file.name}`;
			let destpath = `${global.paths.crypted}/${file.name}.crypto`;
			console.log(`TO ENCRYTPT: ${file.name} (${file.id}) at origpath: ${origpath} to destpath: ${destpath} with parentPath ${parentPath}`);
			crypto.encrypt(origpath, destpath, global.MasterPassKey.get(), function (err, key, iv, tag) {
				if (err) {
					return callback(err);
				} else {
					try {
						file.cryptPath = destpath;
						file.iv = iv.toString('hex');
						file.authTag = tag.toString('hex');
						global.files[file.id] = file;
						global.vault[file.id] = file;
						global.vault[file.id].shares = crypto.pass2shares(key.toString('hex'));
						// global.state.toUpdate.push(file);
						// _.pull(toCrypt, file);
						// self.event.emit('encrypted', file);
						callback();
					} catch (err) {
						callback(err);
					}
				}
			});
		}, function (err) {
			// if any of the file processing produced an error, err would equal that error
			cb(err);
		});
	});
};

exports.putAll = function (cb) {

	async.eachLimit(global.state.toUpdate, API_REQ_LIMIT, function (file, callback) {
		if (!file) return;
		console.log(`TO PUT: ${file.name} (${file.id})`);
		global.drive.files.update({
			fileId: file.id,
			resource: {
				name: `${file.name}.crypto`
			},
			media: {
				mimeType: "application/octet-stream",
				body: fs.createReadStream(file.cryptPath)
			},
		}, function (err, res) {
			if (err) {
				console.log(`callback: error putting ${file.name}`);
				return callback(err);
			}
			console.log(`callback: put ${file.name}`);
			file.lastSynced = moment().format();
			_.pull(global.state.toCrypt, file);
			self.event.emit('put', file);
			return callback();
		});
	}, function (err) {
		cb(err);
	});
};
