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
        scope.state.state = 'resetting ELM327';
        $rootScope.$apply();
        scope.state.connectionId = connectionInfo.connectionId;
        console.log("initializing");
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
      "1.0": function (response) {
        this._parseMode1SupportPage(0, response.data);
        if (this.pids["20"].available) {
          this.state.state = 'Fetching sensor support page 2';
          $rootScope.$apply();
          this._queue.push("0120\r");
        } else {
          this.state.state = 'Connected';
          $rootScope.$apply();
        }
      },
      "1.20": function (response) {
        this._parseMode1SupportPage(1, response.data);
      }
    };

    this._parseMode1SupportPage = function (page, data) {
      for (var key in this.pids) {
        if (this.pids.hasOwnProperty(key)) {
          var pidId = parseInt("0x" + key, 16);
          if (pidId >= page * 32 && pidId < (page + 1) * 32) {
            this.pids[key].available = (data[this.pids[key].byte] & (Math.pow(2, this.pids[key].bit - 1))) > 0;
          }
        }
      }
      $rootScope.$apply();
    };

    this._onResponse = function (lines) {
      console.log("_onResponse", lines);
      if (this.state.initPhase > 0) {
        switch (this.state.initPhase) {
          case 1:
            // Reset response received, set echo
            this.state.state = 'disabling echo';
            $rootScope.$apply();
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
              this.state.state = 'disabling crlf';
              $rootScope.$apply();
              this.state.initPhase = 3;
              this.write("ATL0\r\n");
            } else {
              // CRLF already disabled on this device, request version
              this.state.state = 'requesting ELM327 version';
              $rootScope.$apply();
              this.state.initPhase = 4;
              this.write("ATI\r");
            }
            break;
          case 3:
            // CRLF is now disabled, request version
            this.state.initPhase = 4;
            this.state.state = 'requesting ELM327 version';
            $rootScope.$apply();
            this.write("ATI\r");
            break;
          case 4:
            // Version response
            this.state.elmVersion = lines[0];
            // Request OBDII bus autoconfig
            this.state.state = 'Set ELM327 bus to autodetect';
            $rootScope.$apply();
            this.state.initPhase = 5;
            this.write("ATSP0\r");
            break;
          case 5:
            /*
             The OBDII bus is now set up in the ELM327 chip (if the ECU in the car works)
             This is the end of the ELM327 init, bootstrap the next phase: Capability detection
             */
            console.log("ELM327 init complete.");
            this.state.state = 'Fetching sensor support page 1';
            $rootScope.$apply();
            this.state.initPhase = 0;
            this.write("0100\r"); // OBDII command 01 00 (Get Mode 01 support)
            break;
        }
      } else {
        // Remove useless status information
        if (lines[0].indexOf("SEARCHING") > -1) {
          lines.shift();
        }

        // Check for connection issue
        if (lines[0].indexOf("UNABLE TO CONNECT") > -1) {
          this.state.state = 'ECU Error';
        } else {
          // Parse the OBDII response to useful data
          var obd2Response = this._parseObdResponse(lines);
          var callbackName = obd2Response.id.join(".");
          console.log("OBDII Response:", callbackName, obd2Response.data);

          // Call the callback for this response id;
          this._callbacks[callbackName].call(this, obd2Response);

          // Write next command in queue
          if (this._queue.length > 0) {
            this.write(this._queue.shift());
          } else {
            console.log("queue empty!");
          }
        }


      }
    };

    this.pids = {
      // Page 1
      '01': {'available': false, byte: 0, bit: 8, 'name': 'Monitor status since DTCs cleared'},
      '02': {'available': false, byte: 0, bit: 7, 'name': 'Freeze DTC'},
      '03': {'available': false, byte: 0, bit: 6, 'name': 'Fuel system status'},
      '04': {'available': false, byte: 0, bit: 5, 'name': 'Calculated engine load value'},
      '05': {'available': false, byte: 0, bit: 4, 'name': 'Engine coolant temperature'},
      '06': {'available': false, byte: 0, bit: 3, 'name': 'Short term fuel % trim—Bank 1'},
      '07': {'available': false, byte: 0, bit: 2, 'name': 'Long term fuel % trim—Bank 1'},
      '08': {'available': false, byte: 0, bit: 1, 'name': 'Short term fuel % trim—Bank 2'},

      '09': {'available': false, byte: 1, bit: 8, 'name': 'Long term fuel % trim—Bank 2'},
      '0A': {'available': false, byte: 1, bit: 7, 'name': 'Fuel pressure'},
      '0B': {'available': false, byte: 1, bit: 6, 'name': 'Intake manifold absolute pressure'},
      '0C': {'available': false, byte: 1, bit: 5, 'name': 'Engine RPM'},
      '0D': {'available': false, byte: 1, bit: 4, 'name': 'Vehicle speed'},
      '0E': {'available': false, byte: 1, bit: 3, 'name': 'Timing advance'},
      '0F': {'available': false, byte: 1, bit: 2, 'name': 'Intake air temperature'},
      '10': {'available': false, byte: 1, bit: 1, 'name': 'MAF air flow rate'},

      '11': {'available': false, byte: 2, bit: 8, 'name': 'Throttle position'},
      '12': {'available': false, byte: 2, bit: 7, 'name': 'Commanded secondary air status'},
      '13': {'available': false, byte: 2, bit: 6, 'name': 'Oxygen sensors present'},
      '14': {'available': false, byte: 2, bit: 5, 'name': 'Bank 1, Sensor 1'},
      '15': {'available': false, byte: 2, bit: 4, 'name': 'Bank 1, Sensor 2'},
      '16': {'available': false, byte: 2, bit: 3, 'name': 'Bank 1, Sensor 3'},
      '17': {'available': false, byte: 2, bit: 2, 'name': 'Bank 1, Sensor 4'},
      '18': {'available': false, byte: 2, bit: 1, 'name': 'Bank 2, Sensor 1'},

      '19': {'available': false, byte: 3, bit: 8, 'name': 'Bank 2, Sensor 2'},
      '1A': {'available': false, byte: 3, bit: 7, 'name': 'Bank 2, Sensor 3'},
      '1B': {'available': false, byte: 3, bit: 6, 'name': 'Bank 2, Sensor 4'},
      '1C': {'available': false, byte: 3, bit: 5, 'name': 'OBD standards this vehicle conforms to'},
      '1D': {'available': false, byte: 3, bit: 4, 'name': 'Oxygen sensors present'},
      '1E': {'available': false, byte: 3, bit: 3, 'name': 'Auxiliary input status'},
      '1F': {'available': false, byte: 3, bit: 2, 'name': 'Run time since engine start'},
      '20': {'available': false, byte: 3, bit: 1, 'name': 'PIDs supported [21 - 40]'},

      // Page 2
      '21': {'available': false, byte: 0, bit: 8, 'name': 'Distance traveled with malfunction indicator lamp (MIL) on'},
      '22': {'available': false, byte: 0, bit: 7, 'name': 'Fuel Rail Pressure (relative to manifold vacuum)'},
      '23': {'available': false, byte: 0, bit: 6, 'name': 'Fuel Rail Pressure (diesel, or gasoline direct inject)'},
      '24': {'available': false, byte: 0, bit: 5, 'name': 'O2S1_WR_lambda(1): Voltage'},
      '25': {'available': false, byte: 0, bit: 4, 'name': 'O2S2_WR_lambda(1): Voltage'},
      '26': {'available': false, byte: 0, bit: 3, 'name': 'O2S3_WR_lambda(1): Voltage'},
      '27': {'available': false, byte: 0, bit: 2, 'name': 'O2S4_WR_lambda(1): Voltage'},
      '28': {'available': false, byte: 0, bit: 1, 'name': 'O2S5_WR_lambda(1): Voltage'},

      '29': {'available': false, byte: 1, bit: 8, 'name': 'O2S6_WR_lambda(1): Voltage'},
      '2A': {'available': false, byte: 1, bit: 7, 'name': 'O2S7_WR_lambda(1): Voltage'},
      '2B': {'available': false, byte: 1, bit: 6, 'name': 'O2S8_WR_lambda(1): Voltage'},
      '2C': {'available': false, byte: 1, bit: 5, 'name': 'Commanded EGR'},
      '2D': {'available': false, byte: 1, bit: 4, 'name': 'EGR Error'},
      '2E': {'available': false, byte: 1, bit: 3, 'name': 'Commanded evaporative purge'},
      '2F': {'available': false, byte: 1, bit: 2, 'name': 'Fuel Level Input'},
      '30': {'available': false, byte: 1, bit: 1, 'name': 'number of warm-ups since codes cleared'},

      '31': {'available': false, byte: 2, bit: 8, 'name': 'Distance traveled since codes cleared'},
      '32': {'available': false, byte: 2, bit: 7, 'name': 'Evap. System Vapor Pressure'},
      '33': {'available': false, byte: 2, bit: 6, 'name': 'Barometric pressure'},
      '34': {'available': false, byte: 2, bit: 5, 'name': 'O2S1_WR_lambda(1): Current'},
      '35': {'available': false, byte: 2, bit: 4, 'name': 'O2S2_WR_lambda(1): Current'},
      '36': {'available': false, byte: 2, bit: 3, 'name': 'O2S3_WR_lambda(1): Current'},
      '37': {'available': false, byte: 2, bit: 2, 'name': 'O2S4_WR_lambda(1): Current'},
      '38': {'available': false, byte: 2, bit: 1, 'name': 'O2S5_WR_lambda(1): Current'},

      '39': {'available': false, byte: 3, bit: 8, 'name': 'O2S6_WR_lambda(1): Current'},
      '3A': {'available': false, byte: 3, bit: 7, 'name': 'O2S7_WR_lambda(1): Current'},
      '3B': {'available': false, byte: 3, bit: 6, 'name': 'O2S8_WR_lambda(1): Current'},
      '3C': {'available': false, byte: 3, bit: 5, 'name': 'Catalyst Temperature: Bank 1, Sensor 1'},
      '3D': {'available': false, byte: 3, bit: 4, 'name': 'Catalyst Temperature: Bank 2, Sensor 1'},
      '3E': {'available': false, byte: 3, bit: 3, 'name': 'Catalyst Temperature: Bank 1, Sensor 2'},
      '3F': {'available': false, byte: 3, bit: 2, 'name': 'Catalyst Temperature: Bank 2, Sensor 2'},
      '40': {'available': false, byte: 3, bit: 1, 'name': 'PIDs supported [21 - 40]'}
    };

    return this;
  }]);