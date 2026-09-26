/**
 * The rules of the format checker widget (`widgets/FormatChecker.astro`), a
 * port of `site/examples/concepts/structured-output/check_items.py`, which
 * stays in CI as the lesson's proof. The widget prints the lines the Python
 * checker prints, so the lesson's `text` fences hold both.
 *
 * The Python rules are copied as they are, including the Python meaning of
 * `str.strip()` (its whitespace set, `PY_SPACE`), of `str.splitlines()`
 * (`pySplitLines`) and of `str()` on a JSON value (`pyStr`), and the
 * pattern `datetime.strptime` builds for `%Y-%m-%d` (`isDate`).
 *
 * Where JavaScript can't see what Python sees, the result can differ. Each
 * case below is about input no chat assistant writes for an action list:
 *
 * - `JSON.parse` rejects `NaN` and `Infinity`, which `json.loads` accepts.
 * - A JSON number prints the JavaScript way (`1` for `1.0`, `1e-7` for
 *   `1e-07`), because `JSON.parse` keeps no trace of how it was written. No
 *   check passes or fails on how a number prints.
 * - A JSON object lists keys that look like integers first, so the order of
 *   the keys in a message can differ.
 * - The error text after "not valid JSON:" is the browser's.
 * - `isDate` takes ASCII digits only, where `strptime` also takes other
 *   Unicode decimal digits.
 * - `pyStr` escapes the control characters below U+00A0 in a quoted string,
 *   and leaves other characters Python would escape as they are.
 */

/** What the checker accepts: the field names every item needs, and the allowed priorities. */
export interface CheckerConfig {
	fields: readonly string[];
	priorities: readonly string[];
}

/** `FIELDS` and `PRIORITIES` in `check_items.py`. */
export const DEFAULT_CONFIG: CheckerConfig = {
	fields: ['owner', 'task', 'due', 'priority'],
	priorities: ['high', 'medium', 'low'],
};

/**
 * One item as the parser read it. `fields` keeps the names in the order they
 * first appeared, like a Python dict. `unnamed` holds the parts of a line
 * without a `name:`, which `check_items.py` keeps under the key `None`.
 */
export interface Item {
	fields: Map<string, unknown>;
	unnamed: string[];
}

/** One line of the report, as `check_items.py` prints it. */
export interface ReportLine {
	ok: boolean;
	text: string;
}

/** The whole report: its lines, and the summary line, which a file-level error has none of. */
export interface Report {
	lines: ReportLine[];
	summary: string | null;
	passed: number;
	total: number;
}

/** The characters Python's `str.strip()` removes (`str.isspace()`). */
const PY_SPACE = '\\t\\n\\v\\f\\r\\x1c-\\x1f \\x85\\xa0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000';
const LEADING = new RegExp(`^[${PY_SPACE}]+`);
const TRAILING = new RegExp(`[${PY_SPACE}]+$`);

/** Python's `str.strip()`. */
export function pyStrip(text: string): string {
	return text.replace(LEADING, '').replace(TRAILING, '');
}

/** Python's `str.lstrip()`. */
function pyLstrip(text: string): string {
	return text.replace(LEADING, '');
}

/** The line boundaries of Python's `str.splitlines()`. */
// biome-ignore lint/suspicious/noControlCharactersInRegex: Python's splitlines() breaks at \x1c to \x1e, so the port has to as well
const LINE_BREAK = /\r\n|[\n\r\v\f\x1c\x1d\x1e\x85\u2028\u2029]/;

/** Python's `str.splitlines()`: no empty last line after a final line break, and none at all for "". */
export function pySplitLines(text: string): string[] {
	if (text === '') return [];
	const lines = text.split(LINE_BREAK);
	if (lines[lines.length - 1] === '') lines.pop();
	return lines;
}

/** Python's `repr()` of a string: single quotes unless the text holds a `'` and no `"`. */
function pyStringRepr(text: string): string {
	const quote = text.includes("'") && !text.includes('"') ? '"' : "'";
	let out = '';
	for (const ch of text) {
		const code = ch.codePointAt(0) ?? 0;
		if (ch === '\\' || ch === quote) out += `\\${ch}`;
		else if (ch === '\n') out += '\\n';
		else if (ch === '\r') out += '\\r';
		else if (ch === '\t') out += '\\t';
		else if (code < 0x20 || (code >= 0x7f && code < 0xa0)) out += `\\x${code.toString(16).padStart(2, '0')}`;
		else out += ch;
	}
	return quote + out + quote;
}

/** Python's `repr()` of a value that `json.loads` returned. */
function pyRepr(value: unknown): string {
	if (value === null) return 'None';
	if (value === true) return 'True';
	if (value === false) return 'False';
	if (typeof value === 'string') return pyStringRepr(value);
	if (Array.isArray(value)) return `[${value.map(pyRepr).join(', ')}]`;
	if (typeof value === 'object') {
		const parts = Object.entries(value).map(([k, v]) => `${pyStringRepr(k)}: ${pyRepr(v)}`);
		return `{${parts.join(', ')}}`;
	}
	return String(value);
}

/** Python's `str()` of a value that `json.loads` returned. */
export function pyStr(value: unknown): string {
	return typeof value === 'string' ? value : pyRepr(value);
}

/** `strip_fences`: drop the code fence lines a chat tool may wrap its answer in. */
function stripFences(text: string): string {
	return pySplitLines(text)
		.filter((line) => !pyStrip(line).startsWith('```'))
		.join('\n');
}

/** `parse_lines`: one item per non-empty line, fields as `name: value` separated by `|`. */
function parseLines(text: string): Item[] {
	const items: Item[] = [];
	for (const line of pySplitLines(text)) {
		if (!pyStrip(line)) continue;
		const item: Item = { fields: new Map(), unnamed: [] };
		for (const part of line.split('|')) {
			const at = part.indexOf(':');
			if (at >= 0) item.fields.set(pyStrip(part.slice(0, at)), pyStrip(part.slice(at + 1)));
			else item.unnamed.push(pyStrip(part));
		}
		items.push(item);
	}
	return items;
}

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** `parse`: the items, or the message that says why the text holds none the checker can read. */
export function parse(input: string): { items: Item[]; error: string | null } {
	const text = pyStrip(stripFences(input));
	if (!text) return { items: [], error: 'the answer is empty' };
	if (!text.startsWith('[') && !text.startsWith('{')) {
		const startsJson = pySplitLines(text).some((line) => {
			const start = pyLstrip(line);
			return start.startsWith('[') || start.startsWith('{');
		});
		if (startsJson) return { items: [], error: 'the answer does not start with [ (is there text before the JSON?)' };
		return { items: parseLines(text), error: null };
	}
	let data: unknown;
	try {
		data = JSON.parse(text);
	} catch (e) {
		return { items: [], error: `not valid JSON: ${e instanceof Error ? e.message : String(e)}` };
	}
	if (isObject(data)) {
		const keys = Object.keys(data).join(', ');
		return { items: [], error: `expected a JSON array of objects, got a JSON object with keys: ${keys}` };
	}
	const list = data as unknown[];
	if (!list.every(isObject)) return { items: [], error: 'expected a JSON array of objects, one per item' };
	return { items: list.map((obj) => ({ fields: new Map(Object.entries(obj)), unnamed: [] })), error: null };
}

/**
 * The pattern `datetime.strptime(value, "%Y-%m-%d")` matches (CPython's
 * `_strptime`: `%Y` is four digits, `%m` and `%d` take one or two digits,
 * and `%d` also takes a space before one digit). `isDate` asks for ten
 * characters first, so only two-digit months and days, or a space and a
 * digit for the day, get through.
 */
const STRPTIME_DATE = /^(\d{4})-(1[0-2]|0[1-9]|[1-9])-(3[01]|[12]\d|0[1-9]|[1-9]| [1-9])$/;

function daysInMonth(year: number, month: number): number {
	if (month === 2) return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 29 : 28;
	return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

/** `is_date`: true when `value` is written as YYYY-MM-DD and is a real date. */
export function isDate(value: string): boolean {
	if ([...value].length !== 10) return false;
	const m = STRPTIME_DATE.exec(value);
	if (!m) return false;
	const year = Number(m[1]);
	const month = Number(m[2]);
	const day = Number(m[3]);
	return year >= 1 && day <= daysInMonth(year, month);
}

/**
 * `problems`: every reason this one item would be rejected by the import.
 * As in `check_items.py`, the owner, task, due and priority checks run by
 * name, whatever `config.fields` lists.
 */
export function problems(item: Item, config: CheckerConfig = DEFAULT_CONFIG): string[] {
	const found: string[] = [];
	for (const part of item.unnamed) {
		found.push(`unnamed part "${part}" (every part needs a name: before its value)`);
	}
	const missing = config.fields.filter((f) => !item.fields.has(f));
	const extra = [...item.fields.keys()].filter((k) => !config.fields.includes(k));
	if (missing.length) {
		let text = `missing ${missing.join(', ')}`;
		if (extra.length) text += ` (found ${extra.join(', ')})`;
		found.push(text);
	} else if (extra.length) {
		found.push(`unexpected ${extra.join(', ')}`);
	}
	for (const name of ['owner', 'task']) {
		if (item.fields.has(name) && !pyStrip(pyStr(item.fields.get(name)))) found.push(`${name} is empty`);
	}
	if (item.fields.has('due')) {
		const due = pyStr(item.fields.get('due'));
		if (!isDate(due)) found.push(`due "${due}" is not a date written as YYYY-MM-DD`);
	}
	if (item.fields.has('priority')) {
		const priority = pyStr(item.fields.get('priority'));
		if (!config.priorities.includes(priority)) {
			const allowed = [...config.priorities].sort().join(', ');
			found.push(`priority "${priority}" is not one of ${allowed}`);
		}
	}
	return found;
}

/** `main` and `report`: the lines `check_items.py` prints for this text. */
export function check(text: string, config: CheckerConfig = DEFAULT_CONFIG): Report {
	const parsed = parse(text);
	let error = parsed.error;
	if (error === null && parsed.items.length === 0) error = 'no items found';
	if (error !== null) return { lines: [{ ok: false, text: `FAIL: ${error}` }], summary: null, passed: 0, total: 0 };
	const lines: ReportLine[] = [];
	let passed = 0;
	parsed.items.forEach((item, index) => {
		const number = index + 1;
		const found = problems(item, config);
		if (found.length) {
			for (const reason of found) lines.push({ ok: false, text: `FAIL ${number}: ${reason}` });
		} else {
			passed += 1;
			const values = config.fields.map((f) => pyStr(item.fields.get(f)));
			lines.push({ ok: true, text: `ok ${number}: ${values.join(', ')}` });
		}
	});
	const total = parsed.items.length;
	return { lines, summary: `${passed} of ${total} items pass`, passed, total };
}
