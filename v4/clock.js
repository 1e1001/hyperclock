//#region Utilities
const DAY_NAMES_SHORT = "Mon,Tue,Wed,Thu,Fri,Sat,Sun".split(",");
const DAY_NAMES_LONG = "Monday,Tuesday,Wednesday,Thursday,Friday,Saturday.Sunday".split(",");
const MONTH_NAMES_SHORT = "Jan,Feb,Mar,Apr,May,Jun,Jul,Aug,Sep,Oct,Nov,Dec".split(",");
const MONTH_NAMES_LONG = "January,February,March,April,May,June,July,August,September,October,November,December".split(",");
const FONT_RATIO = 0.5;
// Height of text body relative to font size (measured from a screenshot)
const FONT_WAVE_HEIGHT = 0.735;
// Wave svg is a 1.08x1 aspect ratio, so it clips top & bottom, but not horizontally
const FONT_WAVE_WIDTH = FONT_WAVE_HEIGHT * 1.08;
function string_pad(n, d, f = "0") {
	if ((n ?? null) === null)
		return "/".repeat(d);
	const s = n.toString();
	return s.length > d ? "!".repeat(d) : f === null ? s : s.padStart(d, f);
}
let prev_local_zone = null;
let prev_infrequent = {};
function smart_date(date) {
	return {
		_cache: {
			localobj: date,
			utczone: {name: "Etc/UTC", abbr: "UTC", offset: 0, sign: "±", hour: 0, minute: 0},
			bmtzone: {name: "Europe/Biel", abbr: "BMT", offset: 60, sign: "+", hour: 1, minute: 0},
		},
		value: date.getTime(),
		_lazy(key, fill, ifq) {
			const value = this._cache[key] ?? (this._cache[key] = fill());
			return (ifq && this.infrequent_scope) ? {...value, infrequent: true} : value;
		},
		_obj(zone) {
			return this._lazy(zone + "obj", () => {
				const offset = zone === "utc" ? 0 : zone == "bmt" ? 60 : null;
				if (offset === null)
					throw new RangeError(`bad zone ${zone}`);
				const obj = new Date(this._cache.localobj);
				obj.setMinutes(obj.getMinutes() + obj.getTimezoneOffset() + offset);
				//obj.getTimezoneOffset = function() { return -zone.offset; };
				return obj;
			});
		},
		date(zone) {
			return this._lazy(zone + "date", () => {
				const obj = this._obj(zone);
				// https://weeknumber.net/how-to/javascript
				const week_date = new Date(obj);
				week_date.setDate(week_date.getDate() + 3 - (week_date.getDay() + 6) % 7);
				const week_year = week_date.getFullYear();
				week_date.setHours(0, 0, 0, 0);
				const week1 = new Date(week_date.getFullYear(), 0, 4);
				const week = 1 + Math.round(((week_date.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
				const year_start = new Date(obj);
				const week_day = obj.getDay();
				year_start.setMonth(0, 0);
				return {
					year: obj.getFullYear(),
					month: obj.getMonth() + 1,
					day: obj.getDate(),
					week_day: week_day == 0 ? 7 : week_day,
					week_year,
					week,
					year_day: (obj.getTime() - year_start.getTime()) / 86400000,
				}
			});
		},
		time(zone) {
			return this._lazy(zone + "time", () => {
				const obj = this._obj(zone);
				const hour = obj.getHours();
				const minute = obj.getMinutes();
				const second = obj.getSeconds();
				const ds = hour * 3600 + minute * 60 + second;
				return {
					hour,
					minute,
					second,
					millisecond: obj.getMilliseconds(),
					_ds: ds,
					infrequent: prev_infrequent[zone + "time"] !== ds
				};
			}, true);
		},
		decimal(zone) {
			return this._lazy(zone + "decimal", () => {
				const time = this.time(zone);
				const day_second = (time.hour * 3600000 + time.minute * 60000 + time.second * 1000 + time.millisecond) / 864;
				const ds = Math.floor(day_second);
				return {
					hour: Math.floor(day_second / 10000),
					minute: Math.floor((day_second / 100) % 100),
					second: Math.floor(day_second % 100),
					millisecond: Math.floor((day_second % 1) * 1000),
					_ds: ds,
					infrequent: prev_infrequent[zone + "decimal"] !== ds,
				};
			}, true);
		},
		zone(zone) {
			if (zone === "local") {
				const offset = -this._cache.localobj.getTimezoneOffset();
				const tz_full = Intl.DateTimeFormat().resolvedOptions().timeZone;
				if (prev_local_zone && tz_full === prev_local_zone.name && offset === prev_local_zone.offset)
					return prev_local_zone;
				const offset_abs = Math.abs(offset);
				return prev_local_zone = {
					name: tz_full,
					abbr: tzabbr[tz_full]?.[offset * 60] ?? "¬name",
					offset,
					sign: offset < 0 ? "-" : offset > 0 ? "+" : "±",
					hour: Math.floor(offset_abs / 60),
					minute: offset_abs % 60,
				};
			} else {
				return this._cache[zone + "zone"];
			}
		},
		_scope_infrequent() {
			return {
				...this,
				infrequent_scope: true,
			};
		},
		_commit() {
			for (const key of ["localtime", "utctime", "bmttime", "localdecimal", "utcdecimal", "bmtdecimal"])
				if (this._cache[key])
					prev_infrequent[key] = this._cache[key]._ds;
		}
	}
}
//#endregion
//#region Span types
function span_div(root, props) {
	const e = document.createElement("div");
	e.style.setProperty("--x", root.position.x);
	e.style.setProperty("--y", root.position.y);
	e.style.setProperty("--w", root.position.w);
	e.style.setProperty("--h", root.position.h);
	e.style.setProperty("--f", props.f ?? root.position.h);
	if (root.position.weight)
		e.style.fontWeight = root.position.weight;
	if (root.position.align)
		e.style.textAlign = root.position.align;
	e.style.color = root.color;
	e.innerText = props.text;
	return e;
}
function generic_date_span(prop, width, fill) {
	const [group, value] = prop.split(".");
	return (props, color, zone) => ({
		position: {w: width * props.h * FONT_RATIO, ...props},
		color,
		zone,
		group,
		time_group: group === "decimal" ? "decimal" : "time",
		value,
		init(face) {
			face.append(this.e = span_div(this, {text: string_pad(null, width)}));
		},
		tick(now) {
			if (!now[this.time_group](this.zone).infrequent)
				return;
			debug_span_changed(this.e)
			this.e.innerText = string_pad(now[this.group](this.zone)[this.value], width, fill);
		},
	});
}

// Static text
function TextSpan(props, color, text) {
	return {
		position: {w: text.length * props.h * FONT_RATIO, ...props},
		color,
		text,
		init(face) {
			face.append(span_div(this, {text: this.text}));
		},
	};
}
// Static block of color
function ColorSpan(props, color) {
	return {
		position: {w: props.h, ...props},
		color,
		init(face) {
			const e = document.createElement("div");
			e.style.setProperty("--x", this.position.x);
			e.style.setProperty("--y", this.position.y);
			e.style.setProperty("--w", this.position.w);
			e.style.setProperty("--h", this.position.h);
			e.style.backgroundColor = this.color;
			face.append(e);
		}
	}
}
// Show spans at specific situations
function ToggleSpan(filter, spans) {
	let position = {x: 0, y: 0, w: 0, h: 0}
	if (!(spans instanceof Array)) {
		position = spans.position;
		spans = [spans];
	}
	return {
		position,
		filter,
		spans,
		init(face) {
			this.face = {
				elements: [],
				append(element) {
					this.elements.push(element);
					face.append(element);
				},
			};
			// pre-init all to check for errors
			for (let i = 0; i < this.spans.length; ++i)
				this.spans[i].init(this.face);
		},
		tick(now) {
			const active = filter(now);
			if (active !== (this.face.elements.length > 0)) {
				if (active) {
					now = now._scope_infrequent();
					for (let i = 0; i < this.spans.length; ++i)
						this.spans[i].init(this.face);
				} else {
					while (this.face.elements.length)
						this.face.elements.pop().remove();
				}
			}
			if (active) {
				for (let i = 0; i < this.spans.length; ++i)
					this.spans[i].tick?.(now);
			}
		},
	};
}
// Automatically layout spans horizontally, with numbers for manual offsets
// This is doable as a function that returns a list of spans, not sure if I want that
function LineSpan(props, spans) {
	const result = [];
	let cursor = props.x;
	for (let i = 0; i < spans.length; ++i) {
		const entry = spans[i];
		if (typeof entry === "number") {
			cursor += entry;
		} else {
			const span = entry({...props, x: cursor});
			typeck_span(span, `LineSpan[${i}]`);
			result.push(span);
			cursor += span.position.w;
		}
	}
	return {
		position: {...props, w: cursor - props.x},
		data: result,
		init(face) {
			for (let i = 0; i < this.data.length; ++i)
				this.data[i].init(face);
		},
		tick(now) {
			for (let i = 0; i < this.data.length; ++i)
				this.data[i].tick?.(now);
		},
	};
}
// A wave animation to indicate the passing second, 0 = \, ½ = /
function WaveSpan({x, y, w, h, align}, color, zone, decimal = false) {
	return {
		position: {x, y, w: Math.max(w ?? 0, h * FONT_WAVE_WIDTH), h},
		color,
		zone,
		// different align type
		_align: align ?? "right",
		key: decimal ? "decimal" : "time",
		init(face) {
			const e = span_div(this, {text: "", f: 1});
			// 40% is a magic number
			e.innerHTML = `
			<svg viewBox="0 0 108 100" style="height:${h * FONT_WAVE_HEIGHT}em;position:absolute;${this._align}:0;top:40%;transform:translateY(-40%);">
				<path d="M54 0L4 100M104 0L54 100" fill=none stroke-linecap=square stroke=${this.color} stroke-width=5 />
			</svg>`;
			this.wave = e.firstElementChild.firstElementChild;
			face.append(this.e = e);
		},
		tick(now) {
			debug_span_changed(this.e);
			const t = now[this.key](this.zone).millisecond / 5;
			const d = t < 100 ? `M${t + 4} 0 L4 ${t} L${104 - t} 100` : `M${204 - t} 0 L104 ${t - 100} L${t - 96} 100`;
			this.wave.setAttribute("d", d);
		}
	};
}
// Basic values
// TODO: consider consolidating these into a single "generic format" span w/ automatically determined format width
YearSpan = generic_date_span("date.year", 4);
MonthSpan = generic_date_span("date.month", 2);
DaySpan = generic_date_span("date.day", 2);
WeekYearSpan = generic_date_span("date.week_year", 4);
WeekSpan = generic_date_span("date.week", 2);
WeekDaySpan = generic_date_span("date.week_day", 1);
YearDaySpan = generic_date_span("date.year_day", 3);
function MonthNameSpan(props, color, zone, full) {
	const width = full ? 9 : 3;
	return {
		width,
		position: {w: props.h * width * FONT_RATIO, ...props},
		color,
		zone,
		names: full ? MONTH_NAMES_LONG : MONTH_NAMES_SHORT,
		init(face) {
			face.append(this.e = span_div(this, {text: string_pad(null, this.width)}));
		},
		tick(now) {
			if (!now.time(this.zone).infrequent)
				return;
			debug_span_changed(this.e);
			this.e.innerText = string_pad(this.names[now.date(this.zone).month - 1], width, null);
		},
	};
}
function WeekDayNameSpan(props, color, zone, full) {
	const width = full ? 9 : 3;
	return {
		width,
		position: {w: props.h * width * FONT_RATIO, ...props},
		color,
		zone,
		names: full ? DAY_NAMES_LONG : DAY_NAMES_SHORT,
		init(face) {
			face.append(this.e = span_div(this, {text: string_pad(null, this.width)}));
		},
		tick(now) {
			if (!now.time(this.zone).infrequent)
				return;
			debug_span_changed(this.e);
			this.e.innerText = string_pad(this.names[now.date(this.zone).week_day - 1], width, null);
		},
	};
}
HourSpan = generic_date_span("time.hour", 2);
MinuteSpan = generic_date_span("time.minute", 2);
SecondSpan = generic_date_span("time.second", 2);
function SubsecondSpan(props, color, zone, width = 3) {
	return {
		width,
		position: {w: props.h * width * FONT_RATIO, ...props},
		color,
		zone,
		div: Math.pow(10, 3 - width),
		init(face) {
			face.append(this.e = span_div(this, {text: string_pad(null, this.width)}));
		},
		tick(now) {
			debug_span_changed(this.e);
			this.e.innerText = string_pad(Math.floor(now.time(zone).millisecond / this.div), this.width);
		},
	};
}
DecimalHourSpan = generic_date_span("decimal.hour", 1);
DecimalMinuteSpan = generic_date_span("decimal.minute", 2);
DecimalSecondSpan = generic_date_span("decimal.second", 2);
// TODO: DecimalSubsecondSpan
ZoneSignSpan = generic_date_span("zone.sign" , 1);
ZoneHourSpan = generic_date_span("zone.hour", 2);
ZoneMinuteSpan = generic_date_span("zone.minute", 2);
ZoneAbbrSpan = generic_date_span("zone.abbr", 5, null);
// TODO: ZoneNameSpan (region / city / full)

//#endregion
//#region Elements & config parsing
// TODO: minimize global state?

/** @type {HTMLDivElement} */
const e_canvas_margin = document.getElementById("canvas_margin");
/** @type {HTMLDivElement} */
const e_canvas = document.getElementById("canvas");
/** @type {HTMLDivElement} */
const e_face = document.getElementById("face");
/** @type {HTMLDivElement} */
const e_timing = document.getElementById("timing");

/** @type {HTMLTextAreaElement} */
const e_edit_config = document.getElementById("edit_config");
/** @type {HTMLTextAreaElement} */
const e_edit_log = document.getElementById("edit_log");
/** @type {HTMLButtonElement} */
const e_edit_apply = document.getElementById("edit_apply");
/** @type {HTMLButtonElement} */
const e_edit_save = document.getElementById("edit_save");
/** @type {HTMLButtonElement} */
const e_edit_save_apply = document.getElementById("edit_save_apply");
/** @type {HTMLButtonElement} */
const e_edit_upload = document.getElementById("edit_upload");
/** @type {HTMLButtonElement} */
const e_edit_download = document.getElementById("edit_download");
/** @type {HTMLInputElement} */
const e_dummy_file = document.getElementById("dummy_file");
/** @type {HTMLInputElement} */
const e_dummy_link = document.getElementById("dummy_link");
/** @type {HTMLInputElement} */
const e_date_time = document.getElementById("date_time");
/** @type {HTMLButtonElement} */
const e_date_now = document.getElementById("date_now");
/** @type {HTMLInputElement} */
const e_date_use = document.getElementById("date_use");
/** @type {HTMLInputElement} */
const e_date_step = document.getElementById("date_step");

// Bare minimum for frame() to not error
const FALLBACK_CONFIG = {
	canvas: { pages: 1 },
	face: {size: {w: 1, h: 1, a: 1}},
	spans: [],
};
let current_elements = [];
let current_config = FALLBACK_CONFIG;
let current_page = 0;
// "api" for init call
const face_global = {
	append(element) {
		current_elements.push(element);
		e_face.append(element);
		debug_span_changed(element);
	}
};
function log_error(ctx, e) {
	console.error(e);
	e_edit_log.value += `${ctx}\n${e.toString()}\n${e.stack ?? "<no stack>"}`;
}

function typeck(value, type, name) {
	if (typeof value !== type)
		throw new TypeError(`${name} expected ${type}, got ${typeof value}`);
}

function typeck_span(span, path) {
	typeck(span, "object", path);
	typeck(span.position, "object", path + ".position");
	typeck(span.position.x, "number", path + ".position.x");
	typeck(span.position.y, "number", path + ".position.y");
	typeck(span.position.w, "number", path + ".position.w");
	typeck(span.position.h, "number", path + ".position.h");
	typeck(span.init, "function", path + ".init");
	if (span.tick)
		typeck(span.tick, "function", path + ".tick");
}

function reload_config() {
	e_edit_log.value = "Reloading " + Date.now() + "\n";
	let applied_config = false;
	try {
		// Evaluate config
		const config_func = Function(e_edit_config.value);
		config_func.displayName = "user_config";
		const config = config_func();
		console.log("pending config:", config);
		// Validate config
		typeck(config.canvas ??= {}, "object", "config.canvas");
		typeck(config.canvas.color ??= "black", "string", "config.canvas.color");
		typeck(config.canvas.cursor ??= true, "boolean", "config.canvas.cursor");
		typeck(config.canvas.pages ??= 1, "number", "config.canvas.pages");
		typeck(config.canvas.struts ??= {t: 0, l: 0, r: 0, b: 0}, "object", "config.canvas.struts");
		typeck(config.canvas.struts.t ??= 0, "number", "config.canvas.struts.t");
		typeck(config.canvas.struts.l ??= 0, "number", "config.canvas.struts.l");
		typeck(config.canvas.struts.r ??= 0, "number", "config.canvas.struts.r");
		typeck(config.canvas.struts.b ??= 0, "number", "config.canvas.struts.b");
		typeck(config.face, "object", "config.face");
		typeck(config.face.color ??= "transparent", "string", "config.face.color");
		if (config.face.cursor !== undefined)
			typeck(config.face.cursor ??= true, "boolean", "config.face.cursor");
		typeck(config.face.size, "object", "config.face.size");
		typeck(config.face.size.w, "number", "config.face.size.w");
		typeck(config.face.size.h, "number", "config.face.size.h");
		typeck(config.face.size.a ??= 1, "number", "config.face.size.a");
		typeck(config.face.position ??= {x: 0.5, y: 0.5}, "object", "config.face.position");
		typeck(config.face.position.x, "number", "config.face.position.x");
		typeck(config.face.position.y, "number", "config.face.position.y");
		typeck(config.spans, "object", "config.spans");
		typeck(config.spans.length, "number", "config.spans.length");
		for (let i = 0; i < config.spans.length; ++i)
			typeck_span(config.spans[i], `config.spans[${i}]`);
		// Apply config
		while (current_elements.length)
			current_elements.pop().remove();
		applied_config = true;
		current_config = config;
		e_canvas_margin.style.backgroundColor = config.canvas.color;
		e_canvas_margin.style.cursor = config.canvas.cursor ? "default" : "none";
		e_canvas.style.marginTop = config.canvas.struts.t + "px";
		e_canvas.style.marginLeft = config.canvas.struts.l + "px";
		e_canvas.style.marginRight = config.canvas.struts.r + "px";
		e_canvas.style.marginBottom = config.canvas.struts.b + "px";
		e_face.style.backgroundColor = config.face.color;
		e_face.style.cursor = config.face.cursor === undefined ? null : config.face.cursor ? "default" : "none";
		e_face.style.setProperty("--w", config.face.size.w);
		e_face.style.setProperty("--h", config.face.size.h);
		e_face.style.setProperty("--a", config.face.size.a);
		e_face.style.setProperty("--x", config.face.position.x);
		e_face.style.setProperty("--y", config.face.position.y);
		refresh_face_sizes();
		for (let i = 0; i < config.spans.length; ++i) {
			const span = config.spans[i];
			span.init(face_global);
		}
	} catch (e) {
		log_error("Error reloading", e);
		// Died after config was applied, so kill it
		if (applied_config)
			current_config = FALLBACK_CONFIG;
	}
}
//#endregion
//#region Debug displays & keyboard input
const debug_help_timer = setTimeout(() => document.body.classList.remove("debug_help"), 2000);
let debug_timing_active = false;
/** @type {HTMLDivElement[]} */
let debug_grid_elements = [];
/** @type {[HTMLElement, number][]} */
let debug_grid_active = [];
let debug_pause = false;
let debug_date_change = false;
let prev_client_size = {};
let prev_time = 0;
let prev_date = null;
function debug_grid_refresh(show) {
	while (debug_grid_elements.length)
		debug_grid_elements.pop().remove();
	if (show) {
		document.body.classList.add("debug_grid");
		for (let y = 0; y < current_config.face.size.h; ++y) {
			for (let x = 0; x < current_config.face.size.w; ++x) {
				const e = document.createElement("div");
				debug_grid_elements.push(e);
				e.className = "grid";
				e.style.setProperty("--x", x);
				e.style.setProperty("--y", y);
				e_face.prepend(e);
			}
		}
	} else {
		document.body.classList.remove("debug_grid");
	}
}
function debug_span_changed(element) {
	if (debug_grid_elements.length) {
		element.style.setProperty("--gc", "#0ff3");
		debug_grid_active.push([element, Date.now()]);
	}
}
window.addEventListener("keydown", e => {
	if (e.target.tagName === "TEXTAREA")
		return;
	switch (e.key) {
		case "e":
			document.body.classList.toggle("debug_editor");
			document.body.focus();
			return e.preventDefault();
		case "g":
			debug_grid_refresh(!debug_grid_elements.length);
			return e.preventDefault();
		case "f":
			debug_timing_active = document.body.classList.toggle("debug_timing");
			return e.preventDefault();
		case "p":
			debug_pause = !debug_pause;
			return e.preventDefault();
		case "b":
			if (document.body.classList.contains("debug_editor"))
				e_edit_config.focus();
			return e.preventDefault();
		case "/": case "?":
			document.body.classList.toggle("debug_help");
			clearTimeout(debug_help_timer);
			return e.preventDefault();
		case "ArrowRight": case ' ':
			++current_page;
			current_page %= current_config.canvas.pages;
			return e.preventDefault();
		case "ArrowLeft":
			--current_page;
			current_page += current_config.canvas.pages;
			current_page %= current_config.canvas.pages;
			return e.preventDefault();
	}
}, true);
e_canvas.addEventListener("click", e => {
	++current_page;
	current_page %= current_config.canvas.pages;
	return e.preventDefault();
});
function config_editor_save() {
	if (e_edit_config.value.length) {
		localStorage.setItem("v4_config", e_edit_config.value);
	} else {
		localStorage.removeItem("v4_config");
	}
}
function config_editor_apply() {
	reload_config();
	e_edit_config.focus();
}
e_edit_apply.addEventListener("click", config_editor_apply);
e_edit_save.addEventListener("click", config_editor_save);
e_edit_save_apply.addEventListener("click", () => {
	config_editor_save();
	config_editor_apply();
});
e_dummy_file.addEventListener("change", async () => {
	e_edit_config.value = await e_dummy_file.files[0].text();
	e_edit_config.focus();
});
e_edit_upload.addEventListener("click", () => e_dummy_file.click());
e_edit_download.addEventListener("click", () => {
	e_dummy_link.href = "data:text/plain;charset=utf-8," + encodeURIComponent(e_edit_config.value);
	if (e_dummy_link.download = prompt("file name?", "config.js"))
		e_dummy_link.click();
	e_dummy_link.href = null;
	e_edit_config.focus();
});
e_edit_config.addEventListener("keydown", e => {
	if (!e.ctrlKey)
		return;
	switch (e.key) {
		case "Enter":
			(e.shiftKey ? e_edit_apply : e_edit_save_apply).click();
			return e.preventDefault();
		case "o":
			e_dummy_file.click();
			return e.preventDefault();
		case "s":
			e_edit_download.click();
			return e.preventDefault();
		case "b":
			e_edit_config.blur();
			return e.preventDefault();
	}
});
if (localStorage.getItem("v4_config")) {
	e_edit_config.value = localStorage.getItem("v4_config");
	reload_config();
} else {
	fetch("sample.js").then(r => r.text()).then(t => {
		e_edit_config.value = t;
		reload_config();
	});
}
function date_time_write(date) {
	//date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
	return date.toISOString().slice(0, -1);
}
e_date_now.addEventListener("click", () => {
	// Awful hack
	e_date_time.value = date_time_write(new Date());
	debug_date_change = true;
});
e_date_time.addEventListener("input", () => debug_date_change = true);
e_date_use.addEventListener("input", () => debug_date_change = true);
//#endregion
//#region Main loop
// Stats: count, sum, min, max
let dt_collection = [0, 0, Infinity, 0];
requestAnimationFrame(frame);
function refresh_face_sizes() {
	prev_client_size = {};
	if (debug_grid_elements.length)
		debug_grid_refresh(true);
	current_page = 0;
}
function frame(time) {
	requestAnimationFrame(frame);
	// Frame timings
	time /= 1000;
	const dt = time - prev_time;
	++dt_collection[0];
	dt_collection[1] += dt;
	dt_collection[2] = Math.min(dt_collection[2], dt);
	dt_collection[3] = Math.max(dt_collection[3], dt);
	if (e_date_step.checked) {
		const date = new Date(e_date_time.value + "Z");
		date.setMilliseconds(date.getMilliseconds() + dt * 1000);
		e_date_time.value = date_time_write(date);
	}
	let now;
	if (e_date_use.checked) {
		now = smart_date(new Date(e_date_time.value + "Z"));
		if (debug_date_change)
			now = now._scope_infrequent();
	} else {
		now = smart_date(new Date());
	}
	debug_date_change = false;
	now.page = current_page;
	const now_local = now.time("local");
	if (now_local.infrequent) {
		e_timing.innerText = `max ${(1 / dt_collection[2]).toFixed(1)} / avg ${(dt_collection[0] / dt_collection[1]).toFixed(1)} / min ${(1 / dt_collection[3]).toFixed(1)}`;
		dt_collection = [0, 0, Infinity, 0];
	}
	prev_time = time;

	// Size update
	if (e_canvas.clientWidth !== prev_client_size.w || e_canvas.clientHeight !== prev_client_size.h) {
		prev_client_size = {w: e_canvas.clientWidth, h: e_canvas.clientHeight};
		let new_scale = Math.min(prev_client_size.w / (current_config.face.size.w * current_config.face.size.a), prev_client_size.h / current_config.face.size.h);
		// Consider flooring new_scale if there's misalignment issues
		e_face.style.setProperty("--s", new_scale + "px");
	}
	if (debug_grid_active.length) {
		// Drop any inactive grid segments
		let j = 0;
		debug_grid_active.forEach((e, i) => {
			const progress = now.value - e[1];
			if (progress < 255) {
				e[0].style.setProperty("--gc", `rgba(0,255,${255-progress},0.2)`);
			} else {
				e[0].style.removeProperty("--gc");
				return;
			}
			if (j !== i)
				debug_grid_active[j] = e;
			++j;
		});
		debug_grid_active.length = j;
	}
	if (debug_pause)
		return;
	// Time update
	try {
		for (let i = 0; i < current_config.spans.length; ++i)
			current_config.spans[i].tick?.(now);
	} catch (e) {
		log_error("Error ticking", e);
	}
	now._commit();
}
//#endregion
