'use strict';
var app = require('../../server/server');
var ObjectID = require('mongodb').ObjectID;

// Add more reserver words from this list: http://blog.postbit.com/reserved-username-list.html

var reservedWords = [
  'user',
  'username',
  'admin',
  'master',
  'http',
  'https',
  'www',
  'db',
  'database',
  'ftp',
  's3',
  'api',
  'email',
  'about',
  'contact',
  'adds',
  'login',
  'logout',
  'home',
  'register',
  'example',
  'download',
  'downloads',
  'me',
  'you',
  'yourname',
  'yourusername',
  'yoursite',
  'yourdomain',
  'myusername',
  'bot',
  'pay',
  'sale',
  'shop',
  'premium',
  'games',
  'imbox',
  'notifications',
  'add',
  'follow',
  'voicenotes',
  'users',
  'list',
  'id',
  'test',
  'dev',
  'etc',
  'system',
  'chat',
  'video',
  'block',
  'unblock',
  'default',
  'wakeup',
  'alarm',
  'alarms',
];

var md5 = require('blueimp-md5');

var GRAVATAR_URI = 'https://www.gravatar.com/avatar/';

var _ = require('lodash');

var avatarSizes = {
  small: 100,
  medium: 300,
  large: 480,
};

var getMaxId = function(a, b) {
  if (a.toString() >= b.toString()) {
    return a;
  }
  return b;
};

var getMinId = function(a, b) {
  if (a.toString() <= b.toString()) {
    return a;
  }
  return b;
};

module.exports = function(AppUser) {
  AppUser.validatesExclusionOf('username', {in: ['itstimebro']});
  AppUser.validatesExclusionOf('username', {in: reservedWords});

  var getRelationshipBetween = function(
    RelationshipModel,
    firstUserId,
    secondUserId,
    cb
  ) {
    RelationshipModel.findOne({
      where: {
        firstUserId: getMinId(firstUserId, secondUserId),
        secondUserId: getMaxId(firstUserId, secondUserId),
      },
    }, cb);
  };

  var addFriend = function(RelationshipModel, currentUserId, friendId, cb) {
    getRelationshipBetween(
      RelationshipModel,
      currentUserId,
      friendId,
      function(err, relationship) {
        if (err) cb(err);
        if (!relationship) {
          var friendship = {
            firstUserId: getMinId(currentUserId, friendId),
            secondUserId: getMaxId(currentUserId, friendId),
            actionUserId: currentUserId,
            status: 'pending',
          };
          RelationshipModel.create(friendship, function(err, data) {
            cb(err, err ? false : true);
          });
        } else {
          var hasRequest = (
            relationship.status === 'pending' &&
            relationship.actionUserId.toString() === friendId.toString()
          );
          if (hasRequest) {
            relationship.updateAttributes({
              updatedAt: new Date(),
              actionUserId: currentUserId,
              status: 'accepted',
            }, function(err, data) {
              cb(err, err ? false : true);
            });
          } else {
            cb(null, false);
          }
        }
      });
  };

  var blockUser = function(RelationshipModel, currentUserId, userId, cb) {
    getRelationshipBetween(
      RelationshipModel,
      userId,
      friendId,
      function(err, relationship) {
        if (err) cb(err);
        if (!relationship) {
          var blockUserData = {
            firstUserId: getMinId(userId, currentUserId),
            secondUserId: getMaxId(userId, currentUserId),
            actionUserId: currentUserId,
            status: 'blocked',
          };
          RelationshipModel.create(blockUserData, function(err, data) {
            cb(err, err ? false : true);
          });
        } else {
          /* continue if current user is not blocked */
          var isBlocked = (
            relationship.status === 'blocked' &&
            relationship.actionUserId === userId
          );
          if (!isBlocked) {
            relationship.updateAttributes({
              updatedAt: new Date(),
              actionUserId: currentUserId,
              status: 'blocked',
            }, function(err, data) {
              cb(err, err ? false : true);
            });
          } else {
            cb(null, false);
          }
        }
      });
  };

  var mapRelationshipDataIds = function(data, excludedId) {
    return data.map(function(x) {
      return (
        x.secondUserId.toString() === excludedId.toString() ?
        x.firstUserId : x.secondUserId
      );
    });
  };

  var buildGravatarSizesMap = function(hash) {
    var result = {};
    for (var key in avatarSizes) {
      result[key] = GRAVATAR_URI + hash + '?s=' + avatarSizes[key];
    }
    return result;
  };

  AppUser.afterRemote('findById', function(ctx, user, next) {
    var currentUserId = ctx.req.accessToken && ctx.req.accessToken.userId;
    if (!currentUserId || currentUserId.toString() !== user.id.toString()) {
      user.email = undefined;
    }
    next();
  });

  AppUser.afterRemote('profile', function(ctx, user, next) {
    var currentUserId = ctx.req.accessToken && ctx.req.accessToken.userId;
    if (!ctx.req.accessToken) {
      next();
    } else {
      AppUser.listBlockedUsersIds(user.id, false, function(err, blockedIds) {
        if (err) {
          next(err);
        } else {
          if (blockedIds.indexOf(currentUserId) !== -1) {
            var resError = new Error('User not found');
            resError.code = 'MODEL_NOT_FOUND';
            resError.status = 404;
            next(resError);
          } else {
            next();
          }
        }
      });
    }
  });

  AppUser.search = function(query, options, cb) {
    /* case-insensitive RegExp search */
    var pattern = new RegExp('.*' + query + '.*', 'i');
    AppUser.find(
      {
        limit: 10,
        where: {
          or: [
              {username: {like: pattern}},
              {name: {like: pattern}},
              {email: query.toLowerCase()},
          ],
        },
        fields: {
          id: true,
          username: true,
          name: true,
        },
      }).then(function(results) {
        cb(null, results);
      }).catch(function(err) {
        cb(err);
      });
  };

  AppUser.profile = function(id, options, cb) {
    var token = options && options.accessToken;
    var currentUserId = token && token.userId;
    var isMe = currentUserId.toString() === id.toString();
    AppUser.checkFriendship(id, options, function(err, isFriend, rel) {
      var fields = {
        email: isMe ? undefined : false,
        currentAlarmId: (isMe || isFriend) ? undefined : false,
      };
      if (err) {
        cb(err);
      } else {
        AppUser.findOne(
          {
            where: {id: id},
            include: (isFriend || isMe) ? 'currentAlarm' : null,
            fields: JSON.parse(JSON.stringify(fields)),
          }
        ).then(function(user) {
          if (!user) {
            var resError = new Error('User not found');
            resError.code = 'MODEL_NOT_FOUND';
            resError.status = 404;
            cb(resError);
          } else {
            if (rel) {
              user.friend = isFriend;
              user.relationship = rel;
            }
            user.alarms.count(function(err, count) {
              user.alarmsCount = !err ? count : null;
              AppUser.listFriendsIds(id, function(err, result) {
                user.friendsCount = !err ? result.length : null;
                cb(null, user);
              });
            });
          }
        }).catch(function(err) {
          cb(err);
        });
      }
    });
  };

  AppUser.avatar = function(id, req, res, cb) {
    var redirect =  !(req.query.json ?  req.query.json == 'true' : false);
    var avatarSize = req.query.size || req.query.s || 'small';

    if (avatarSize === 's') {
      avatarSize = 'small';
    }
    if (avatarSize === 'm') {
      avatarSize = 'medium';
    }
    if (avatarSize === 'l') {
      avatarSize = 'large';
    }

    AppUser.findOne({where: {id: id}}, function(err, user) {
      if (err) cb(err);
      if (!user) {
        err = new Error(
          'No instance with id ' + id + ' found for ' + AppUser.modelName
        );
        err.statusCode = 404;
        return cb(err);
      }

      var avatarSizesMap = (
        user.avatar || buildGravatarSizesMap(md5(user.email))
      );

      var avatarData = {
        url: avatarSizesMap[avatarSize] || avatarSizesMap['small'],
      };

      if (redirect) {
        res.redirect(avatarData.url);
      } else {
        cb(null, avatarData);
      }
    });
  };

  AppUser.addFriend = function(id, options, cb) {
    var RelationshipModel = app.models.Relationship;
    var token = options && options.accessToken;
    var currentUserId = token && token.userId;
    if (currentUserId && currentUserId.toString() !== id) {
      addFriend(RelationshipModel, currentUserId, new ObjectID(id), cb);
    } else {
      cb(null, false);
    }
  };

  AppUser.unfriend = function(id, options, cb) {
    var RelationshipModel = app.models.Relationship;
    var token = options && options.accessToken;
    var currentUserId = token && token.userId;
    if (currentUserId) {
      getRelationshipBetween(RelationshipModel, currentUserId, id,
        function(err, relationship) {
          if (err) cb(err);
          var shouldContinue = (
            relationship &&
            relationship.status !== 'blocked'
          );
          if (shouldContinue) {
            RelationshipModel.destroyById(relationship.id, function(err) {
              if (err) cb(err);
              cb(null, true);
            });
          } else {
            cb(null, false);
          }
        });
    } else {
      cb(null, false);
    }
  };

  AppUser.listBlockedUsersIds = function(id, validateActionUser, cb) {
    var RelationshipModel = app.models.Relationship;
    if (!cb) {
      cb = validateActionUser;
      validateActionUser = false;
    }
    var filter = {
      where: {
        and: [
          {
            or: [{
              firstUserId: id,
            },
              {
                secondUserId: id,
              }],
          },
          {
            status: 'blocked',
          },
        ],
      },
      fields: {
        firstUserId: true,
        secondUserId: true,
      },
    };
    RelationshipModel.find(
      _.merge({},
        filter,
        validateActionUser ? {actionUserId: id} : {}
      ), function(err, data) {
      if (err) cb(err);
      cb(null, mapRelationshipDataIds(data, id));
    });
  };

  AppUser.listFriendsRequests = function(options, cb) {
    var RelationshipModel = app.models.Relationship;
    var token = options && options.accessToken;
    var currentUserId = token && token.userId;
    if (!currentUserId) {
      cb(null, []);
    }
    RelationshipModel.find({
      where: {
        and: [
          {
            or: [{
              firstUserId: currentUserId,
            },
            {
              secondUserId: currentUserId,
            }],
          },
          {
            status: 'pending',
          },
          {
            actionUserId: {
              neq: currentUserId,
            },
          },
        ],
      },
      fields: {
        firstUserId: true,
        secondUserId: true,
      },
    }, function(err, data) {
      if (err) cb(err);
      AppUser.find({
        where: {
          id: {
            inq: mapRelationshipDataIds(data, currentUserId) || [],
          },
        },
      }, cb);
    });
  };

  AppUser.listFriendsIds = function(id, cb) {
    var RelationshipModel = app.models.Relationship;
    RelationshipModel.find({
      where: {
        and: [
          {
            or: [{
              firstUserId: id,
            },
            {
              secondUserId: id,
            }],
          },
          {
            status: 'accepted',
          },
        ],
      },
      fields: {
        firstUserId: true,
        secondUserId: true,
      },
    }, function(err, data) {
      if (err) cb(err);
      cb(null, mapRelationshipDataIds(data, id));
    });
  };

  AppUser.listFriends = function(id, cb) {
    AppUser.listFriendsIds(id, function(err, friendsIds) {
      if (err) cb(err);
      AppUser.find({
        where: {
          id: {
            inq: friendsIds || [],
          },
        },
        fields: {email: false},
      }, cb);
    });
  };

  AppUser.listBlockedUsers = function(options, cb) {
    var token = options && options.accessToken;
    var currentUserId = token && token.userId;
    if (currentUserId) {
      AppUser.listBlockedUsersIds(currentUserId, true, function(err, usersIds) {
        if (err) cb(err);
        AppUser.find({
          where: {
            id: {
              inq: usersIds || [],
            },
          },
        }, cb);
      });
    } else {
      cb (null, []);
    }
  };

  AppUser.block = function(id, options, cb) {
    var RelationshipModel = app.models.Relationship;
    var token = options && options.accessToken;
    var currentUserId = token && token.userId;
    if (currentUserId && currentUserId !== id) {
      blockUser(RelationshipModel, currentUserId, id, cb);
    } else {
      cb(null, false);
    }
  };

  AppUser.unblock = function(id, options, cb) {
    var RelationshipModel = app.models.Relationship;
    var token = options && options.accessToken;
    var currentUserId = token && token.userId;
    if (currentUserId) {
      getRelationshipBetween(RelationshipModel, currentUserId, id,
        function(err, relationship) {
          if (err) cb(err);
          var shouldContinue = (
            relationship &&
            relationship.status === 'blocked' &&
            relationship.actionUserId === currentUserId
          );
          if (shouldContinue) {
            RelationshipModel.destroyById(relationship.id, function(err) {
              if (err) cb(err);
              cb(null, true);
            });
          } else {
            cb(null, false);
          }
        });
    } else {
      cb(null, false);
    }
  };

  AppUser.checkFriendship = function(id, options, cb) {
    var RelationshipModel = app.models.Relationship;
    var token = options && options.accessToken;
    var currentUserId = token && token.userId;
    if (currentUserId) {
      getRelationshipBetween(RelationshipModel, currentUserId, id,
        function(err, data) {
          var isFriend = data && data.status === 'accepted' ? true : false;
          cb(err, isFriend, data && data.status !== 'blocked' ? data : null);
        });
    } else {
      cb(null, false);
    }
  };

  AppUser.registerDevice = function(data, options, cb) {
    var Installation = app.models.UserInstallation;
    var token = options && options.accessToken;
    var currentUserId = token && token.userId;
    Installation.findOne({
      where: {
        deviceToken: data.deviceToken,
        deviceType: data.deviceType,
      },
    }).then(function(installation) {
      if (installation) {
        installation.userId = currentUserId;
        installation.modified = new Date();
        Installation.status = 'Active';
        return innstallation.save();
      } else {
        return Installation.create({
          appId: 'itstimebro-push-app',
          userId: currentUserId,
          deviceToken: data.deviceToken,
          deviceType: data.deviceType,
          created: new Date(),
          modified: new Date(),
          status: 'Active',
        });
      }
    }).then(function(installation) {
      cb(null, installation);
    })
    .catch(function(err) {
      cb(err);
    });
  };

  AppUser.remoteMethod(
    'profile', {
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
        arg: 'profile',
        type: 'object',
        root: true,
      },
      http: {
        path: '/:id/profile',
        verb: 'get',
      },
    }
  );

  AppUser.remoteMethod(
    'avatar', {
      accepts: [
        {arg: 'id', type: 'string'},
        {arg: 'req', type: 'object', http: {source: 'req'}},
        {arg: 'res', type: 'object', http: {source: 'res'}},
      ],
      returns: {
        arg: 'data',
        type: 'object',
        root: true,
      },
      http: {
        path: '/:id/avatar',
        verb: 'get',
      },
    }
  );

  AppUser.remoteMethod(
    'addFriend', {
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
        path: '/:id/add-friend',
        verb: 'post',
      },
    }
  );

  AppUser.remoteMethod(
    'unfriend', {
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
        path: '/:id/unfriend',
        verb: 'post',
      },
    }
  );

  AppUser.remoteMethod(
    'search', {
      accepts: [{
        arg: 'query',
        type: 'string',
        required: true,
      }, {
        arg: 'options',
        type: 'object',
        http: 'optionsFromRequest',
      }],
      returns: {
        arg: 'users',
        type: 'object',
        root: true,
      },
      http: {
        path: '/search',
        verb: 'get',
      },
    }
  );

  AppUser.remoteMethod(
    'listFriendsRequests', {
      accepts: [{
        arg: 'options',
        type: 'object',
        http: 'optionsFromRequest',
      }],
      returns: {
        arg: 'users',
        type: 'object',
        root: true,
      },
      http: {
        path: '/friends-requests',
        verb: 'get',
      },
    }
  );

  AppUser.remoteMethod(
    'listFriends', {
      accepts: [{
        arg: 'id',
        type: 'string',
        required: true,
      }],
      returns: {
        arg: 'friends',
        type: 'object',
        root: true,
      },
      http: {
        path: '/:id/list-friends',
        verb: 'get',
      },
    }
  );

  AppUser.remoteMethod(
    'listBlockedUsers', {
      accepts: [{
        arg: 'options',
        type: 'object',
        http: 'optionsFromRequest',
      }],
      returns: {
        arg: 'users',
        type: 'object',
        root: true,
      },
      http: {
        path: '/blocked-users',
        verb: 'get',
      },
    }
  );

  AppUser.remoteMethod(
    'checkFriendship', {
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
      returns: [{
        arg: 'friends',
        type: 'boolean',
      }, {
        arg: 'relationship',
        type: 'object',
      }],
      http: {
        path: '/:id/check-friendship',
        verb: 'get',
      },
    }
  );

  AppUser.remoteMethod(
    'block', {
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
        path: '/:id/block',
        verb: 'post',
      },
    }
  );

  AppUser.remoteMethod(
    'unblock', {
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
        path: '/:id/unblock',
        verb: 'post',
      },
    }
  );

  AppUser.remoteMethod(
    'registerDevice', {
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
        arg: 'installation',
        type: 'object',
        root: true,
      },
      http: {
        path: '/register-device',
        verb: 'post',
      },
    }
  );
};
