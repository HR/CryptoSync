var remote = require('electron').remote,
	ipcRenderer = require('electron').ipcRenderer,
	webContents = remote.getCurrentWebContents(),
	rconsole = remote.getGlobal("console"),
	nav_to = getParam("nav_to", window.document.URL),
	authErr,
	errLabel;
window.$ = window.jQuery = require('jquery');

/* Network change event */
function updateOnlineStatus() {
	ipcRenderer.send('online-status-changed', navigator.onLine ? 'online' : 'offline');
};
$(window).on('online', updateOnlineStatus);
$(window).on('offline', updateOnlineStatus);
updateOnlineStatus();

/* Encryption animation */
$(window).load(function() {
	$(document).keydown(function(e) {
		switch (e.which) {
			case 39: // right
				navigate($("#panel-default button").first().data("target"));
				break;
			case 37: // left
				navigate($(".current .back").first().data("target"));
				break;

			default:
				return; // exit this handler for other keys
		}
		e.preventDefault(); // prevent the default action (scroll / move caret)
	});
	/* Variable assignments */
	authErr = $("div.item.err > div.name").first();
	errLabel = $('label[for="password"]').first();
	/* Navigation */
	authErr.hide();
	errLabel.hide();
	$(".navigationLink").each(function(index) {
		$(this).click(function() {
			if (this.hasAttribute("data-auth")) navigate(this.getAttribute("data-target"), this.getAttribute("data-auth"));
			navigate(this.getAttribute("data-target"));
		});
	});

	navigate((nav_to) ? nav_to : "default");

	/* setMasterPass */
	$("#setMasterPass").click(function() {
		console.log("setMasterPass button clicked");
		var MPregex = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[$@$!%*#?&])[A-Za-z\d$@$!%*#?&]{8,}$/g,
			MasterPass = $("input#name").val();
		if (MPregex.test(MasterPass)) {
			errLabel.hide();
			ipcRenderer.send("setMasterPass", MasterPass);
		} else if (!MasterPass) {
			errLabel.text("please enter a masterpass".toLocaleUpperCase());
			errLabel.show();
		} else {
			errLabel.text("must contain at least 1 Alphabet, 1 number and 1 special character".toLocaleUpperCase());
			errLabel.show();
		}
	});
	$("#done").click(function() {
		ipcRenderer.send("done");
	});

	/* Encryption animation */

	if (!nav_to) {
		var speed = 4500;
		var offseted = speed * 0.6;
		$('.marquee-1').marquee({
			direction: 'right',
			gap: 0,
			duplicated: true,
			duration: speed
		}).addClass("visible");

		$('.marquee-2').marquee({
			direction: 'right',
			gap: 0,
			duplicated: true,
			duration: speed,
			delayBeforeStart: offseted
		});

		setTimeout(function() {
			$('.marquee-2').addClass("visible");
		}, offseted);
		$(".marquee").css("position", "relative");
		$(".banner + .himg").css("margin-top", "-7.5rem");
	}
});

/* Helper functions */
function navigate(panelID, authType) {
	var oldSel = $('.panel-container > div.current');
	var currSel = $("#panel-" + panelID);
	if (authType) {
		rconsole.log(`authType: ${authType}`);
		authErr.hide();
		initAuth(authType);
	}
	// TODO: find cleaner fix for unexpected button styling on panel transform
	$(".current button").hide();
	if (oldSel) oldSel.removeClass("current");
	$("#panel-" + panelID).addClass("current");
	$(".current button").show();
}

/* Authentication code retrieval */
function getParam(name, url) {
	name = name.replace(/[\[]/, "\\[").replace(/[\]]/, "\\]");
	var regex = new RegExp("[\\?&]" + name + "=([^&#]*)"),
		results = regex.exec(url);
	return (results === null) ? "" : decodeURIComponent(results[1].replace(/\+/g, " "));
}

function initAuth(authType) {
	// sendAuth event to main
	navigate("auth");
	ipcRenderer.send("initAuth", authType);
}

/* Event listeners */
ipcRenderer.on("authResult", function(event, err) {
	rconsole.log(`IPCRENDER: authResult emitted`);
	// handle authResult
	if (!err) {
		// SUCCESS
		rconsole.log("IPCRENDER: No err. Navigating to masterpass...");
		navigate("masterpass");
		// Send code to call back and redirect
		// callback(code, function(err, authed) {
		// 	// body...
		// });
	} else if (err === "access_denied") {
		rconsole.log("IPCRENDER: ERR, access_denied");
		authErr.text("Access to your account was denied. Please try again.").show();
		navigate("accounts");
	} else {
		rconsole.log(`IPCRENDER: unknown ERR, ${err}`);
		authErr.text(`Unknown error: ${err}`).show();
		navigate("accounts");
	}
});
ipcRenderer.on("setMasterPassResult", function(event, err) {
	rconsole.log("IPCRENDER: setMasterPassResult emitted");
	if (err) {
		errLabel.text(`ERROR: ${err}`.toLocaleUpperCase());
		errLabel.show();
	} else {
		navigate("done");
	}
});
