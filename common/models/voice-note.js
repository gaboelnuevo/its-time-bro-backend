'use strict';
var LoopBackContext = require('loopback-context');

module.exports = function(VoiceNote) {
  VoiceNote.beforeRemote('create', function(ctx, modelInstance, next) {
    var ctx = LoopBackContext.getCurrentContext();
    var currentUser = ctx && ctx.get('currentUser');
    ctx.args.data.senderId = currentUser ? currentUser.id : null;
    next();
  });
};
