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
      connectionId: -1,
      initPhase: 1,
      elmVersion: ""
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
      var responseId = [];
      data.forEach(function (response) {
        if (response != '>') {
          var part = response.split(" ");
          responseId = part.splice(0, 2);
          ret = ret.concat(part);
        }
      });
      for (var i = 0; i < responseId.length; i++) {
        responseId[i] = parseInt("0x" + responseId[i], 16);
      }
      for (var i = 0; i < ret.length; i++) {
        ret[i] = parseInt("0x" + ret[i], 16);
      }
      responseId[0] -= 64; // Remove response id offset
      return {
        id: responseId,
        data: ret
      };
    };

    this._queue = [];

    this._callbacks = {
      "1.0": function (data) {
        console.log("WORKING!");
      }
    };

    this._onResponse = function (lines) {
      console.log("_onResponse", lines);
      if (this.state.initPhase > 0) {
        switch (this.state.initPhase) {
          case 1:
            // Reset response received, set echo
            if (this.config.crlf) {
              this.write("ATE0\r\n");
            } else {
              this.write("ATE0\r");
            }
            this.state.initPhase = 2;
            break;
          case 2:
            // Echo is now disabled
            if (this.config.crlf) {
              // Disable CRLF
              this.state.initPhase = 3;
              this.write("ATL0\r\n");
            } else {
              // CRLF already disabled on this device, request version
              this.state.initPhase = 4;
              this.write("ATI\r");
            }
            break;
          case 3:
            // CRLF is now disabled, request version
            this.state.initPhase = 4;
            this.write("ATI\r");
            break;
          case 4:
            // Version response
            this.state.elmVersion = lines[0];
            // Request OBDII bus autoconfig
            this.state.initPhase = 5;
            this.write("ATSP0\r");
            break;
          case 5:
            /*
             The OBDII bus is now set up in the ELM327 chip (if the ECU in the car works)
             This is the end of the ELM327 init, bootstrap the next phase: Capability detection
             */
            console.log("ELM327 init complete.");
            this.state.initPhase = 0;
            this.write("0100\r"); // OBDII command 01 00 (Get Mode 01 support)
            break;
        }
      }else{
        // Remove useless status information
        if(lines[0].indexOf("SEARCHING")>-1){
          lines.shift();
        }

        // Check for connection issue
        if(lines[0].indexOf("UNABLE TO CONNECT")>-1){
          this.state.state='ECU Error';
        }else{
          // Parse the OBDII response to useful data
          var obd2Response = this._parseObdResponse(lines);
          var callbackName = obd2Response.id.join(".");
          console.log("OBDII Response:", callbackName, obd2Response.data);

          // Call the callback for this response id;
          this._callbacks[callbackName](obd2Response);

          // Write next command in queue
          if(this._queue.length > 0){
            this.write(this._queue.shift());
          }else{
            console.log("queue empty!");
          }
        }


      }
    };

    return this;
  }]);