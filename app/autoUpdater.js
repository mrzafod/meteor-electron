var _ = require('underscore');
var autoUpdater = require('electron').autoUpdater;
var dialog = require('electron').dialog;

// Daily.
var SCHEDULED_CHECK_INTERVAL = 24 * 60 * 60 * 1000;

var Updater = function() {
  autoUpdater.on('error', this._onUpdateError.bind(this));
  autoUpdater.on('update-not-available', this._onUpdateNotAvailable.bind(this));
  autoUpdater.on('update-downloaded', this._onUpdateDownloaded.bind(this));
};

_.extend(Updater.prototype, {
  setFeedURL: function(url) {
    autoUpdater.setFeedURL(url);
  },

  checkForUpdates: function(userTriggered /* optional */) {
    this._clearScheduledCheck();
    if (this._updatePending) {
      this._askToApplyUpdate();
      return;
    }

    if (userTriggered) this._userCheckPending = true;

    autoUpdater.checkForUpdates();
  },

  _onUpdateError: function() {
    if (this._userCheckPending) {
      this._userCheckPending = false;

      dialog.showMessageBox({
        type: 'error',
        message: 'An error occurred while checking for updates.',
        buttons: ['Ok']
      });
    }

    this._scheduleCheck();
  },

  _onUpdateNotAvailable: function() {
    if (this._userCheckPending) {
      this._userCheckPending = false;

      dialog.showMessageBox({
        type: 'info',
        message: 'An update is not available.',
        buttons: ['Ok']
      });
    }

    this._scheduleCheck();
  },

  _onUpdateDownloaded: function() {
    this._userCheckPending = false;
    this._updatePending = true;
    this._askToApplyUpdate();
  },

  _askToApplyUpdate: function() {
    var self = this;

    dialog.showMessageBox({
      type: 'question',
      message: 'An update is available! Would you like to quit to install it? The application will then restart.',
      buttons: ['Ask me later', 'Quit and install']
    }, function(result) {
      if (result > 0) {
        autoUpdater.quitAndInstall();
      } else {
        self._scheduleCheck();
      }
    });
  },

  _clearScheduledCheck: function() {
    if (this._scheduledCheck) {
      clearTimeout(this._scheduledCheck);
      this._scheduledCheck = null;
    }
  },

  _scheduleCheck: function() {
    this._clearScheduledCheck();
    this._scheduledCheck = setTimeout(this.checkForUpdates.bind(this), SCHEDULED_CHECK_INTERVAL);
  }
});

module.exports = new Updater();
