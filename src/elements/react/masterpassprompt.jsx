var React = require('react');
/** @jsx React.DOM */

var defaultPanel = React.createClass({
	render: function() {
		return (
			<div id="panel-default current">
				<header>
					<h1>Unlock the Vault</h1>
					<p>Please enter your MasterPass to unlock the Vault</p>
					<img class="info" src="../../static/images/icons/info.svg" alt="" />
					<p class="info">The Vault that contains all the secret keys for your encrypted data is encrypted using a Master Password - your MasterPass</p>
				</header>
				<MPform />
				<footer>
					<a href="#" class="navigationLink" data-target="shares">Got shares?</a>
				</footer>
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
				<a class="navigationLink" data-target="reset">Forgot MasterPass?</a>
			</div>

			<div class="submit">
				<input type="submit" value="Unlock" />
			</div>
		</form>
		);
	}
});

var MPprompt = React.createClass({
	render: function() {
		return (
			<section id="masterpassprompt">
				<img src="images/icons/CryptoSyncVault.svg" alt="Crypto.Sync Vault icon" id="vault" />
				<div class="panel-container">
					<defaultPanel />
				</div>
			</section>
		);
	}
});
