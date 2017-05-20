'use strict';

var app = require('../../server/server');
var Alarm = app.models.Alarm;

module.exports = function(VoiceNote) {
  VoiceNote.beforeRemote('create', function(ctx, modelInstance, next) {
    var token = ctx.args.options.accessToken;
    var currentUserId = token && token.userId;
    ctx.args.data.senderId = currentUserId;
    next();
  });

  VoiceNote.markAsListen = function(id, options, cb) {
    var token = options && options.accessToken;
    var currentUserId = token && token.userId;
    VoiceNote.findOneById(id, function(err, voiceNote) {
      if (err) return cb(err);
      if (voiceNote) {
        Alarm.findOneById(voiceNote.alarmId, function(err, alarm) {
          if (err) return cb(err);
          if (alarm.userId.toString() === currentUserId.toString()) {
            voiceNote.status = 'listened';
            voiceNote.save({}, function(err, data) {
              cb(err, data ? true : false);
            });
          } else {
            cb(null, false);
          }
        });
      } else {
        cb(null, false);
      }
    });
  };

  VoiceNote.remoteMethod(
    'markAsListen', {
      accepts: [{
        arg: 'id',
        type: 'string',
        required: true,
      },
      {
        arg: 'options',
        type: 'object',
        http: 'optionsFromRequest',
      }],
      returns: {
        arg: 'success',
        type: 'boolean',
        root: true,
      },
      http: {
        path: '/:id/mark-as-listen',
        verb: 'post',
      },
    }
  );
};
