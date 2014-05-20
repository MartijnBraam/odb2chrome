function Gauges(){
    this.gaugelist = {};
}

Gauges.prototype.add = function(id, min, max, label, unit){
    this.gaugelist[id] = {
        id: id,
        min: min,
        max: max,
        label: label,
        unit: unit,
        gauge: new JustGage({
            id: id,
            value: 0,
            min: min,
            max: max,
            title: label,
            label: unit
        })
    };
};

Gauges.prototype.update = function(id, value){
    this.gaugelist[id].gauge.refresh(value);
};