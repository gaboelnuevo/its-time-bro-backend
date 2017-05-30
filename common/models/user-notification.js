'use strict';

var app = require('../../server/server');

var _ = require('lodash');

var _objectWithoutProperties = function(obj, keys) {
  var target = {};
  for (var i in obj) {
    if (keys.indexOf(i) >= 0) continue;
    if (!Object.prototype.hasOwnProperty.call(obj, i)) continue;
    target[i] = obj[i];
  }
  return target;
};

var _calculateCurrentBadge = function(UserNotification, userId, cb) {
  UserNotification.count(
    {
      userId: userId,
      seen: false,
    },
    cb
  );
};

var _notifyByUserId = function(PushModel, userId, data, cb) {
  PushModel.notifyByQuery(
    {
      userId: userId,
    },
    data,
    function(err) {
      if (err) {
        console.error('Cannot notify %j: %s', userId, err.stack);
        cb(err);
        return;
      }
      console.log('Pushing notification to %j', userId);
      cb();
    });
};

module.exports = function(UserNotification) {
  UserNotification.validatesPresenceOf('userId');
  //UserNotification after save..
  UserNotification.observe('after save', function(ctx, next) {
    var PushNotification = app.models.PushNotification;
    var PushModel = app.models.push;
    var excludedKeys = [
      'id',
      'userId',
      'payload',
    ];

    var userId = ctx.instance.userId;

    var defaultData =  {
      expirationInterval: 3600,
      badge: 1,
      sound: 'default',
      alert: '\uD83D\uDCE7 \u2709 ' + 'Hello',
      messageFrom: 'It\'s time bro',
    };

    var notificationData = _.merge(
      {
        notificationId: ctx.instance.id,
      },
      _objectWithoutProperties(ctx.instance, excludedKeys),
      ctx.instance.payload || {}
    );

    if (ctx.isNewInstance) {
      var notification = new PushNotification(
        _.assign(
          {},
          defaultData,
          notificationData
        ));

      _calculateCurrentBadge(UserNotification, userId, function(err, badge) {
        if (err) {
          console.error('Can\'t calculate badge: %s', err.stack);
        } else {
          notification.badge = badge;
        }
        _notifyByUserId(PushModel, userId.toString(), notification, next);
      });
    } else {
      next();
    }
  });

  //UserNotification before delete..
  UserNotification.observe('before delete', function(ctx, next) {
    next();
  });
};
