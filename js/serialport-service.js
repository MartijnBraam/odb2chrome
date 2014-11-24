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
      },
      "1": function (response) {
        var pid = response.id[1].toString(16).toUpperCase();
        if (pid.length == 1) {
          pid = "0" + pid;
        }
        if (this.pids[pid].hasOwnProperty("calc")) {
          this.pids[pid].value = this.pids[pid].calc(response.data);
        } else {
          this.pids[pid].value = response.data;
        }
        $rootScope.$apply();
      },
      "3.1": function (response) {
        this.dtcs = [];
        response.data.shift();
        var count = response.data.length / 2;
        for (var i = 0; i < count; i++) {
          var dtc = response.data.slice(i * 2, i * 2 + 2);
          this._parseDTC(dtc);
        }
        $rootScope.$apply();
      }
    };

    this._parseDTC = function (byte) {
      var dtc = "";
      var first = (byte[0] & 128) + (byte[0] & 64);
      switch (first) {
        case 0:
          dtc += "P";
          break;
        case 64:
          dtc += "C";
          break;
        case 128:
          dtc += "B";
          break;
        case 64 + 128:
          dtc += "U";
          break;
      }
      var second = (byte[0] & 32) + (byte[0] & 16);
      switch (second) {
        case 0:
          dtc += "0";
          break;
        case 16:
          dtc += "1";
          break;
        case 32:
          dtc += "2";
          break;
        case 16 + 32:
          dtc += "3";
          break;
      }

      var third = (byte[0] & 8) + (byte[0] & 4) + (byte[0] & 2) + (byte[0] & 1);
      dtc += third.toString(16).toUpperCase();
      var secondbyte = byte[1].toString(16).toUpperCase();
      if (secondbyte.length == 1) {
        secondbyte = "0" + secondbyte;
      }
      dtc += secondbyte;
      this.dtcs.push(dtc);
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
          if (lines[0].indexOf("NO DATA") == -1) {
            // Parse the OBDII response to useful data
            var obd2Response = this._parseObdResponse(lines);
            var callbackName = obd2Response.id.join(".");
            console.log("OBDII Response:", callbackName, obd2Response.data);
            // Call the callback for this response id;
            if (this._callbacks.hasOwnProperty(callbackName)) {
              this._callbacks[callbackName].call(this, obd2Response);
            } else if (this._callbacks.hasOwnProperty("" + obd2Response.id[0])) {
              this._callbacks["" + obd2Response.id[0]].call(this, obd2Response);
            } else {
              console.log("No callback for", callbackName);
            }
          } else {
            console.log("No data received");
          }

          // Write next command in queue
          if (this._queue.length > 0) {
            this.write(this._queue.shift());
          } else {
            console.log("queue empty!");
            var scope = this;
            setTimeout(function () {
              scope._checkQueue.call(scope);
            }, 100);
          }
        }


      }
    };

    this._checkQueue = function () {
      if (this._queue.length > 0) {
        this.write(this._queue.shift());
      } else {
        var scope = this;
        setTimeout(function () {
          scope._checkQueue.call(scope);
        }, 100);
      }
    };

    this.pids = {
      // Page 1
      '01': {'available': false, byte: 0, bit: 8, 'name': 'Monitor status since DTCs cleared', unit: '', value: 0},
      '02': {'available': false, byte: 0, bit: 7, 'name': 'Freeze DTC', unit: '', value: 0},
      '03': {'available': false, byte: 0, bit: 6, 'name': 'Fuel system status', unit: '', value: 0},
      '04': {
        'available': false,
        byte: 0,
        bit: 5,
        'name': 'Calculated engine load value',
        unit: '%',
        value: 0,
        calc: function (data) {
          return data[0] * 100 / 255;
        }
      },
      '05': {
        'available': false,
        byte: 0,
        bit: 4,
        'name': 'Engine coolant temperature',
        unit: '°C',
        value: 0,
        calc: function (data) {
          return data[0] - 40;
        }
      },
      '06': {
        'available': false,
        byte: 0,
        bit: 3,
        'name': 'Short term fuel % trim—Bank 1',
        unit: '%',
        value: 0,
        calc: function (data) {
          return (data[0] - 128) * (100 / 128);
        }
      },
      '07': {
        'available': false,
        byte: 0,
        bit: 2,
        'name': 'Long term fuel % trim—Bank 1',
        unit: '%',
        value: 0,
        calc: function (data) {
          return (data[0] - 128) * (100 / 128);
        }
      },
      '08': {
        'available': false,
        byte: 0,
        bit: 1,
        'name': 'Short term fuel % trim—Bank 2',
        unit: '%',
        value: 0,
        calc: function (data) {
          return (data[0] - 128) * (100 / 128);
        }
      },

      '09': {
        'available': false,
        byte: 1,
        bit: 8,
        'name': 'Long term fuel % trim—Bank 2',
        unit: '%',
        value: 0,
        calc: function (data) {
          return (data[0] - 128) * (100 / 128);
        }
      },
      '0A': {
        'available': false,
        byte: 1,
        bit: 7,
        'name': 'Fuel pressure',
        unit: 'kPa',
        value: 0,
        calc: function (data) {
          return data[0] * 3;
        }
      },
      '0B': {
        'available': false,
        byte: 1,
        bit: 6,
        'name': 'Intake manifold absolute pressure',
        unit: 'kPa',
        value: 0,
        calc: function (data) {
          return data[0];
        }
      },
      '0C': {
        'available': false,
        byte: 1,
        bit: 5,
        'name': 'Engine RPM',
        unit: 'rpm',
        value: 0,
        calc: function (data) {
          return ((data[0] * 256) + data[1]) / 100;
        }
      },
      '0D': {
        'available': false,
        byte: 1,
        bit: 4,
        'name': 'Vehicle speed',
        unit: 'km/h',
        value: 0,
        calc: function (data) {
          return data[0];
        }
      },
      '0E': {
        'available': false,
        byte: 1,
        bit: 3,
        'name': 'Timing advance',
        unit: '° relative to first cylinder',
        value: 0,
        calc: function (data) {
          return (data[0] - 128) / 2;
        }
      },
      '0F': {
        'available': false,
        byte: 1,
        bit: 2,
        'name': 'Intake air temperature',
        unit: '°C',
        value: 0,
        calc: function (data) {
          return data[0] - 40;
        }
      },
      '10': {
        'available': false,
        byte: 1,
        bit: 1,
        'name': 'MAF air flow rate',
        unit: 'grams/sec',
        value: 0,
        calc: function (data) {
          return ((data[0] * 256) + data[1]) / 100;
        }
      },

      '11': {'available': false, byte: 2, bit: 8, 'name': 'Throttle position', unit: '%', value: 0},
      '12': {'available': false, byte: 2, bit: 7, 'name': 'Commanded secondary air status', unit: '', value: 0},
      '13': {'available': false, byte: 2, bit: 6, 'name': 'Oxygen sensors present', unit: '', value: 0},
      '14': {'available': false, byte: 2, bit: 5, 'name': 'Bank 1, Sensor 1', unit: 'V', value: 0},
      '15': {'available': false, byte: 2, bit: 4, 'name': 'Bank 1, Sensor 2', unit: 'V', value: 0},
      '16': {'available': false, byte: 2, bit: 3, 'name': 'Bank 1, Sensor 3', unit: 'V', value: 0},
      '17': {'available': false, byte: 2, bit: 2, 'name': 'Bank 1, Sensor 4', unit: 'V', value: 0},
      '18': {'available': false, byte: 2, bit: 1, 'name': 'Bank 2, Sensor 1', unit: 'V', value: 0},

      '19': {'available': false, byte: 3, bit: 8, 'name': 'Bank 2, Sensor 2', unit: 'V', value: 0},
      '1A': {'available': false, byte: 3, bit: 7, 'name': 'Bank 2, Sensor 3', unit: 'V', value: 0},
      '1B': {'available': false, byte: 3, bit: 6, 'name': 'Bank 2, Sensor 4', unit: 'V', value: 0},
      '1C': {'available': false, byte: 3, bit: 5, 'name': 'OBD standards this vehicle conforms to', unit: '', value: 0},
      '1D': {'available': false, byte: 3, bit: 4, 'name': 'Oxygen sensors present', unit: '', value: 0},
      '1E': {'available': false, byte: 3, bit: 3, 'name': 'Auxiliary input status', unit: '', value: 0},
      '1F': {'available': false, byte: 3, bit: 2, 'name': 'Run time since engine start', unit: 'seconds', value: 0},
      '20': {'available': false, byte: 3, bit: 1, 'name': 'PIDs supported [21 - 40]', unit: '', value: 0},

      // Page 2
      '21': {
        'available': false,
        byte: 0,
        bit: 8,
        'name': 'Distance traveled with malfunction indicator lamp (MIL) on',
        unit: 'km',
        value: 0
      },
      '22': {
        'available': false,
        byte: 0,
        bit: 7,
        'name': 'Fuel Rail Pressure (relative to manifold vacuum)',
        unit: 'kPa',
        value: 0
      },
      '23': {
        'available': false,
        byte: 0,
        bit: 6,
        'name': 'Fuel Rail Pressure (diesel, or gasoline direct inject)',
        unit: 'kPa',
        value: 0
      },
      '24': {'available': false, byte: 0, bit: 5, 'name': 'O2S1_WR_lambda(1): Voltage', unit: 'V', value: 0},
      '25': {'available': false, byte: 0, bit: 4, 'name': 'O2S2_WR_lambda(1): Voltage', unit: 'V', value: 0},
      '26': {'available': false, byte: 0, bit: 3, 'name': 'O2S3_WR_lambda(1): Voltage', unit: 'V', value: 0},
      '27': {'available': false, byte: 0, bit: 2, 'name': 'O2S4_WR_lambda(1): Voltage', unit: 'V', value: 0},
      '28': {'available': false, byte: 0, bit: 1, 'name': 'O2S5_WR_lambda(1): Voltage', unit: 'V', value: 0},

      '29': {'available': false, byte: 1, bit: 8, 'name': 'O2S6_WR_lambda(1): Voltage', unit: 'V', value: 0},
      '2A': {'available': false, byte: 1, bit: 7, 'name': 'O2S7_WR_lambda(1): Voltage', unit: 'V', value: 0},
      '2B': {'available': false, byte: 1, bit: 6, 'name': 'O2S8_WR_lambda(1): Voltage', unit: 'V', value: 0},
      '2C': {'available': false, byte: 1, bit: 5, 'name': 'Commanded EGR', unit: '%', value: 0},
      '2D': {'available': false, byte: 1, bit: 4, 'name': 'EGR Error', unit: '%', value: 0},
      '2E': {'available': false, byte: 1, bit: 3, 'name': 'Commanded evaporative purge', unit: '%', value: 0},
      '2F': {'available': false, byte: 1, bit: 2, 'name': 'Fuel Level Input', unit: '%', value: 0},
      '30': {'available': false, byte: 1, bit: 1, 'name': 'number of warm-ups since codes cleared', unit: '', value: 0},

      '31': {
        'available': false,
        byte: 2,
        bit: 8,
        'name': 'Distance traveled since codes cleared',
        unit: 'km',
        value: 0
      },
      '32': {'available': false, byte: 2, bit: 7, 'name': 'Evap. System Vapor Pressure', unit: 'Pa', value: 0},
      '33': {'available': false, byte: 2, bit: 6, 'name': 'Barometric pressure', unit: 'kPa', value: 0},
      '34': {'available': false, byte: 2, bit: 5, 'name': 'O2S1_WR_lambda(1): Current', unit: 'mA', value: 0},
      '35': {'available': false, byte: 2, bit: 4, 'name': 'O2S2_WR_lambda(1): Current', unit: 'mA', value: 0},
      '36': {'available': false, byte: 2, bit: 3, 'name': 'O2S3_WR_lambda(1): Current', unit: 'mA', value: 0},
      '37': {'available': false, byte: 2, bit: 2, 'name': 'O2S4_WR_lambda(1): Current', unit: 'mA', value: 0},
      '38': {'available': false, byte: 2, bit: 1, 'name': 'O2S5_WR_lambda(1): Current', unit: 'mA', value: 0},

      '39': {'available': false, byte: 3, bit: 8, 'name': 'O2S6_WR_lambda(1): Current', unit: 'mA', value: 0},
      '3A': {'available': false, byte: 3, bit: 7, 'name': 'O2S7_WR_lambda(1): Current', unit: 'mA', value: 0},
      '3B': {'available': false, byte: 3, bit: 6, 'name': 'O2S8_WR_lambda(1): Current', unit: 'mA', value: 0},
      '3C': {
        'available': false,
        byte: 3,
        bit: 5,
        'name': 'Catalyst Temperature: Bank 1, Sensor 1',
        unit: '°C',
        value: 0
      },
      '3D': {
        'available': false,
        byte: 3,
        bit: 4,
        'name': 'Catalyst Temperature: Bank 2, Sensor 1',
        unit: '°C',
        value: 0
      },
      '3E': {
        'available': false,
        byte: 3,
        bit: 3,
        'name': 'Catalyst Temperature: Bank 1, Sensor 2',
        unit: '°C',
        value: 0
      },
      '3F': {
        'available': false,
        byte: 3,
        bit: 2,
        'name': 'Catalyst Temperature: Bank 2, Sensor 2',
        unit: '°C',
        value: 0
      },
      '40': {'available': false, byte: 3, bit: 1, 'name': 'PIDs supported [21 - 40]', value: 0}
    };

    this.dtcs = [];

    return this;
  }]);