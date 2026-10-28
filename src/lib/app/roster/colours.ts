import { SHIFT_COLOURS } from '#lib/schemas/enums.js';

// Literal class names (Tailwind scans for them), in SHIFT_COLOURS order.
const SHIFT_CLASSES = [
	'bg-shift-1 text-shift-foreground',
	'bg-shift-2 text-shift-foreground',
	'bg-shift-3 text-shift-foreground',
	'bg-shift-4 text-shift-foreground',
	'bg-shift-5 text-shift-foreground',
	'bg-shift-6 text-shift-foreground',
	'bg-shift-7 text-shift-foreground',
	'bg-shift-8 text-shift-foreground'
] as const;

/** Background + text token classes of a shift's palette key (an unknown key gets the last swatch). */
export function shiftColourClass(colour: string): string {
	const index = (SHIFT_COLOURS as readonly string[]).indexOf(colour);
	return SHIFT_CLASSES[index === -1 ? SHIFT_CLASSES.length - 1 : index];
}
