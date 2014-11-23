'use strict';

angular.module('app.serialport', [])
  .service("elm327", ["$rootScope", function ($rootScope) {
    this.config = {
      port: "",
      baudrate: 38400,
      crlf: false
    };
    this.state = {
      state: 'disconnected',
      connectionId: -1
    };

    this._convertStringToArrayBuffer = function (str) {
      var buf = new ArrayBuffer(str.length);
      var bufView = new Uint8Array(buf);
      for (var i = 0; i < str.length; i++) {
        bufView[i] = str.charCodeAt(i);
      }
      return buf;
    };

    this._convertArrayBufferToString = function (buf) {
      return String.fromCharCode.apply(null, new Uint8Array(buf));
    };

    this.connect = function () {
      var options = {
        bitrate: this.config.baudrate,
        dataBits: "eight",
        parityBit: "no",
        stopBits: "one",
        ctsFlowControl: false
      };
      this.state.state = 'connecting';
      var scope = this;
      chrome.serial.connect(this.config.port, options, function (connectionInfo) {
        console.log("connection info", connectionInfo);
        if (!connectionInfo || connectionInfo.connectionId == -1) {
          scope.state.state = 'disconnected';
          console.log('connection failed');
          return;
        }
        scope.state.state = 'connected';
        scope.state.connectionId = connectionInfo.connectionId;
        console.log("connected");
        chrome.serial.onReceive.addListener(
          function (info) {
            var char = scope._convertArrayBufferToString(info.data);
            if (char.length > 1) {
              var chars = char.split('');
              for (var i = 0; i < chars.length; i++) {
                scope._onReceiveChar(chars[i]);
              }
            } else {
              scope._onReceiveChar(char);
            }
          }
        );

        if (scope.config.crlf) {
          scope.write("ATZ\r\n");
        } else {
          scope.write("ATZ\r");
        }
      });
    };

    this.write = function (str) {
      console.log("write", str, "to connection", this.state.connectionId);
      chrome.serial.send(this.state.connectionId, this._convertStringToArrayBuffer(str), function () {
      });
    };

    this.lines = [];
    this.readBuffer = "";
    this._onReceiveChar = function (char) {
      if (char == "\r") {
        if (this.readBuffer !== "") {
          this.lines.push(this.readBuffer.trim());
          this.readBuffer = "";
        }
      } else if (char == ">") {
        this._onResponse(this.lines);
        this.lines = [];
        this.readBuffer = "";
      } else {
        this.readBuffer += char;
      }
    };

    this._parseObdResponse = function (data) {
      var ret = [];
      data.forEach(function (response) {
        if (response != '>') {
          var part = response.split(" ");
          part.splice(0, 2);
          ret = ret.concat(part);
        }
      });
      for (var i = 0; i < ret.length; i++) {
        ret[i] = parseInt("0x" + ret[i], 16);
      }
      return ret;
    };

    this._queue = [];

    this._callbacks = {
      "01.00": function (data) {
      }
    };

    this._onResponse = function (lines) {
      console.log("_onResponse", lines);
    };

    return this;
  }]);