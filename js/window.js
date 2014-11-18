$(function () {
    $('#window-close').click(function () {
        window.close();
    });
    $('#window-minimize').click(function () {
        window.chrome.app.window.current().minimize();
    });
    $('#window-maximize').click(function () {
        var maximized = window.chrome.app.window.current().isMaximized();

        if (maximized) {
            window.chrome.app.window.current().restore();
            $('#window-maximize').attr('title', chrome.i18n.getMessage('maximizeButton'));
        } else {
            window.chrome.app.window.current().maximize();
            $('#window-maximize').attr('title', chrome.i18n.getMessage('restoreButton'));
        }
    });
});