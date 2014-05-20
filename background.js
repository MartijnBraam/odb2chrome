chrome.app.runtime.onLaunched.addListener(function() {
    chrome.app.window.create('main.html', {
        frame: 'none',
        minWidth: 400,
        minHeight: 400,
        width: 700,
        height: 700
    });
});