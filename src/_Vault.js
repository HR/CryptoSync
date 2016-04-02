/**
 * _Vault.js
 * Vault (protected) class
 ******************************/

var Vault = (function () {
	const vault = new WeakMap();

	function Vault(data) {
		// var props = {
		// 	crypted: crypted,
		// 	path: path,
		// 	viv: viv,
		// 	authTag: authTag,
		// 	data: data
		// };
		vault.set(this, data);
	}

	Vault.prototype.get = function (other) {
		return vault.get(id);
	};

	Vault.prototype.set = function (id) {
		vault.set(id);
	};

	Vault.prototype.delete = function (id) {
		vault.delete(id);
	};

	Vault.prototype.has = function (id) {
		return vault.has(id);
	};

	return Vault;
}());


module.exports = Vault;
