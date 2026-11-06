'use strict';
/* js/models/crow.js: the crow's model (perched, wings folded), as data (defineBoxModel, entities/box-models.js reads it by name). Made by
   toolsrc/json-to-model.js from textures/Entity/Animals/crow.json: to change the model, make it again from a new JSON. */
defineBoxModel('crow', {
  texture_size: [256,240],
  bones: [
    {"name":"body","pivot":[8,4,8],"parent":null},
    {"name":"head","pivot":[8,5.5,4],"parent":"body"},
    {"name":"wing_left","pivot":[6,5,6],"parent":"body"},
    {"name":"wing_right","pivot":[10,5,6],"parent":"body"},
  ],
  elements: [
    {"name":"body","bone":"body","from":[6,2,4.5],"to":[10,6,11.5],"rotation":{"origin":[8,4,8],"axis":"x","angle":-10},"faces":{"up":{"uv":[3.5,0,5.5,3.7333]},"down":{"uv":[5.5,0,7.5,3.7333]},"east":{"uv":[0,3.7333,3.5,5.8667]},"north":{"uv":[3.5,3.7333,5.5,5.8667]},"west":{"uv":[5.5,3.7333,9,5.8667]},"south":{"uv":[9,3.7333,11,5.8667]}}},
    {"name":"head","bone":"head","from":[6.5,5,1.5],"to":[9.5,8,4.5],"faces":{"up":{"uv":[1.5,10.9333,3,12.5333]},"down":{"uv":[3,10.9333,4.5,12.5333]},"east":{"uv":[0,12.5333,1.5,14.1333]},"north":{"uv":[1.5,12.5333,3,14.1333]},"west":{"uv":[3,12.5333,4.5,14.1333]},"south":{"uv":[4.5,12.5333,6,14.1333]}}},
    {"name":"beak","bone":"head","from":[7.5,5.5,-1],"to":[8.5,6.5,1.5],"faces":{"up":{"uv":[1.25,14.1333,1.75,15.4667]},"down":{"uv":[1.75,14.1333,2.25,15.4667]},"east":{"uv":[0,15.4667,1.25,16]},"north":{"uv":[1.25,15.4667,1.75,16]},"west":{"uv":[1.75,15.4667,3,16]},"south":{"uv":[3,15.4667,3.5,16]}}},
    {"name":"wing_l","bone":"wing_left","from":[5.5,2.5,5],"to":[6.5,5.5,11.5],"rotation":{"origin":[8,4,8],"axis":"x","angle":-10},"faces":{"up":{"uv":[3.25,5.8667,3.75,9.3333]},"down":{"uv":[3.75,5.8667,4.25,9.3333]},"east":{"uv":[0,9.3333,3.25,10.9333]},"north":{"uv":[3.25,9.3333,3.75,10.9333]},"west":{"uv":[3.75,9.3333,7,10.9333]},"south":{"uv":[7,9.3333,7.5,10.9333]}}},
    {"name":"wing_r","bone":"wing_right","from":[9.5,2.5,5],"to":[10.5,5.5,11.5],"rotation":{"origin":[8,4,8],"axis":"x","angle":-10},"faces":{"up":{"uv":[10.75,5.8667,11.25,9.3333]},"down":{"uv":[11.25,5.8667,11.75,9.3333]},"east":{"uv":[7.5,9.3333,10.75,10.9333]},"north":{"uv":[10.75,9.3333,11.25,10.9333]},"west":{"uv":[11.25,9.3333,14.5,10.9333]},"south":{"uv":[14.5,9.3333,15,10.9333]}}},
    {"name":"tail","bone":"body","from":[6.5,3,11],"to":[9.5,4,16],"rotation":{"origin":[8,3.5,11],"axis":"x","angle":12},"faces":{"up":{"uv":[8.5,10.9333,10,13.6]},"down":{"uv":[10,10.9333,11.5,13.6]},"east":{"uv":[6,13.6,8.5,14.1333]},"north":{"uv":[8.5,13.6,10,14.1333]},"west":{"uv":[10,13.6,12.5,14.1333]},"south":{"uv":[12.5,13.6,14,14.1333]}}},
    {"name":"leg_l","bone":"body","from":[6.5,0,7],"to":[7.5,2,8],"faces":{"up":{"uv":[4,14.1333,4.5,14.6667]},"down":{"uv":[4.5,14.1333,5,14.6667]},"east":{"uv":[3.5,14.6667,4,15.7333]},"north":{"uv":[4,14.6667,4.5,15.7333]},"west":{"uv":[4.5,14.6667,5,15.7333]},"south":{"uv":[5,14.6667,5.5,15.7333]}}},
    {"name":"leg_r","bone":"body","from":[8.5,0,7],"to":[9.5,2,8],"faces":{"up":{"uv":[6,14.1333,6.5,14.6667]},"down":{"uv":[6.5,14.1333,7,14.6667]},"east":{"uv":[5.5,14.6667,6,15.7333]},"north":{"uv":[6,14.6667,6.5,15.7333]},"west":{"uv":[6.5,14.6667,7,15.7333]},"south":{"uv":[7,14.6667,7.5,15.7333]}}},
  ],
});
