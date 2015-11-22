var React = require('react');
var ipc = require('ipc');

var CommentBox = React.createClass({displayName: 'CommentBox',
  render: function() {
    return (
      React.createElement('div', null,
        "Hello, world! I am a CommentBox."
      )
    );
  }
});
