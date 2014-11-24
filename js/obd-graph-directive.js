'use strict';

angular.module('app.graph', [])
  .directive('obdGraph', function ($parse) {
    return {
      restrict: 'E',
      scope: {
        value: '=',
        unit: '=',
        min: '=',
        max: '='
      },
      replace: false,
      link: function (scope, element, attrs) {
        var chart = d3.select(element[0]);
        var box = chart.append("svg").attr("height", 150).attr("width", 900).attr("class", "graph");
        var background = box.append("svg:g").attr("class", "background");
        background.append("svg:circle").attr("cx", 75).attr("cy", 75).attr("r", 75).attr("class", "meter");

        var startAngle = -(180 + 45);
        var endAngle = 45;
        var meterScale = d3.scale.linear().domain([scope.min, scope.max]).range([startAngle, endAngle]);

        background.selectAll(".meterdot")
          .data(meterScale.ticks(10))
          .enter()
          .append("svg:line")
          .attr("class", "meterdot")
          .attr("x1", 137)
          .attr("y1", 75)
          .attr("x2", 145)
          .attr("y2", 75)
          .attr("transform", function (d, i) {
            var angle = meterScale(d);
            return "rotate(" + angle + " 75 75)";
          });


        scope.$watch('value', function (newVal, oldVal) {
          var label = box.selectAll('.valueLabel').data([newVal]);
          label.enter().append("svg:text").attr("class", "valueLabel")
            .attr("x", 75)
            .attr("y", 130)
            .attr("text-anchor", "middle")
            .text(function (d) {
              return d3.round(d, 2);
            });
          label.text(function (d) {
            return d3.round(d, 2);
          });

          var wiper = background.selectAll(".wiper")
            .data([newVal]);
          var wiperEnter = wiper.enter();
          wiperEnter.append("svg:line")
            .attr("class", "wiper")
            .attr("x1", 75)
            .attr("y1", 75)
            .attr("x2", 140)
            .attr("y2", 75)
            .attr("transform", function (d, i) {
              var angle = meterScale(d);
              return "rotate(" + angle + " 75 75)";
            });
          wiperEnter.append("svg:circle")
            .attr("cx", 75)
            .attr("cy", 75)
            .attr("r", 16)
            .attr("class", "wipercap");
        });
      }
    };
  });