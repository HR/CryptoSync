/** @jsx React.DOM */

var defaultPanel = React.createClass({displayName: "defaultPanel",
	render: function() {
		return (
			React.createElement("div", {id: "panel-default current"}, 
				React.createElement("header", null, 
					React.createElement("h1", null, "Unlock the Vault"), 
					React.createElement("p", null, "Please enter your MasterPass to unlock the Vault"), 
					React.createElement("img", {class: "info", src: "../../static/images/icons/info.svg", alt: ""}), 
					React.createElement("p", {class: "info"}, "The Vault that contains all the secret keys for your encrypted data is encrypted using a Master Password - your MasterPass")
				), 
				React.createElement(MPform, null), 
				React.createElement("footer", null, 
					React.createElement("a", {href: "#", class: "navigationLink", "data-target": "shares"}, "Got shares?")
				)
			)
		);
	}
});

var MPform = React.createClass({displayName: "MPform",
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
		React.createElement("form", {onSubmit: this.handleSubmit}, 
			React.createElement("div", {class: "masterpass"}, 
				React.createElement("input", {type: "password", name: "masterpass", class: "", placeholder: "********", 
					value: this.state.masterpass, 
					onChange: this.handleMasterPassChange}
				), 
				React.createElement("label", {for: "password"}, "INCORRECT MASTER PASSWORD")
			), 

			React.createElement("div", {class: "forgotMP"}, 
				React.createElement("a", {class: "navigationLink", "data-target": "reset"}, "Forgot MasterPass?")
			), 

			React.createElement("div", {class: "submit"}, 
				React.createElement("input", {type: "submit", value: "Unlock"})
			)
		)
		);
	}
});

var MPprompt = React.createClass({displayName: "MPprompt",
	render: function() {
		return (
			React.createElement("section", {id: "masterpassprompt"}, 
				React.createElement("img", {src: "images/icons/CryptoSyncVault.svg", alt: "Crypto.Sync Vault icon", id: "vault"}), 
				React.createElement("div", {class: "panel-container"}, 
					React.createElement("defaultPanel", null)
				)
			)
		);
	}
});