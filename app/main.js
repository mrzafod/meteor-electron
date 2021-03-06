var app = require('electron').app; // Module to control application life.
var childProcess = require("child_process");
const path = require("path");
const fs = require("fs");
const util = require('util');
const nativeImage = require('electron').nativeImage;
const _ = require('underscore');
const Tray = require('electron').Tray;
const Menu = require('electron').Menu;

// var log = function(msg){
//   fs.appendFile("C:\\Users\\Michael\\electron.log", msg + "\n", function(err){
//     if (err){
//       throw err;
//     }
//   })
// };

var log = function(){};

var installShortcut = function(callback){
  var updateDotExe = path.resolve(path.dirname(process.execPath), '..', 'update.exe');
  var child = childProcess.spawn(updateDotExe, ["--createShortcut", "mixmax.exe"], { detached: true });
  child.on('close', function(code) {
    callback();
  });
};

var handleStartupEvent = function() {
  if (process.platform !== 'win32') {
    return false;
  }

  var squirrelCommand = process.argv[1];
  switch (squirrelCommand) {
    case '--squirrel-install':
      log("SQUIRREL INSTALL");

    case '--squirrel-updated':
      log("SQUIRREL UPDATED");
      // Optionally do things such as:
      //
      // - Install desktop and start menu shortcuts
      // - Add your .exe to the PATH
      // - Write to the registry for things like file associations and
      //   explorer context menus

      // Always quit when done
      installShortcut(function(){
        app.quit();
      })

      return true;
    case '--squirrel-uninstall':
      log("SQUIRREL UNINSTALL");

      // Undo anything you did in the --squirrel-install and
      // --squirrel-updated handlers

      // Always quit when done
      app.quit();

      return true;
    case '--squirrel-obsolete':
      log("SQUIRREL OBSOLETE");
      // This is called on the outgoing version of your app before
      // we update to the new version - it's the opposite of
      // --squirrel-updated
      app.quit();
      return true;
  }
};

app.on("window-all-closed", function(){
  if (process.platform !== "darwin"){
    app.quit();
  }
});

if (handleStartupEvent()) {
  return;
}

var BrowserWindow = require('electron').BrowserWindow; // Module to create native browser window.
var autoUpdater = require('./autoUpdater');
var createDefaultMenu = require('./menu.js');
var proxyWindowEvents = require('./proxyWindowEvents');

require('electron-debug')({
  showDevTools: false
});

var electronSettings = JSON.parse(fs.readFileSync(
  path.join(__dirname, "electronSettings.json"), "utf-8"));

var checkForUpdates;
if (electronSettings.updateFeedUrl) {
  autoUpdater.setFeedURL(util.format('%s?version=%s&platform=%s',
    electronSettings.updateFeedUrl, electronSettings.version, process.platform));
  if (process.platform === 'linux') {
    var packageJSON = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf-8'));
    autoUpdater.setup({
      feedUrl: electronSettings.updateFeedUrl,
      format: electronSettings.format,
      platform: process.platform,
      version: electronSettings.version,
      name: packageJSON.name,
      productName: packageJSON.productName
    });
  }
  checkForUpdates = function() {
    autoUpdater.checkForUpdates(true /* userTriggered */);
  };
}

var launchUrl = electronSettings.rootUrl;
if (electronSettings.launchPath) {
  launchUrl += electronSettings.launchPath;
}

var windowOptions = {
  width: electronSettings.width || 800,
  height: electronSettings.height || 600,
  resizable: true,
  frame: true,
  /**
   * Disable Electron's Node integration so that browser dependencies like `moment` will load themselves
   * like normal i.e. into the window rather than into modules, and also to prevent untrusted client
   * code from having access to the process and file system:
   *  - https://github.com/atom/electron/issues/254
   *  - https://github.com/atom/electron/issues/1753
   */
  webPreferences: {
    nodeIntegration: false,
    // See comments at the top of `preload.js`.
    preload: path.join(__dirname, 'preload.js')
  }
};

if (electronSettings.resizable === false){
  windowOptions.resizable = false;
}

if (electronSettings['title-bar-style']) {
  windowOptions['title-bar-style'] = electronSettings['title-bar-style'];
}

if (electronSettings.minWidth) {
  windowOptions.minWidth = electronSettings.minWidth;
}

if (electronSettings.maxWidth) {
  windowOptions.maxWidth = electronSettings.maxWidth;
}

if (electronSettings.minHeight) {
  windowOptions.minHeight = electronSettings.minHeight;
}

if (electronSettings.maxHeight) {
  windowOptions.maxHeight = electronSettings.maxHeight;
}

if (electronSettings.frame === false){
  windowOptions.frame = false;
}

// Linux icon: See https://github.com/electron-userland/electron-packager/issues/90
var baseIcon;
if (process.platform === 'linux' && electronSettings.icon && electronSettings.icon[process.platform]) {
  const icon = _.isObject(electronSettings.icon[process.platform])
    ? _.values(electronSettings.icon[process.platform])[0]
    : electronSettings.icon[process.platform];
  baseIcon = path.resolve(__dirname, icon);
  windowOptions.icon = baseIcon;
}

// Keep a global reference of the window object so that it won't be garbage collected
// and the window closed.
var mainWindow = null;
var getMainWindow = function() {
  return mainWindow;
};

// Unfortunately, we must set the menu before the application becomes ready and so before the main
// window is available to be passed directly to `createDefaultMenu`.
createDefaultMenu(app, getMainWindow, checkForUpdates);

// Declare tray at global scope to avoid GC (or tray icon will disappear after some time!)
// See https://github.com/electron/electron/issues/822
var tray = null;

app.on("ready", function(){
  mainWindow = new BrowserWindow(windowOptions);
  proxyWindowEvents(mainWindow);

  // Hide the main window instead of closing it, so that we can bring it back
  // more quickly.
  mainWindow.on('close', hideInsteadofClose);

  mainWindow.focus();
  mainWindow.loadURL(launchUrl);

  // When closing app in linux, it shows nowhere, so put an icon in the tray.
  // Couldn't get it working with nativeImage, but only with absolute path.
  if (process.platform === 'linux' && baseIcon) {
    tray = new Tray(baseIcon);
    tray.setToolTip(electronSettings.name);
    var trayContextMenu = Menu.buildFromTemplate([
      {
        label: 'Show ' + electronSettings.name,
        click: function() { mainWindow.show(); }
      },
      {
        label: 'Quit',
        click: function() { app.quit(); }
      }
    ]);
    tray.setContextMenu(trayContextMenu);
  }

  if (electronSettings.updateFeedUrl) {
    autoUpdater.checkForUpdates();
  }
});

var hideInsteadofClose = function(e) {
  mainWindow.hide();
  e.preventDefault();
};

app.on("before-quit", function(){
  // We need to remove our close event handler from the main window,
  // otherwise the app will not quit.
  mainWindow.removeListener('close', hideInsteadofClose);
});

app.on("activate", function(){
  // Show the main window when the customer clicks on the app icon.
  if (!mainWindow.isVisible()) mainWindow.show();
});
