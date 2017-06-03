'use strict';

var app = require('../../server/server');
var request = require('request');

var _ = require('lodash');

var VOICENOTE_TEMPLATE_ID = process.env.TRANSLOADIT_VOICENOTE_TEMPLATE_ID;

module.exports = function(Alarm) {
  Alarm.validate('waketime', wakeTimeValidator, {message: 'Invalid waketime'});
  Alarm.validate('bedtime', bedTimeValidator, {message: 'Invalid bedtime'});

  function wakeTimeValidator(err) {
    var rangeHours = 24;
    var now = this.updatedAt || this.createdAt || new Date();
    var timeDiff = this.waketime.getTime() - now.getTime();
    if (now.getTime() > this.waketime.getTime()) {
      err();
    }
    if ((timeDiff / (1000 * 60 * 60)) > rangeHours) {
      err();
    }
    if (this.bedtime && this.bedtime.getTime() > this.waketime.getTime()) {
      err();
    }
  }

  function bedTimeValidator(err) {
    var rangeMinutes = 5;
    if (this.bedtime) {
      var now = this.createdAt || this.updatedAt || new Date();
      var timeDiff = this.bedtime.getTime() - now.getTime();
      if (timeDiff < 0 && Math.abs(timeDiff / (1000 * 60)) > rangeMinutes) {
        err();
      }
    }
  }

  Alarm.beforeRemote('*.patchAttributes', function(ctx, alarm, next) {
    if (!ctx.args.options.skipWhiteList) {
      var whiteListProps =  ['waketime', 'bedtime', 'textMessage'];
      ctx.args.data = _.pick(ctx.args.data, whiteListProps);
      ctx.args.data.updatedAt = new Date();
    }
    next();
  });

  Alarm.beforeRemote('create', function(ctx, modelInstance, next) {
    var token = ctx.args.options && ctx.args.options.accessToken;
    var currentUserId = token && token.userId;
    ctx.args.data.userId = currentUserId;
    ctx.args.data.status = 'active';
    next();
  });

  Alarm.observe('after save', function(ctx, next) {
    var UserModel = app.models.AppUser;
    if (ctx.isNewInstance) {
      var userId = ctx.instance.userId;
      UserModel.findById(userId, function(err, user) {
        if (err) next(err);
        if (user) {
          user.currentAlarmId = ctx.instance.id;
          user.save({}, function(err, data) {
            next();
          });
        } else {
          next();
        }
      });
    } else {
      next();
    }
  });

  Alarm.turnOff = function(id, options, cb) {
    var token = options && options.accessToken;
    var currentUserId = token && token.userId;
    Alarm.findById(id, function(err, alarm) {
      if (err) return cb(err);
      var shouldContinue = (
        alarm.userId.toString() === currentUserId.toString() &&
        alarm.status === 'active'
      );
      if (shouldContinue) {
        alarm.realWaketime = new Date();
        alarm.status = 'disabled';
        alarm.save({skipWhiteList: true}, function(err, data) {
          cb(err, data ? true : false);
        });
      } else {
        cb(null, false);
      }
    });
  };

  Alarm.friendsAlarms  = function(options, cb) {
    var UserModel = app.models.AppUser;
    var token = options && options.accessToken;
    var currentUserId = token && token.userId;
    var threeHoursAgo = new Date((new Date()).valueOf() - 1000 * 60 * 60 * 3);
    if (currentUserId) {
      UserModel.listFriendsIds(currentUserId, function(err, friendsIds) {
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

  Alarm.sendVoiceNote = function(data, options, cb) {
    // Warning!
    // Pending: check relationship status
    var token = options && options.accessToken;
    var currentUserId = token && token.userId;
    var VoiceNoteModel = app.models.VoiceNote;
    request(data.assemblyUrl, function(err, response, body) {
      if (err) return cb(err, false);
      var assembly = JSON.parse(body);
      VoiceNoteModel.create({
        alarmId: assembly.fields.alarmId,
        meta: assembly.results.wav[0].meta,
        url: assembly.results.wav[0].ssl_url,
        senderId: currentUserId,
      }, function(err, result) {
        cb(err, result ? true : false);
      });
    });
  };

  Alarm.markVoiceNoteAsListened = function(id, fk, options, cb) {
    var VoiceNote = app.models.VoiceNote;
    var token = options && options.accessToken;
    var currentUserId = token && token.userId;
    VoiceNote.findOne({where: {alarmId: id, id: fk}}, function(err, voiceNote) {
      if (err) return cb(err);
      if (voiceNote) {
        Alarm.findById(id, function(err, alarm) {
          if (err) return cb(err);
          if (alarm && alarm.userId.toString() === currentUserId.toString()) {
            voiceNote.status = 'listened';
            voiceNote.save({}).then(function(data) {
              console.log(data);
              cb(null, true);
            }).catch(function(err) {
              cb(err, false);
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

  Alarm.remoteMethod(
    'turnOff', {
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
        path: '/:id/turn-off',
        verb: 'post',
      },
    }
  );

  Alarm.remoteMethod(
    'friendsAlarms', {
      accepts: [
        {
          arg: 'options',
          type: 'object',
          http: 'optionsFromRequest',
        },
      ],
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
        type: 'string',
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
        path: '/send-voice-note',
        verb: 'post',
      },
    }
  );

  Alarm.remoteMethod(
    'markVoiceNoteAsListened', {
      accepts: [{
        arg: 'id',
        type: 'string',
        required: true,
      },
      {
        arg: 'fk',
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
        path: '/:id/voicesnotes/:fk/mark-as-listened',
        verb: 'post',
      },
    }
  );
};
