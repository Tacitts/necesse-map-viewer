# Necesse Map Viewer

A map viewer for Necesse worlds that runs entirely in your browser.

**Open it: https://tacitts.github.io/necesse-map-viewer/**

## What it does
- Shows your saved world on the Surface, Cave and Deep Cave layers.
- Fills in the areas you haven't explored yet from your world's seed, using a port of the game's own world generator (game version 1.3.3).
- Marks villages, pirate villages, dungeon entrances, boss arenas, crypts, temples, mines and other structures.
- Draws those structures tile by tile in unexplored areas too, on all three layers, matching what the game will generate there.
- Shows chests and their contents, including chests in unexplored areas, with an item search.

## How to use it
1. Find your world save. On Windows it is in
   `%APPDATA%\Necesse\saves\worlds`
   (for example `C:\Users\<you>\AppData\Roaming\Necesse\saves\worlds`).
2. Open the viewer and choose your world's `.zip` file.

Your save is read inside your own browser. It is never uploaded anywhere.

## Found a problem?
[Report it here](https://github.com/Tacitts/necesse-map-viewer/issues/new) (a GitHub account is needed), or use **Report a problem** at the top right of the viewer, which fills in your browser and where you were looking on the map. Say what you expected to see, and include the x and y from the bar at the bottom if it is about one spot on the map.

## Notes
- Made for Necesse 1.3.3. Other versions may generate slightly differently.
- To use it offline, download `necesse-map-viewer.html` from the [latest release](https://github.com/Tacitts/necesse-map-viewer/releases/latest). It is the whole viewer in one file and opens straight from your computer.

## How the code is laid out
| Path | What it is |
|---|---|
| `index.html` | The page itself: the toolbar, panels and map area. |
| `css/viewer.css` | Styles. |
| `js/viewer.js` | The viewer: reads the world save, draws the map, lists, search and hover cards, and runs the generator in background workers. |
| `js/generator/necesse-gen.js` | The world generator: biomes, oceans, rivers, beaches and caves. |
| `js/generator/cave-presets.js` | Where structures are placed on each layer. |
| `js/generator/cave-chests.js` | Loot tables and the chests in generated structures. |
| `js/generator/village-gen.js` | Villages, and the preset engine the other structures use. |
| `js/generator/structures.js` | Every other structure, tile by tile. |
| `js/generator/biome-deco.js` | Trees, grass, flowers, rocks, ores and cave plants. |
| `js/generator/jhashmap.js` | Java HashMap iteration order, which the game's generation depends on. |
| `data/` | Game data the generator and viewer use: presets, loot tables, names, map colours, biome rules. |
| `images/` | Item icons and the site icons. |

The site needs to be served over the web (as GitHub Pages does), because the background workers load the generator files; opening `index.html` from a downloaded copy of the repository will not work. Use the release file for that.
 
