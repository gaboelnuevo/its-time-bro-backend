'use strict';

var app = require('../../server/server');
var UserNotification = app.models.UserNotification;
var Alarm = app.models.Alarm;

module.exports = function(VoiceNote) {
  VoiceNote.beforeRemote('create', function(ctx, modelInstance, next) {
    var token = ctx.args.options.accessToken;
    var currentUserId = token && token.userId;
    ctx.args.data.senderId = currentUserId;
    next();
  });

  VoiceNote.observe('after save', function(ctx, next) {
    if (ctx.isNewInstance && ctx.instance.status === 'sent') {
      Alarm.findOne({
        where: {
          alarmId: ctx.instance.alarmId,
          status: 'active',
        },
      }).then(function(alarm) {
        return UserNotification.create({
          type: 'voicenote',
          userId: alarm.userId,
          payload: {
            alarmId: alarm.id,
            voiceNoteId: ctx.instance.id,
          },
        });
      }).then(function(notification) {
        next();
      }).catch(function(err) {
        next(err);
      });
    } else {
      next();
    }
  });
};
