'use strict';
/* voxiGrof — core parts: how the three worker cores are put together from many files.

   THE PROBLEM. Three big functions run twice: here on the page, and as TEXT inside the workers (10-workers.js turns
   each one into a string and builds the worker from it):
     BIOME_CORE   the land's shape and the biomes' names          built in biomes/biomes.js
     BLOCK_CORE   every block: ids, tiles, properties, shapes     built in blocks/blocks.js
     VOXEL_CORE   world generation, the mesher, the fluid rules   built in chunks/voxel-core.js
   A function cannot be spread over files, and code that only sits in another file would never reach the worker.

   THE ANSWER. Every file that belongs to a core hands over a PART:
       corePart('gen.chunk', function () { ...code... });
   The wrapper function is never called: only the text between its braces is used. buildCore(name) glues the parts
   of that name together, in the order their files were loaded (the order of the <script> tags in index.html), and
   makes ONE function from the text. The code runs exactly as if it had all been written in one place.

   NESTING. A part may hold a comment that reads  @include gen.chunk  (written as a block comment with nothing else
   in it). The parts named 'gen.chunk' are pasted in at that spot. That is how one long function is spread over
   files: its first and last line stay in one part with an include between them, and the included parts are its
   body.

   WHEN YOU EDIT A PART
   - It is not a function of its own. It uses the names of the function it is pasted into, and what it declares
     is seen by the parts pasted after it. Each part file says at its top where it is pasted.
   - It cannot use anything from the page (player, scene, THREE, the DOM): in the worker those do not exist.
   - The order of the script tags IS the order of the code. Never reorder a core's files in index.html.
   - World generation draws its random numbers in a fixed order. Moving or adding a line that draws one changes
     the world a seed gives, and an old world's new chunks would no longer match its old ones.
   - An error inside a core shows in the browser as "anonymous" or a blob address, not as the part's file: search
     for the text of the failing line. */
const CORE_PARTS = {};            // part name -> its wrapper functions, in load order
function corePart(name, fn) { (CORE_PARTS[name] || (CORE_PARTS[name] = [])).push(fn); }
// the text between a wrapper's first { and its last }
function _corePartBody(fn) {
  const s = fn.toString();
  return s.slice(s.indexOf('{') + 1, s.lastIndexOf('}'));
}
// the whole text of the parts called `name`, every include inside them filled in
function coreSource(name) {
  const parts = CORE_PARTS[name];
  if (!parts) throw new Error('core part missing: ' + name + ' (is its file in index.html, before the core is built?)');
  return parts.map(_corePartBody).join('\n').replace(/\/\*@include ([\w.-]+)\*\//g, (m, inner) => coreSource(inner));
}
// one core as a function: called here for the page, and turned into text for the workers (10-workers.js)
function buildCore(name) { return new Function("'use strict';\n" + coreSource(name)); }
