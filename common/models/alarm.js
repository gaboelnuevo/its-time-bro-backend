'use strict';

var app = require('../../server/server');
var LoopBackContext = require('loopback-context');

var VOICENOTE_TEMPLATE_ID = process.env.TRANSLOADIT_VOICENOTE_TEMPLATE_ID;
VOICENOTE_TEMPLATE_ID = 'd3de6780f48311e684cb616f38f5e4bd';

module.exports = function(Alarm) {
  Alarm.beforeRemote('create', function(ctx, modelInstance, next) {
    var ctx = LoopBackContext.getCurrentContext();
    var currentUser = ctx && ctx.get('currentUser');
    ctx.args.data.userId = currentUser ? currentUser.id : null;
    next();
  });

  Alarm.friendsAlarms  = function(cb) {
    var UserModel = app.models.AppUser;
    var ctx = LoopBackContext.getCurrentContext();
    var currentUser = ctx && ctx.get('currentUser');
    var userId = currentUser ? currentUser.id : null;
    var threeHoursAgo = new Date((new Date()).valueOf() - 1000 * 60 * 60 * 3);
    if (userId) {
      UserModel.listFriendsIds(userId, function(err, friendsIds) {
        if (err) cb(err);
        Alarm.find({
          where: {
            status: 'active',
            waketime: {gte: threeHoursAgo},
            userId: {
              inq: friendsIds || [],
            },
          },
          include: ['user'],
          order: 'waketime ASC',
        }, cb);
      });
    } else {
      cb(null, []);
    }
  };

  Alarm.calcSignature = function(id, cb) {
    var params = {
      'template_id': VOICENOTE_TEMPLATE_ID,
      fields: {
        alarmId: id,
      },
    };
    cb(null, app.transloadit.calcSignature(params));
  };

  Alarm.sendVoiceNote = function(data, cb) {
    // Warning!
    // Pending: check relationship status
    var VoiceNoteModel = app.models.VoiceNote;
    app.transloadit.getAssembly(data.assemblyId, function(err, assembly) {
      if (err) cb(err);
      VoiceNoteModel.create({
        alarmId: assembly.fields.alarmId,
        meta: assembly.results.waveform[0].meta,
        url: assembly.results.waveform[0].ssl_url,
      }, function(err, result) {
        cb(err, result ? true : false);
      });
    });
  };

  Alarm.remoteMethod(
    'friendsAlarms', {
      returns: {
        arg: 'alarms',
        type: 'object',
        root: true,
      },
      http: {
        path: '/friends-alarms',
        verb: 'get',
      },
    }
  );

  Alarm.remoteMethod(
    'calcSignature', {
      accepts: [{
        arg: 'id',
        type: 'number',
        required: true,
      }],
      returns: {
        arg: 'success',
        type: 'object',
        root: true,
      },
      http: {
        path: '/:id/calc-signature',
        verb: 'get',
      },
    }
  );

  Alarm.remoteMethod(
    'sendVoiceNote', {
      accepts: [{
        arg: 'data',
        type: 'object',
        required: true,
        http: {
          source: 'body',
        },
      }],
      returns: {
        arg: 'success',
        type: 'boolean',
        root: true,
      },
      http: {
        path: '/send-voice-note',
        verb: 'post',
      },
    }
  );
};
