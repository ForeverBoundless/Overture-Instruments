# OMNI Front-Panel Studio

The Front-end View is the visual design workspace for the instrument controls presented by an OMNI patch. It is deliberately separate from the sound-engine graph: panel components can bind to modules and parameters, but the panel does not create, remove, or rewire audio nodes.

## Workspace structure

The OMNI command bar is shared by Engine View and Front-end View. The Front-end View reveals additional commands in **Insert**, **Arrange**, **Inspect**, and **Export**, while the existing File, Edit, View, and Help menus retain patch-level operations.

The editor has three working areas:

- **Component library:** searchable, collapsible categories with small visual previews. Select a part to add it or drag it onto the faceplate.
- **Faceplate canvas:** move and resize parts, use rulers and guides, and test live controls without changing the layout.
- **Inspector and layers:** the inspector separates Layout, Appearance, and Behaviour. The layer list controls selection, visibility, locking, and stacking order.

The global theme control sits immediately beside the account control. The Engine View / Front-end View selector stays centred in the top bar.

## Typical workflow

1. Build a patch in Engine View and add the modules that will produce sound.
2. Open Front-end View. Insert controls from the visual library or drag them onto the faceplate.
3. Select a component and use **Layout** for position and size, **Appearance** for materials and colours, and **Behaviour** to connect it to an engine parameter or performance action.
4. Use multi-selection and the Arrange menu for alignment, distribution, and matched dimensions. Use the layer stack to hide, lock, or reorder overlapping elements.
5. Use rulers, grid snapping, guides, and measurements to refine placement. These are editing aids and are not included in exports.
6. Run **Design Check** to find out-of-bounds controls, very small controls, empty labels, unbound engine controls, and likely overlaps.
7. Use **Test Panel** to interact with the live keyboard, wheels, pads, and bound controls while temporarily disabling layout edits. Exit test mode to continue editing.
8. Preview the artwork, then export it in the format needed.

## Appearance and materials

Panel-level settings control the faceplate dimensions, finish, frame and global colours. Component settings control surface, accent, legend and border colours; material finish; spacing and padding; corner radius; border thickness; shadow; and type-specific properties such as keyboard octave count or slider orientation.

The component library and the canvas use the same control families. A visual palette preview is illustrative; the selected component's actual geometry and values are determined by its inspector settings and patch binding.

## Export formats

| Format | Intended use |
| --- | --- |
| SVG | Scalable vector faceplate artwork for documentation and further graphic editing |
| PNG 1× / 2× / 3× | Raster artwork at the selected scale |
| JPEG 1× / 2× | Flattened raster artwork for previews and documents |
| Front-panel JSON | Editable panel-only layout that can be imported into another patch |
| Print sheet / Save as PDF | Browser print layout; choose “Save as PDF” in the print dialog |
| OMNI patch JSON | Full patch data, including the optional front-panel layout |

Rulers, grids, guides, safe margins, selections and measurements are editor overlays; they are not exported as part of the instrument faceplate. The PDF workflow uses the browser's print dialog. It is not a native vector PDF authoring pipeline.

Native CAD/B-rep export, constraint solving, and manufacturer-ready mechanical drawings are not implemented. SVG is the vector interchange format for the current studio; it is not a CAD model.

## Performance and design inspection

The Performance Report provides a snapshot of visible and hidden component counts, a per-type breakdown, SVG source size, and the time spent in the most recent synchronous editor DOM build. That timing does **not** include browser paint, GPU compositing, audio rendering, or end-to-end interaction latency.

The Design Check is a geometry and binding review. It is not a substitute for listening to the instrument, testing MIDI hardware, or checking the design on target screen sizes. Use Test Panel to try the live controls, and return to Engine View for audio/MIDI routing and performance diagnostics.

## Manual verification

After making changes to the editor, run the automated checks and then verify the interaction paths in a current desktop browser.

- Open an existing patch with no `frontPanel` member and confirm it receives a starter front panel without changing the sound graph.
- Switch between Engine View and Front-end View. Confirm the selector remains centred and the theme toggle is immediately to the left of the account control.
- Search the component library, expand and collapse categories, add a knob and keyboard, and drag a slider onto the faceplate.
- Change each inspector tab. Change the knob finish and colours, alter the keyboard octave count, bind a control to a module parameter, and confirm the live engine value follows it.
- Move, resize, duplicate, hide, lock, reorder, align, and distribute components. Verify grid, snapping, guides and measurements.
- Enter Test Panel mode. Play and release keyboard keys and pads; move pitch/modulation wheels and bound controls. Confirm components cannot be moved while test mode is enabled, then exit.
- Run Design Check on a clean layout and on an intentionally overlapping or unbound layout.
- Open the visual preview. Export SVG, PNG at 1× / 2× / 3×, JPEG at 1× / 2×, front-panel JSON, and a print sheet. Reimport a panel JSON file and confirm its layout is validated.
- Open an exported SVG at a different zoom level and verify that the typography and control shapes remain crisp. Check PNG/JPEG dimensions against the selected scale.
- Test both dark and light themes, a narrow window, and a larger panel with many components. Confirm that menus and dialogs remain usable and that the canvas can be scrolled.

## Data and validation

The panel is stored under the patch's optional `frontPanel` property. Geometry, component types, colours, material names, guides, measurements, and engine bindings are validated by the existing OMNI patch validator. A front-panel-only JSON import passes through that validator before replacing the current panel. Legacy patches without panel data remain supported.
