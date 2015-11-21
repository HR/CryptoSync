var React = require('react');
var ReactDOM = require('react-dom');
var ipc = require('ipc');
// var Routes = RRouter.Routes;
// var Route = RRouter.Route;
/** @jsx React.DOM */

var MPprompt = React.createClass({
	render: function() {
		return (
			<div class="main">
				<img src="images/icons/CryptoSyncVault.svg" alt="Crypto.Sync Vault icon" id="vault" />
				<header>
					<h1>Unlock the Vault</h1>
					<p>Please enter your Master Password to unlock the vault
					</p>
					<img class="info" src="images/icons/info.svg" alt="" />
					<p class="info">The vault that contains all the secret keys for your encrypted data is encrypted using your Master Password</p>
				</header>
				<MPform/>
				<MPfooter/>
			</div>
		);
	}
});

var MPform = React.createClass({
	propTypes: {
		masterpass: React.PropTypes.string.isRequired
	},
	getInitialState: function() {
	 return {masterpass: ''};
	},
	handleMasterPassChange: function(e) {
	 this.setState({masterpass: e.target.value});
	},
	handleSubmit: function(e) {
		e.preventDefault();
		var masterpass = this.state.masterpass;
		var sendMasterPass = function() {
			ipc.send('masterpass-submitted', masterpass);
		};
		if (!text || !author) {
			return;
		}
		// TODO: call decrypt db function
	},
	render: function() {
		return (
		<form onSubmit={this.handleSubmit}>
			<div class="masterpass">
				<input type="password" name="masterpass" class="" placeholder="********"
					value={this.state.masterpass}
					onChange={this.handleMasterPassChange}
				/>
				<label for="password">INCORRECT MASTER PASSWORD</label>
			</div>

			<div class="forgotMP">
				<a>Forgot MasterPass?</a>
			</div>

			<div class="submit">
				<input type="submit" value="Unlock" />
			</div>
		</form>
		);
	}
});

var MPfooter = React.createClass({
	getInitialState: function() {
	 return {click: ''};
	},
	handleChange: function(e) {
		// this.setState({click: event.target});
	},
	render: function() {
		return (
			<footer>
				<a onclick={this.handleChange} onChange={this.handleChange}>Got shares?</a>
			</footer>
		);
	}
});


var MPsharesform = React.createClass({
	handleChange: function(e) {
		// transition
		var entity = this.state.entity;
		switch(e.target.name) {
			case 'masterpass':
				entity.masterpass = e.target.value;
				break;
		}

		this.setState({
			entity: entity
		});
	},
	render: function() {
		return (
			<form onsubmit={this.handleChange}>
				<div class="masterpass">
					<label for="password">INCORRECT SECRET SHARES(S)</label>
				</div>

				<div class="checkbox">
					<input type="checkbox" name="checkbox" />
					<label for="checkbox">Remember temporarily</label>
				</div>

				<div class="submit">
					<input type="submit" value="Unlock" />
				</div>
			</form>
		);
	}
});

var MPsharesinput = React.createClass({
	render: function() {
		return (
			<input type="password" name="masterpass" placeholder="********" value="{this.state.masterpassshare}" />
		);
	}
});

var MPsharesfooter = React.createClass({
	handleChange: function(e) {
		// transition to other page
	},
	render: function() {
		return (
			<footer>
				<a onclick={this.handleChange}>
					<img src="../../static/images/icons/back.svg" alt="" />
				</a>
			</footer>
		);
	}
});

ReactDOM.render(
	<MPprompt />,
	document.getElementById('masterpassprompt').getElementsByName('div')[0]
);
