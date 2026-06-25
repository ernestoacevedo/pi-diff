/**
 * Side-by-side diff for the edit tool (opencode-style).
 *
 * Re-registers the built-in `edit` tool with a renderer that shows the diff
 * as two aligned columns instead of the default unified vertical format.
 *
 * - Delegates `execute` to the original tool, so behavior is unchanged.
 * - In renderResult, parses the diff string from `details.diff` and renders
 *   each line as `[old] │ [new]` with line numbers and `-`/`+` markers.
 * - Falls back to the unified diff when the terminal is too narrow for two
 *   columns to be readable.
 */

import type { EditToolDetails, ExtensionAPI, Theme } from "@earendil-works/pi-coding-agent";
import { createEditTool, renderDiff } from "@earendil-works/pi-coding-agent";
import { Text, truncateToWidth, visibleWidth, type Component } from "@earendil-works/pi-tui";

type SideKind = "ctx" | "del" | "add" | "blank";

type Side = {
	kind: SideKind;
	lineNum: number;
	content: string;
};

type Row =
	| { kind: "row"; left: Side; right: Side }
	| { kind: "skip" };

/**
 * Parse the display diff produced by `generateDiffString` into paired rows.
 * Each `del` is paired with the next `add` on the same row, so removals and
 * insertions line up across the two columns (opencode style).
 */
function parseDiff(diffText: string): Row[] {
	const lines = diffText.split("\n");
	const rows: Row[] = [];
	let i = 0;
	while (i < lines.length) {
		const line = lines[i];
		if (/^\s+\.\.\.\s*$/.test(line)) {
			rows.push({ kind: "skip" });
			i++;
			continue;
		}
		const m = line.match(/^([+ -])(\d+)\s(.*)$/);
		if (!m) {
			i++;
			continue;
		}
		const sign = m[1];
		const num = parseInt(m[2], 10);
		const content = m[3];
		if (sign === " ") {
			rows.push({
				kind: "row",
				left: { kind: "ctx", lineNum: num, content },
				right: { kind: "ctx", lineNum: num, content },
			});
			i++;
		} else if (sign === "-") {
			const dels: { line: number; content: string }[] = [];
			while (i < lines.length) {
				const mm = lines[i].match(/^-(\d+)\s(.*)$/);
				if (!mm) break;
				dels.push({ line: parseInt(mm[1], 10), content: mm[2] });
				i++;
			}
			const adds: { line: number; content: string }[] = [];
			while (i < lines.length) {
				const mm = lines[i].match(/^\+(\d+)\s(.*)$/);
				if (!mm) break;
				adds.push({ line: parseInt(mm[1], 10), content: mm[2] });
				i++;
			}
			const pairs = Math.max(dels.length, adds.length);
			for (let k = 0; k < pairs; k++) {
				const left: Side = k < dels.length
					? { kind: "del", lineNum: dels[k].line, content: dels[k].content }
					: { kind: "blank", lineNum: 0, content: "" };
				const right: Side = k < adds.length
					? { kind: "add", lineNum: adds[k].line, content: adds[k].content }
					: { kind: "blank", lineNum: 0, content: "" };
				rows.push({ kind: "row", left, right });
			}
		} else if (sign === "+") {
			rows.push({
				kind: "row",
				left: { kind: "blank", lineNum: 0, content: "" },
				right: { kind: "add", lineNum: num, content },
			});
			i++;
		}
	}
	return rows;
}

function pad(s: string, width: number): string {
	const w = visibleWidth(s);
	return w >= width ? s : s + " ".repeat(width - w);
}

function formatSide(side: Side, colWidth: number, lineNumWidth: number, theme: Theme): string {
	if (side.kind === "blank") {
		return pad("", colWidth);
	}
	const marker = side.kind === "del" ? "-" : side.kind === "add" ? "+" : " ";
	const numStr = String(side.lineNum).padStart(lineNumWidth, " ");
	const content = side.content.replace(/\t/g, "   ");
	let styled: string;
	if (side.kind === "del") styled = theme.fg("toolDiffRemoved", content);
	else if (side.kind === "add") styled = theme.fg("toolDiffAdded", content);
	else styled = theme.fg("toolDiffContext", content);
	const line = `${numStr} ${marker} ${styled}`;
	return truncateToWidth(line, colWidth, "…", true);
}

class SideBySideDiff implements Component {
	private cachedWidth?: number;
	private cachedLines?: string[];

	constructor(
		private readonly rows: Row[],
		private readonly theme: Theme,
		private readonly fallback: string | undefined,
	) {}

	invalidate(): void {
		this.cachedWidth = undefined;
		this.cachedLines = undefined;
	}

	render(width: number): string[] {
		if (this.cachedLines && this.cachedWidth === width) {
			return this.cachedLines;
		}

		// ponytail: narrow terminals can't fit two readable columns; fall back.
		if (width < 60 && this.fallback) {
			const fallbackLines = this.fallback.split("\n");
			this.cachedWidth = width;
			this.cachedLines = fallbackLines;
			return fallbackLines;
		}

		const gap = " │ ";
		const gapWidth = visibleWidth(gap);
		const colWidth = Math.max(20, Math.floor((width - gapWidth) / 2));

		let maxLineNum = 1;
		for (const row of this.rows) {
			if (row.kind === "row") {
				if (row.left.lineNum > maxLineNum) maxLineNum = row.left.lineNum;
				if (row.right.lineNum > maxLineNum) maxLineNum = row.right.lineNum;
			}
		}
		const lineNumWidth = String(maxLineNum).length;

		const lines: string[] = [];
		for (const row of this.rows) {
			if (row.kind === "skip") {
				lines.push(
					this.theme.fg("borderMuted", " ".repeat(Math.floor(width / 2) - 1) + "⋮" + " ".repeat(Math.ceil(width / 2) - 1)),
				);
				continue;
			}
			const left = formatSide(row.left, colWidth, lineNumWidth, this.theme);
			const right = formatSide(row.right, colWidth, lineNumWidth, this.theme);
			lines.push(left + gap + right);
		}

		this.cachedWidth = width;
		this.cachedLines = lines;
		return lines;
	}
}

export default function (pi: ExtensionAPI) {
	const cwd = process.cwd();
	const originalEdit = createEditTool(cwd);

	pi.registerTool({
		name: "edit",
		label: "edit",
		description: originalEdit.description,
		parameters: originalEdit.parameters,
		renderShell: "self",

		async execute(toolCallId, params, signal, onUpdate) {
			return originalEdit.execute(toolCallId, params, signal, onUpdate);
		},

		renderCall(args, theme, _context) {
			return new Text(
				theme.fg("toolTitle", theme.bold("edit ")) + theme.fg("accent", args.path),
				0,
				0,
			);
		},

		renderResult(result, { isPartial }, theme, context) {
			if (isPartial) return new Text(theme.fg("warning", "Editing…"), 0, 0);

			const details = result.details as EditToolDetails | undefined;
			const content = result.content[0];
			const errorText = content?.type === "text" ? content.text : "";

			if (context.isError) {
				return new Text(theme.fg("error", errorText), 0, 0);
			}

			if (!details?.diff) {
				return new Text(theme.fg("success", "Applied"), 0, 0);
			}

			const rows = parseDiff(details.diff);
			const fallback = renderDiff(details.diff);
			return new SideBySideDiff(rows, theme, fallback);
		},
	});
}