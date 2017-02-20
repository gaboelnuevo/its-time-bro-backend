'use strict';

module.exports = function(app) {
  var Application = app.models.application;
  var Notification = app.models.PushNotification;
  var PushModel = app.models.push;

  function startPushServer() {
    PushModel.on('error', function(err) {
      console.error('Push Notification error: ', err.stack);
    });

    // Pre-register an application that is ready to be used for testing.
    // You should tweak config options in ./config.js

    var config = require('./config');

    var pushApp = {
      id: 'itstimebro-push-app',
      userId: 'itstimebro',
      name: config.appName,
      description: 'Push Notification Application',
      pushSettings: {
        apns: {
          certData: config.apnsCertData,
          keyData: config.apnsKeyData,
          pushOptions: {
            // Extra options can go here for APN
          },
          feedbackOptions: {
            batchFeedback: true,
            interval: 300,
          },
        },
        gcm: {
          serverApiKey: config.gcmServerApiKey,
        },
      },
    };

    updateOrCreateApp(function(err, appModel) {
      if (err) {
        throw err;
      }
      console.log('Application id: %j', appModel.id);
    });

    function updateOrCreateApp(cb) {
      Application.findOne({
        where: {id: pushApp.id},
      },
        function(err, result) {
          if (err) cb(err);
          if (result) {
            console.log('Updating application: ' + result.id);
            delete pushApp.id;
            result.updateAttributes(pushApp, cb);
          } else {
            return registerApp(cb);
          }
        });
    }

    function registerApp(cb) {
      console.log('Registering a new Application...');
      // Hack to set the app id to a fixed value so that we don't have to change
      // the client settings
      Application.observe('before save', function(ctx, next) {
        if (ctx.instance && ctx.isNewInstance) {
          if (ctx.instance.name === pushApp.name) {
            ctx.instance.id = pushApp.id;
          }
        }
        next();
      });

      Application.register(
        pushApp.userId,
        pushApp.name,
        {
          description: pushApp.description,
          pushSettings: pushApp.pushSettings,
        },
        function(err, app) {
          if (err) {
            return cb(err);
          }
          return cb(null, app);
        }
      );
    }
  }

  startPushServer();
};
