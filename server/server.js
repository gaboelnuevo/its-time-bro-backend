'use strict';

var loopback = require('loopback');
var boot = require('loopback-boot');

var app = module.exports = loopback();

var LoopBackContext = require('loopback-context');

var cookieParser = require('cookie-parser');
var session = require('express-session');

var transloaditKeys = {
  authKey: process.env.TRANSLOADIT_AUTH_KEY,
  authSecret: process.env.TRANSLOADIT_AUTH_SECRET,
};

transloaditKeys = {
  authKey: 'a43f5580ed6611e6b218693391151cc9',
  authSecret: 'd980db552905e19cf9bcb3177a67dbf8c9ed2b45',
};

var templateId = process.env.TRANSLOADIT_VOICENOTES_TEMPLATE_ID;
templateId = 'd3de6780f48311e684cb616f38f5e4bd';

var TransloaditClient = require('transloadit');

app.middleware('session:before', cookieParser(app.get('cookieSecret')));
app.middleware('session', session({
  secret: 'kitty',
  saveUninitialized: true,
  resave: true,
}));

// Passport configurators..
var loopbackPassport = require('loopback-component-passport');
var PassportConfigurator = loopbackPassport.PassportConfigurator;
var passportConfigurator = new PassportConfigurator(app);

var flash = require('express-flash');
app.use(flash());

app.get('/auth/error', function(req, res) {
  var flash = req.flash('error').length >= 1 && req.flash('error')[0];
  var error = flash || 'unknow error';
  res.status(403).json({success: false, error: error});
});

// attempt to build the providers/passport config
var facebookKeys = {
  clientID: process.env.FACEBOOCK_CLIENT_ID,
  clientSecret: process.env.FACEBOOCK_CLIENT_SECRET,
};

facebookKeys.clientID =  '1805815626347157';
facebookKeys.clientSecret = '';

var providersConfig = {};

try {
  providersConfig = require('../providers.json');
} catch (err) {
  console.trace(err);
  process.exit(1); // fatal
}

app.start = function() {
  // start the web server
  return app.listen(function() {
    app.emit('started');
    var baseUrl = app.get('url').replace(/\/$/, '');
    console.log('Web server listening at: %s', baseUrl);
    if (app.get('loopback-component-explorer')) {
      var explorerPath = app.get('loopback-component-explorer').mountPath;
      console.log('Browse your REST API at %s%s', baseUrl, explorerPath);
    }
  });
};

// -- Add your pre-processing middleware here --
app.use(LoopBackContext.perRequest());
app.use(loopback.token());
app.use(function setCurrentUser(req, res, next) {
  if (!req.accessToken) {
    return next();
  }
  app.models.AppUser.findById(req.accessToken.userId, function(err, user) {
    if (err) {
      return next(err);
    }
    if (!user) {
      return next(new Error('No user with this access token was found.'));
    }
    var loopbackContext = LoopBackContext.getCurrentContext();
    if (loopbackContext) {
      loopbackContext.set('currentUser', user);
    }
    next();
  });
});

// Bootstrap the application, configure models, datasources and middleware.
// Sub-apps like REST API are mounted via boot scripts.
boot(app, __dirname, function(err) {
  if (err) throw err;

  require('./push-application')(app);

  passportConfigurator.init();

  passportConfigurator.setupModels({
    userModel: app.models.AppUser,
    userIdentityModel: app.models.AppUserIdentity,
    userCredentialModel: app.models.AppUserCredential,
  });

  for (var s in providersConfig) {
    var c = providersConfig[s];
    switch (c.provider) {
      case 'facebook':
        c.clientID = facebookKeys.clientID;
        c.clientSecret = facebookKeys.clientSecret;
        break;
      default:
        break;
    }
    c.session = c.json ? false : c.session !== false;
    passportConfigurator.configureProvider(s, c);
  }

  // start the server if `$ node server.js`
  if (require.main === module) {
    app.transloadit = new TransloaditClient(transloaditKeys);
    app.start();
  }
});
