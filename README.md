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
- The whole viewer is the single file `index.html`; you can also download it and open it offline.
 
