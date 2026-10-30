'use strict';
/* js/models/termite-hills.js: the termite hills' models, big and small, as data (defineBoxModel, entities/box-models.js reads it by name). Made by
   toolsrc/json-to-model.js from textures/Blocks/Models/termite_hill/termite_hill.json, textures/Blocks/Models/termite_hill/termite_hill_small.json: to change the model, make it again from a new JSON. */
defineBoxModel('termite_hill', {
  elements: [
    {"name":"base","from":[1,0,1],"to":[31,9,31],"faces":{"north":{"uv":[33,1,63,10]},"south":{"uv":[33,1,63,10]},"east":{"uv":[33,1,63,10]},"west":{"uv":[33,1,63,10]},"up":{"uv":[0,32,30,62]}}},
    {"name":"lump_w","from":[0,0,8],"to":[3,7,18],"faces":{"north":{"uv":[3,2,6,9]},"south":{"uv":[3,2,6,9]},"east":{"uv":[3,2,13,9]},"west":{"uv":[3,2,13,9]},"up":{"uv":[2,35,5,45]}}},
    {"name":"lump_s","from":[10,0,29],"to":[22,8,32],"faces":{"north":{"uv":[36,26,48,34]},"south":{"uv":[36,26,48,34]},"east":{"uv":[36,26,39,34]},"west":{"uv":[36,26,39,34]},"up":{"uv":[6,36,18,39]}}},
    {"name":"lump_e","from":[29,0,14],"to":[32,9,25],"faces":{"north":{"uv":[10,4,13,13]},"south":{"uv":[10,4,13,13]},"east":{"uv":[10,4,21,13]},"west":{"uv":[10,4,21,13]},"up":{"uv":[4,42,7,53]}}},
    {"name":"lump_n","from":[6,0,0],"to":[16,6,3],"faces":{"north":{"uv":[44,30,54,36]},"south":{"uv":[44,30,54,36]},"east":{"uv":[44,30,47,36]},"west":{"uv":[44,30,47,36]},"up":{"uv":[10,44,20,47]}}},
    {"name":"tier1","from":[3,9,4],"to":[27,19,28],"faces":{"north":{"uv":[34,20,58,30]},"south":{"uv":[34,20,58,30]},"east":{"uv":[34,20,58,30]},"west":{"uv":[34,20,58,30]},"up":{"uv":[0,34,24,58]}}},
    {"name":"bump_e","from":[24,9,6],"to":[29,15,12],"faces":{"north":{"uv":[16,2,21,8]},"south":{"uv":[16,2,21,8]},"east":{"uv":[16,2,22,8]},"west":{"uv":[16,2,22,8]},"up":{"uv":[2,48,7,54]}}},
    {"name":"bump_s","from":[8,9,25],"to":[16,14,30],"faces":{"north":{"uv":[52,29,60,34]},"south":{"uv":[52,29,60,34]},"east":{"uv":[52,29,57,34]},"west":{"uv":[52,29,57,34]},"up":{"uv":[9,52,17,57]}}},
    {"name":"tier2","from":[6,19,6],"to":[22,29,21],"faces":{"north":{"uv":[6,3,22,13]},"south":{"uv":[6,3,22,13]},"east":{"uv":[6,3,21,13]},"west":{"uv":[6,3,21,13]},"up":{"uv":[3,38,19,53]}}},
    {"name":"tier3","from":[9,29,8],"to":[19,38,18],"faces":{"north":{"uv":[41,32,51,41]},"south":{"uv":[41,32,51,41]},"east":{"uv":[41,32,51,41]},"west":{"uv":[41,32,51,41]},"up":{"uv":[12,41,22,51]}}},
    {"name":"spire","from":[11,38,10],"to":[17,45,16],"faces":{"north":{"uv":[14,6,20,13]},"south":{"uv":[14,6,20,13]},"east":{"uv":[14,6,20,13]},"west":{"uv":[14,6,20,13]},"up":{"uv":[6,46,12,52]}}},
    {"name":"spire_tip","from":[12.5,45,11.5],"to":[15.5,48,14.5],"faces":{"north":{"uv":[20,20,23,23]},"south":{"uv":[20,20,23,23]},"east":{"uv":[20,20,23,23]},"west":{"uv":[20,20,23,23]},"up":{"uv":[32,10,40,18]}}},
    {"name":"column_e","from":[18,19,11],"to":[24,37,17],"faces":{"north":{"uv":[50,24,56,42]},"south":{"uv":[50,24,56,42]},"east":{"uv":[50,24,56,42]},"west":{"uv":[50,24,56,42]},"up":{"uv":[32,10,40,18]}}},
    {"name":"chimney_se","from":[20,19,20],"to":[25,30,25],"faces":{"north":{"uv":[24,2,29,13]},"south":{"uv":[24,2,29,13]},"east":{"uv":[24,2,29,13]},"west":{"uv":[24,2,29,13]},"up":{"uv":[32,10,40,18]}}},
    {"name":"chimney_nw","from":[6,29,6],"to":[10,34,10],"faces":{"north":{"uv":[22,14,26,19]},"south":{"uv":[22,14,26,19]},"east":{"uv":[22,14,26,19]},"west":{"uv":[22,14,26,19]},"up":{"uv":[32,10,40,18]}}},
    {"name":"turret_sw","from":[4,19,21],"to":[9,25,26],"faces":{"north":{"uv":[24,8,29,14]},"south":{"uv":[24,8,29,14]},"east":{"uv":[24,8,29,14]},"west":{"uv":[24,8,29,14]},"up":{"uv":[8,56,13,61]}}},
  ],
});
defineBoxModel('termite_hill_small', {
  elements: [
    {"name":"base","from":[1,0,1],"to":[15,4,15],"faces":{"north":{"uv":[1,16,15,20]},"south":{"uv":[1,16,15,20]},"east":{"uv":[1,16,15,20]},"west":{"uv":[1,16,15,20]},"up":{"uv":[16,0,30,14]}}},
    {"name":"turret","from":[10,4,9],"to":[14,9,13],"faces":{"north":{"uv":[2,6,6,11]},"south":{"uv":[2,6,6,11]},"east":{"uv":[2,6,6,11]},"west":{"uv":[2,6,6,11]},"up":{"uv":[16,16,20,20]}}},
    {"name":"tier1","from":[3,4,3],"to":[13,8,12],"faces":{"north":{"uv":[3,2,13,6]},"south":{"uv":[3,2,13,6]},"east":{"uv":[3,2,12,6]},"west":{"uv":[3,2,12,6]},"up":{"uv":[18,3,28,12]}}},
    {"name":"tier2","from":[5,8,5],"to":[10,11,10],"faces":{"north":{"uv":[6,5,11,8]},"south":{"uv":[6,5,11,8]},"east":{"uv":[6,5,11,8]},"west":{"uv":[6,5,11,8]},"up":{"uv":[21,6,26,11]}}},
    {"name":"spire","from":[6,11,6],"to":[9,14,9],"faces":{"north":{"uv":[8,1,11,4]},"south":{"uv":[8,1,11,4]},"east":{"uv":[8,1,11,4]},"west":{"uv":[8,1,11,4]},"up":{"uv":[16,16,20,20]}}},
  ],
});
