const appPack = require('./src/utils/app-pack');
const i18n = require('./src/utils/i18n');
const log = require('./src/main/app/utils/log');
const path = require('path');

/* Reconfigure path to config */
process.env["NODE_CONFIG_DIR"] = appPack.resourcePath("/config/");

/* global require, process */

const {app, shell, BrowserWindow, dialog} = require('electron');

const uiEventListener = require('./src/main/ui-event-handler');
const startup = require('./src/main/startup');

const trayController = require('./src/main/tray-controller');
const toolbarController = require('./src/main/toolbar-controller');
const mainMenuController = require('./src/main/main-menu.controller');
const settings = require('./src/main/app/settings-manager');

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let mainWindow;

// Check updates
require('./src/main/updater').initUpdater();

// This package opens devtools only in devmode
// No need to delete this line
require('electron-debug')({
    enabled: true,
    showDevTools: false
});


require('electron-reload')(__dirname, {
    electron: path.join(__dirname, 'node_modules', '.bin', 'electron')
});

if (settings.isHardwareAccelerationDisabled()) {
    /**
     * Disables hardware acceleration for this app.
     * https://github.com/AdguardTeam/AdGuardForSafari/issues/110
     */
    app.disableHardwareAcceleration();
}

/**
 * Creates browser window with default settings
 */
function createWindow() {
    const browserWindow = new BrowserWindow({
        title: "AdGuard for Safari",
        width: 1024,
        height: 768,
        minWidth: 800,
        minHeight: 768,
        center: true,
        icon: './src/main/ui/images/128x128.png',
        resizable: true,
        show: false,
        webPreferences: {
            nodeIntegration: true
        }
    });

    browserWindow.once('ready-to-show', () => {
        browserWindow.show();
    });

    return browserWindow;
}

/**
 * Add a confirmation dialog on window close
 */
function onWindowClosed() {
    log.info('On main window closed..');

    const skipConfirmClose = mainWindow.skipConfirmClose;

    // Dereference the window object, usually you would store windows
    // in an array if your app supports multi windows, this is the time
    // when you should delete the corresponding element.
    uiEventListener.unregister(mainWindow);
    mainWindow = null;

    // Check if we have previously saved setting
    const quitOnCloseWindow = settings.isQuitOnCloseWindow();
    if (quitOnCloseWindow === 1) {
        log.info('Saved setting - quit application');
        app.quit();
        return;
    }
    if (quitOnCloseWindow === 0){
        log.info('Saved setting - close window');
        return;
    }

    // If confirmation is force skipped, like on cmd+Q etc
    if (skipConfirmClose) {
        log.info('Close confirmation skipped');
        return;
    }

    // TODO: localizations
    dialog.showMessageBox({
        type: "question",
        message: "Keep AdGuard running in the background?",
        detail: "This is crucial for AdGuard to keep the main process running in the background, otherwise it won't be able to automatically check filters updates and manage filtering.",
        checkboxLabel: "Remember my choice",
        buttons: ["Yes", "No"]
    }).then((result) => {

        const keepAppRunning = result.response === 0;

        if (result.checkboxChecked) {
            settings.changeQuitOnCloseWindow(keepAppRunning ? 0 : 1);
        }

        if (!keepAppRunning) {
            log.info('Force quit application on close window');
            app.exit();
        } else {
            log.info('Close window');
        }
    });
}

/**
 * Creates main window
 */
function loadMainWindow(onWindowLoaded) {

    if (!mainWindow) {
        mainWindow = createWindow();
    }

    mainWindow.loadFile('./src/main/ui/options.html');

    // Emitted when the window is closed.
    mainWindow.on('closed', onWindowClosed);

    // Open _target=blank hrefs in external window
    mainWindow.webContents.on('new-window', function (event, url) {
        event.preventDefault();
        shell.openExternal(url);
    });

    if (onWindowLoaded) {
        const onDidFinishLoad = () => {
            mainWindow.webContents.removeListener('did-finish-load', onDidFinishLoad);

            if (typeof onWindowLoaded === 'function') {
                onWindowLoaded();
            }
        };

        mainWindow.webContents.addListener('did-finish-load', onDidFinishLoad);
    }
}

/**
 * Loads splash screen while loading
 */
function loadSplashScreenWindow(onWindowLoaded) {
    mainWindow = createWindow();
    mainWindow.loadFile('./src/main/ui/loading.html');

    if (onWindowLoaded) {
        const onDidFinishLoad = () => {
            mainWindow.webContents.removeListener('did-finish-load', onDidFinishLoad);

            if (typeof onWindowLoaded === 'function') {
                mainWindow.webContents.removeListener('did-finish-load', onDidFinishLoad);
                onWindowLoaded();
            }
        };

        mainWindow.webContents.addListener('did-finish-load', onDidFinishLoad);
    }
}

/**
 * Shows main window
 *
 * @param onWindowLoaded callback on window created and loaded
 */
function showWindow(onWindowLoaded) {
    if (mainWindow) {
        mainWindow.show();

        if (typeof onWindowLoaded === 'function') {
            onWindowLoaded();
        }
    } else {
        app.dock.show();

        loadMainWindow(onWindowLoaded);
        uiEventListener.register(mainWindow);
    }
}

/**
 * Should app launch silent in background
 *
 * @return {*}
 */
function shouldOpenSilent() {
    if (isOpenedAtLogin()) {
        log.info('App is opened at login');
        return true;
    }

    return process.env['LAUNCHED_BACKGROUND'];
}

/**
 * Checks if app is launched at login
 *
 * @return {string|undefined}
 */
function isOpenedAtLogin() {
    return process.env['LAUNCHED_AT_LOGIN'];
}

// Keep a global reference of the tray object, if you don't, the tray icon will
// be hidden automatically when the JavaScript object is garbage collected.
let tray;

/**
 * This method will be called when Electron has finished
 * initialization and is ready to create browser windows.
 * Some APIs can only be used after this event occurs.
 */
app.on('ready', (() => {
    i18n.setAppLocale(app.getLocale());

    log.info(`Starting AdGuard v${app.getVersion()}`);
    log.info('App ready - creating browser windows');

    if (shouldOpenSilent()) {
        log.info('App is launching in background');

        // Open in background
        if (process.platform === 'darwin') {
            app.dock.hide();
        }

        startup.init(showWindow, (shouldShowMainWindow) => {
            uiEventListener.init();

            if (shouldShowMainWindow) {
                app.dock.show();

                loadMainWindow();
            }
        });
    } else {
        log.info('App is launching in foreground');

        app.dock.show();

        loadSplashScreenWindow(() => {
            log.debug('Splash screen loaded');

            startup.init(showWindow, () => {
                uiEventListener.init();
                loadMainWindow();
                uiEventListener.register(mainWindow);

                toolbarController.requestMASReview();
            });
        });
    }

    mainMenuController.initMenu(showWindow);
    tray = trayController.initTray(showWindow);
    toolbarController.initToolbarController(showWindow);
}));

/**
 * Quit when all windows are closed.
 */
app.on('window-all-closed', () => {
    log.debug('On window all closed');

    // On OS X it is common for applications and their menu bar
    // to stay active until the user quits explicitly with Cmd + Q
    if (process.platform !== 'darwin') {
        app.quit();
    } else {
        log.info('Hiding dock item');
        app.dock.hide();
    }
});

/**
 * On app activate
 */
app.on('activate', () => {
    // On OS X it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (mainWindow === null) {
        loadMainWindow();
        uiEventListener.register(mainWindow);
    }
});